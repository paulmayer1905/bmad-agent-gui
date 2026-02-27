/**
 * AI Service - Anthropic Claude API integration
 * Handles LLM interactions for BMAD agent chat
 */

const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs').promises;
const path = require('path');

class AIService {
  constructor(options = {}) {
    this.configPath = options.configPath || path.join(
      process.env.HOME || process.env.USERPROFILE, '.bmad', 'ai-config.json'
    );
    this.client = null;
    this.model = 'claude-sonnet-4-20250514';
    this.maxTokens = 4096;
    this.conversations = new Map(); // sessionId -> messages[]
  }

  async initialize() {
    const config = await this.loadConfig();
    if (config.apiKey) {
      this._createClient(config.apiKey);
    }
    if (config.model) this.model = config.model;
    if (config.maxTokens) this.maxTokens = config.maxTokens;
  }

  _createClient(apiKey) {
    this.client = new Anthropic({ apiKey });
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
    // Merge with existing
    const existing = await this.loadConfig();
    const merged = { ...existing, ...config };
    await fs.writeFile(this.configPath, JSON.stringify(merged, null, 2));
    // Reinitialize if API key changed
    if (config.apiKey) {
      this._createClient(config.apiKey);
    }
    if (config.model) this.model = config.model;
    if (config.maxTokens) this.maxTokens = config.maxTokens;
    return merged;
  }

  async getConfig() {
    const config = await this.loadConfig();
    return {
      hasApiKey: !!config.apiKey,
      apiKeyPreview: config.apiKey ? `${config.apiKey.slice(0, 10)}...${config.apiKey.slice(-4)}` : null,
      model: config.model || this.model,
      maxTokens: config.maxTokens || this.maxTokens,
    };
  }

  /**
   * Build system prompt from a BMAD agent definition (.md file content)
   */
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

  /**
   * Start a new chat session with an agent
   */
  async startChat(sessionId, agentDefinition, agentName) {
    const systemPrompt = this.buildSystemPrompt(agentDefinition, agentName);
    this.conversations.set(sessionId, {
      systemPrompt,
      agentName,
      messages: [],
      createdAt: Date.now()
    });
    // Get initial greeting
    return await this.sendMessage(sessionId, null);
  }

  /**
   * Send a message in an existing chat session
   * If userMessage is null, just get the agent's initial greeting
   */
  async sendMessage(sessionId, userMessage) {
    if (!this.client) {
      throw new Error('API_KEY_MISSING');
    }

    const conversation = this.conversations.get(sessionId);
    if (!conversation) {
      throw new Error('SESSION_NOT_FOUND');
    }

    // Add user message to history
    if (userMessage) {
      conversation.messages.push({
        role: 'user',
        content: userMessage
      });
    }

    // If no messages yet (initial greeting), add a starter
    const messages = conversation.messages.length > 0
      ? conversation.messages
      : [{ role: 'user', content: 'Hello, please introduce yourself and tell me how you can help.' }];

    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: this.maxTokens,
        system: conversation.systemPrompt,
        messages: messages,
      });

      const assistantMessage = response.content
        .filter(block => block.type === 'text')
        .map(block => block.text)
        .join('\n');

      // If this was the initial greeting with our injected message, replace
      if (conversation.messages.length === 0) {
        conversation.messages.push(
          { role: 'user', content: 'Hello, please introduce yourself and tell me how you can help.' },
          { role: 'assistant', content: assistantMessage }
        );
      } else {
        conversation.messages.push({
          role: 'assistant',
          content: assistantMessage
        });
      }

      return {
        content: assistantMessage,
        usage: response.usage,
        model: response.model,
        stopReason: response.stop_reason
      };
    } catch (error) {
      if (error.status === 401) {
        throw new Error('INVALID_API_KEY');
      }
      if (error.status === 429) {
        throw new Error('RATE_LIMITED');
      }
      throw new Error(`API_ERROR: ${error.message}`);
    }
  }

  /**
   * Stream a message response (for real-time token display)
   */
  async streamMessage(sessionId, userMessage, onChunk) {
    if (!this.client) {
      throw new Error('API_KEY_MISSING');
    }

    const conversation = this.conversations.get(sessionId);
    if (!conversation) {
      throw new Error('SESSION_NOT_FOUND');
    }

    if (userMessage) {
      conversation.messages.push({
        role: 'user',
        content: userMessage
      });
    }

    const messages = conversation.messages.length > 0
      ? conversation.messages
      : [{ role: 'user', content: 'Hello, please introduce yourself and tell me how you can help.' }];

    try {
      const stream = this.client.messages.stream({
        model: this.model,
        max_tokens: this.maxTokens,
        system: conversation.systemPrompt,
        messages: messages,
      });

      let fullText = '';

      stream.on('text', (text) => {
        fullText += text;
        if (onChunk) onChunk({ type: 'text', text });
      });

      const finalMessage = await stream.finalMessage();

      // Store in history
      if (conversation.messages.length === 0) {
        conversation.messages.push(
          { role: 'user', content: 'Hello, please introduce yourself and tell me how you can help.' },
          { role: 'assistant', content: fullText }
        );
      } else {
        conversation.messages.push({
          role: 'assistant',
          content: fullText
        });
      }

      return {
        content: fullText,
        usage: finalMessage.usage,
        model: finalMessage.model,
        stopReason: finalMessage.stop_reason
      };
    } catch (error) {
      if (error.status === 401) throw new Error('INVALID_API_KEY');
      if (error.status === 429) throw new Error('RATE_LIMITED');
      throw new Error(`API_ERROR: ${error.message}`);
    }
  }

  /**
   * Get conversation history for a session
   */
  getHistory(sessionId) {
    const conversation = this.conversations.get(sessionId);
    if (!conversation) return [];
    return conversation.messages.map(m => ({
      role: m.role,
      content: m.content,
      timestamp: Date.now()
    }));
  }

  /**
   * Clear a chat session
   */
  clearChat(sessionId) {
    this.conversations.delete(sessionId);
    return { success: true };
  }

  /**
   * List active chat sessions
   */
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
    return !!this.client;
  }
}

module.exports = AIService;
