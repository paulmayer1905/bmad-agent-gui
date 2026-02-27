/**
 * AI Service - Multi-provider LLM integration (Ollama + Anthropic)
 * Handles LLM interactions for BMAD agent chat
 */

const fs = require('fs').promises;
const path = require('path');
const http = require('http');
const https = require('https');

// ─── Provider: Ollama (free, local) ───────────────────────────────────────
class OllamaProvider {
  constructor(config = {}) {
    this.baseUrl = config.ollamaUrl || 'http://localhost:11434';
    this.model = config.model || 'llama3.1';
  }

  async chat(messages, systemPrompt, maxTokens) {
    const body = JSON.stringify({
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages
      ],
      stream: false,
      options: {
        num_predict: maxTokens || 4096
      }
    });

    const response = await this._fetch('/api/chat', body);
    return {
      content: response.message?.content || '',
      usage: {
        input_tokens: response.prompt_eval_count || 0,
        output_tokens: response.eval_count || 0
      },
      model: response.model || this.model,
      stopReason: response.done_reason || 'stop'
    };
  }

  async streamChat(messages, systemPrompt, maxTokens, onChunk) {
    const body = JSON.stringify({
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages
      ],
      stream: true,
      options: {
        num_predict: maxTokens || 4096
      }
    });

    return new Promise((resolve, reject) => {
      const url = new URL('/api/chat', this.baseUrl);
      const reqModule = url.protocol === 'https:' ? https : http;

      const req = reqModule.request(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }, (res) => {
        let fullText = '';
        let lastResponse = null;
        let buffer = '';

        res.on('data', (chunk) => {
          buffer += chunk.toString();
          const lines = buffer.split('\n');
          buffer = lines.pop(); // Keep incomplete line

          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const json = JSON.parse(line);
              lastResponse = json;
              if (json.message?.content) {
                fullText += json.message.content;
                if (onChunk) onChunk({ type: 'text', text: json.message.content });
              }
            } catch { /* skip malformed */ }
          }
        });

        res.on('end', () => {
          if (buffer.trim()) {
            try {
              const json = JSON.parse(buffer);
              lastResponse = json;
              if (json.message?.content) {
                fullText += json.message.content;
                if (onChunk) onChunk({ type: 'text', text: json.message.content });
              }
            } catch { /* skip */ }
          }
          resolve({
            content: fullText,
            usage: {
              input_tokens: lastResponse?.prompt_eval_count || 0,
              output_tokens: lastResponse?.eval_count || 0
            },
            model: lastResponse?.model || this.model,
            stopReason: lastResponse?.done_reason || 'stop'
          });
        });

        res.on('error', reject);
      });

      req.on('error', (err) => {
        reject(new Error(`OLLAMA_CONNECTION_ERROR: ${err.message}. Est-ce qu'Ollama est lancé ?`));
      });

      req.write(body);
      req.end();
    });
  }

  async listModels() {
    try {
      const response = await this._fetch('/api/tags', null, 'GET');
      return (response.models || []).map(m => ({
        id: m.name,
        name: m.name,
        size: m.size ? `${(m.size / 1e9).toFixed(1)} GB` : null,
        modified: m.modified_at
      }));
    } catch {
      return [];
    }
  }

  async isAvailable() {
    try {
      await this._fetch('/api/tags', null, 'GET');
      return true;
    } catch {
      return false;
    }
  }

  _fetch(endpoint, body, method = 'POST') {
    return new Promise((resolve, reject) => {
      const url = new URL(endpoint, this.baseUrl);
      const reqModule = url.protocol === 'https:' ? https : http;

      const req = reqModule.request(url, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : {},
        timeout: 5000
      }, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch { reject(new Error('Invalid JSON response from Ollama')); }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Ollama connection timeout')); });
      if (body) req.write(body);
      req.end();
    });
  }
}

// ─── Provider: Anthropic Claude (paid) ────────────────────────────────────
class AnthropicProvider {
  constructor(config = {}) {
    this.apiKey = config.apiKey;
    this.model = config.model || 'claude-sonnet-4-20250514';
    this.client = null;
    if (this.apiKey) this._initClient();
  }

  _initClient() {
    try {
      const Anthropic = require('@anthropic-ai/sdk');
      this.client = new Anthropic({ apiKey: this.apiKey });
    } catch (err) {
      console.warn('Anthropic SDK not available:', err.message);
    }
  }

  async chat(messages, systemPrompt, maxTokens) {
    if (!this.client) throw new Error('API_KEY_MISSING');

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: maxTokens || 4096,
      system: systemPrompt,
      messages: messages,
    });

    const content = response.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('\n');

    return {
      content,
      usage: response.usage,
      model: response.model,
      stopReason: response.stop_reason
    };
  }

  async streamChat(messages, systemPrompt, maxTokens, onChunk) {
    if (!this.client) throw new Error('API_KEY_MISSING');

    const stream = this.client.messages.stream({
      model: this.model,
      max_tokens: maxTokens || 4096,
      system: systemPrompt,
      messages: messages,
    });

    let fullText = '';
    stream.on('text', (text) => {
      fullText += text;
      if (onChunk) onChunk({ type: 'text', text });
    });

    const finalMessage = await stream.finalMessage();

    return {
      content: fullText,
      usage: finalMessage.usage,
      model: finalMessage.model,
      stopReason: finalMessage.stop_reason
    };
  }

  async isAvailable() {
    return !!this.client;
  }
}

// ─── AI Service (orchestrates providers) ──────────────────────────────────
class AIService {
  constructor(options = {}) {
    this.configPath = options.configPath || path.join(
      process.env.HOME || process.env.USERPROFILE, '.bmad', 'ai-config.json'
    );
    this.provider = null;
    this.providerName = 'ollama';
    this.model = 'llama3.1';
    this.maxTokens = 4096;
    this.ollamaUrl = 'http://localhost:11434';
    this.conversations = new Map();
  }

  async initialize() {
    const config = await this.loadConfig();
    this.providerName = config.provider || 'ollama';
    this.model = config.model || (this.providerName === 'ollama' ? 'llama3.1' : 'claude-sonnet-4-20250514');
    this.maxTokens = config.maxTokens || 4096;
    this.ollamaUrl = config.ollamaUrl || 'http://localhost:11434';
    this._initProvider(config);
  }

  _initProvider(config = {}) {
    if (this.providerName === 'anthropic') {
      this.provider = new AnthropicProvider({
        apiKey: config.apiKey,
        model: this.model
      });
    } else {
      this.provider = new OllamaProvider({
        ollamaUrl: this.ollamaUrl,
        model: this.model
      });
    }
  }

  async loadConfig() {
    try {
      const data = await fs.readFile(this.configPath, 'utf8');
      return JSON.parse(data);
    } catch {
      return {};
    }
  }

  async saveConfig(config) {
    const dir = path.dirname(this.configPath);
    await fs.mkdir(dir, { recursive: true });
    const existing = await this.loadConfig();
    const merged = { ...existing, ...config };
    await fs.writeFile(this.configPath, JSON.stringify(merged, null, 2));
    if (config.provider) this.providerName = config.provider;
    if (config.model) this.model = config.model;
    if (config.maxTokens) this.maxTokens = config.maxTokens;
    if (config.ollamaUrl) this.ollamaUrl = config.ollamaUrl;
    this._initProvider(merged);
    return merged;
  }

  async getConfig() {
    const config = await this.loadConfig();
    return {
      provider: config.provider || 'ollama',
      hasApiKey: !!config.apiKey,
      apiKeyPreview: config.apiKey ? `${config.apiKey.slice(0, 10)}...${config.apiKey.slice(-4)}` : null,
      model: config.model || this.model,
      maxTokens: config.maxTokens || this.maxTokens,
      ollamaUrl: config.ollamaUrl || 'http://localhost:11434',
    };
  }

  async getOllamaStatus() {
    const ollama = new OllamaProvider({ ollamaUrl: this.ollamaUrl });
    const available = await ollama.isAvailable();
    let models = [];
    if (available) {
      models = await ollama.listModels();
    }
    return { available, models, url: this.ollamaUrl };
  }

  buildSystemPrompt(agentDefinition, agentName) {
    return `You are operating as a BMAD-METHOD agent. Your complete agent definition follows below.
Read it carefully and adopt the persona, role, and behavior described.

IMPORTANT RULES:
- Stay in character at all times
- Follow your activation-instructions
- Use your defined commands when the user invokes them with * prefix
- Be helpful, concise, and follow your persona's style
- When referencing tasks or checklists, describe them clearly
- You are running inside the BMAD Agent GUI desktop application

--- AGENT DEFINITION START ---
${agentDefinition}
--- AGENT DEFINITION END ---

You are now ${agentName}. Greet the user briefly and await their instructions.`;
  }

  async startChat(sessionId, agentDefinition, agentName) {
    const systemPrompt = this.buildSystemPrompt(agentDefinition, agentName);
    this.conversations.set(sessionId, {
      systemPrompt,
      agentName,
      messages: [],
      createdAt: Date.now()
    });
    return await this.sendMessage(sessionId, null);
  }

  async sendMessage(sessionId, userMessage) {
    if (!this.provider) throw new Error('PROVIDER_NOT_CONFIGURED');

    const conversation = this.conversations.get(sessionId);
    if (!conversation) throw new Error('SESSION_NOT_FOUND');

    if (userMessage) {
      conversation.messages.push({ role: 'user', content: userMessage });
    }

    const messages = conversation.messages.length > 0
      ? conversation.messages
      : [{ role: 'user', content: 'Hello, please introduce yourself and tell me how you can help.' }];

    try {
      const result = await this.provider.chat(messages, conversation.systemPrompt, this.maxTokens);

      if (conversation.messages.length === 0) {
        conversation.messages.push(
          { role: 'user', content: 'Hello, please introduce yourself and tell me how you can help.' },
          { role: 'assistant', content: result.content }
        );
      } else {
        conversation.messages.push({ role: 'assistant', content: result.content });
      }

      return result;
    } catch (error) {
      this._handleError(error);
    }
  }

  async streamMessage(sessionId, userMessage, onChunk) {
    if (!this.provider) throw new Error('PROVIDER_NOT_CONFIGURED');

    const conversation = this.conversations.get(sessionId);
    if (!conversation) throw new Error('SESSION_NOT_FOUND');

    if (userMessage) {
      conversation.messages.push({ role: 'user', content: userMessage });
    }

    const messages = conversation.messages.length > 0
      ? conversation.messages
      : [{ role: 'user', content: 'Hello, please introduce yourself and tell me how you can help.' }];

    try {
      const result = await this.provider.streamChat(messages, conversation.systemPrompt, this.maxTokens, onChunk);

      if (conversation.messages.length === 0) {
        conversation.messages.push(
          { role: 'user', content: 'Hello, please introduce yourself and tell me how you can help.' },
          { role: 'assistant', content: result.content }
        );
      } else {
        conversation.messages.push({ role: 'assistant', content: result.content });
      }

      return result;
    } catch (error) {
      this._handleError(error);
    }
  }

  _handleError(error) {
    if (error.message?.startsWith('OLLAMA_CONNECTION_ERROR')) throw error;
    if (error.message?.startsWith('API_KEY_MISSING')) throw error;
    if (error.status === 401) throw new Error('INVALID_API_KEY');
    if (error.status === 429) throw new Error('RATE_LIMITED');
    throw new Error(`API_ERROR: ${error.message}`);
  }

  getHistory(sessionId) {
    const conversation = this.conversations.get(sessionId);
    if (!conversation) return [];
    return conversation.messages.map(m => ({
      role: m.role,
      content: m.content,
      timestamp: Date.now()
    }));
  }

  clearChat(sessionId) {
    this.conversations.delete(sessionId);
    return { success: true };
  }

  listChats() {
    const chats = [];
    for (const [id, conv] of this.conversations) {
      chats.push({
        sessionId: id,
        agentName: conv.agentName,
        messageCount: conv.messages.length,
        createdAt: conv.createdAt,
        lastMessage: conv.messages.length > 0
          ? conv.messages[conv.messages.length - 1].content.slice(0, 100) + '...'
          : null
      });
    }
    return chats;
  }

  isConfigured() {
    if (this.providerName === 'ollama') return true;
    return !!(this.provider && this.provider.client);
  }
}

module.exports = AIService;
