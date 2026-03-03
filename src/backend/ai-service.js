/**
 * AI Service - Multi-provider LLM integration (Ollama + Anthropic + Gemini + OpenAI)
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
        const msg = err.message || err.code || 'connexion refusée';
        reject(new Error(`OLLAMA_CONNECTION_ERROR: ${msg}. Vérifiez qu'Ollama est lancé (ollama serve).`));
      });

      req.write(body);
      req.end();
    });
  }

  async listModels() {
    try {
      const response = await this._fetch('/api/tags', null, 'GET', 5000);
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
      await this._fetch('/api/tags', null, 'GET', 5000);
      return true;
    } catch {
      return false;
    }
  }

  _fetch(endpoint, body, method = 'POST', timeout = 0) {
    return new Promise((resolve, reject) => {
      const url = new URL(endpoint, this.baseUrl);
      const reqModule = url.protocol === 'https:' ? https : http;

      const options = {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : {},
      };
      if (timeout > 0) options.timeout = timeout;

      const req = reqModule.request(url, options, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch { reject(new Error('Invalid JSON response from Ollama')); }
        });
      });

      req.on('error', (err) => {
        const msg = err.message || err.code || 'connexion refusée';
        reject(new Error(`OLLAMA_CONNECTION_ERROR: ${msg}. Vérifiez qu'Ollama est lancé (ollama serve).`));
      });
      if (timeout > 0) {
        req.on('timeout', () => { req.destroy(); reject(new Error('OLLAMA_CONNECTION_ERROR: Timeout de connexion. Vérifiez qu\'Ollama est lancé (ollama serve).')); });
      }
      if (body) req.write(body);
      req.end();
    });
  }
}

// ─── Provider: OpenAI / ChatGPT (paid) ───────────────────────────────────
class OpenAIProvider {
  constructor(config = {}) {
    this.apiKey = config.apiKey;
    this.model = config.model || 'gpt-4o-mini';
    this.baseUrl = 'https://api.openai.com/v1';
  }

  async chat(messages, systemPrompt, maxTokens) {
    if (!this.apiKey) throw new Error('API_KEY_MISSING');

    const body = JSON.stringify({
      model: this.model,
      max_tokens: maxTokens || 4096,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages
      ]
    });

    const response = await this._fetch('/chat/completions', body);

    if (response.error) {
      throw new Error(`OPENAI_ERROR: ${response.error.message || JSON.stringify(response.error)}`);
    }

    const choice = response.choices?.[0];
    return {
      content: choice?.message?.content || '',
      usage: {
        input_tokens: response.usage?.prompt_tokens || 0,
        output_tokens: response.usage?.completion_tokens || 0
      },
      model: response.model || this.model,
      stopReason: choice?.finish_reason || 'stop'
    };
  }

  async streamChat(messages, systemPrompt, maxTokens, onChunk) {
    if (!this.apiKey) throw new Error('API_KEY_MISSING');

    const body = JSON.stringify({
      model: this.model,
      max_tokens: maxTokens || 4096,
      stream: true,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages
      ]
    });

    return new Promise((resolve, reject) => {
      const url = new URL(this.baseUrl + '/chat/completions');
      const req = https.request(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        }
      }, (res) => {
        if (res.statusCode === 401) {
          reject(new Error('OPENAI_ERROR: Clé API invalide'));
          return;
        }
        if (res.statusCode === 429) {
          let data = '';
          res.on('data', (chunk) => data += chunk);
          res.on('end', () => {
            try {
              const json = JSON.parse(data);
              reject(new Error(`OPENAI_RATE_LIMITED: ${json.error?.message || 'Rate limit atteint'}`));
            } catch {
              reject(new Error('OPENAI_RATE_LIMITED: Rate limit atteint'));
            }
          });
          return;
        }
        if (res.statusCode === 402 || res.statusCode === 403) {
          let data = '';
          res.on('data', (chunk) => data += chunk);
          res.on('end', () => {
            try {
              const json = JSON.parse(data);
              reject(new Error(`OPENAI_ERROR: ${json.error?.message || 'Accès refusé'}`));
            } catch {
              reject(new Error('OPENAI_ERROR: Accès refusé (vérifiez votre abonnement OpenAI)'));
            }
          });
          return;
        }

        let fullText = '';
        let buffer = '';

        res.on('data', (chunk) => {
          buffer += chunk.toString();
          const lines = buffer.split('\n');
          buffer = lines.pop();

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const jsonStr = line.slice(6).trim();
            if (jsonStr === '[DONE]') continue;
            if (!jsonStr) continue;
            try {
              const json = JSON.parse(jsonStr);
              const delta = json.choices?.[0]?.delta?.content || '';
              if (delta) {
                fullText += delta;
                if (onChunk) onChunk({ type: 'text', text: delta });
              }
            } catch { /* skip malformed SSE */ }
          }
        });

        res.on('end', () => {
          // Process remaining buffer
          if (buffer.trim()) {
            const lines = buffer.split('\n');
            for (const line of lines) {
              if (!line.startsWith('data: ')) continue;
              const jsonStr = line.slice(6).trim();
              if (jsonStr === '[DONE]' || !jsonStr) continue;
              try {
                const json = JSON.parse(jsonStr);
                const delta = json.choices?.[0]?.delta?.content || '';
                if (delta) {
                  fullText += delta;
                  if (onChunk) onChunk({ type: 'text', text: delta });
                }
              } catch { /* skip */ }
            }
          }
          resolve({
            content: fullText,
            usage: { input_tokens: 0, output_tokens: 0 },
            model: this.model,
            stopReason: 'stop'
          });
        });

        res.on('error', reject);
      });

      req.on('error', (err) => {
        reject(new Error(`OPENAI_CONNECTION_ERROR: ${err.message || 'connexion échouée'}`));
      });

      req.write(body);
      req.end();
    });
  }

  _fetch(endpoint, body) {
    return new Promise((resolve, reject) => {
      const url = new URL(this.baseUrl + endpoint);
      const req = https.request(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        }
      }, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            json._httpStatus = res.statusCode;
            resolve(json);
          }
          catch { reject(new Error('Invalid JSON from OpenAI API')); }
        });
      });

      req.on('error', (err) => {
        reject(new Error(`OPENAI_CONNECTION_ERROR: ${err.message || 'connexion échouée'}`));
      });

      req.write(body);
      req.end();
    });
  }

  async isAvailable() {
    return !!this.apiKey;
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

// ─── Provider: Google Gemini (free tier available) ────────────────────────
class GeminiProvider {
  constructor(config = {}) {
    this.apiKey = config.apiKey;
    this.model = config.model || 'gemini-2.0-flash';
    this.baseUrl = 'https://generativelanguage.googleapis.com/v1beta';
  }

  async chat(messages, systemPrompt, maxTokens) {
    if (!this.apiKey) throw new Error('API_KEY_MISSING');

    const contents = messages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }));

    const body = JSON.stringify({
      contents,
      systemInstruction: { parts: [{ text: systemPrompt }] },
      generationConfig: {
        maxOutputTokens: maxTokens || 4096,
      }
    });

    const url = `${this.baseUrl}/models/${this.model}:generateContent?key=${this.apiKey}`;
    const response = await this._fetch(url, body);

    if (response.error) {
      throw new Error(`GEMINI_ERROR: ${response.error.message || JSON.stringify(response.error)}`);
    }

    const text = response.candidates?.[0]?.content?.parts
      ?.map(p => p.text).join('') || '';
    const usage = response.usageMetadata || {};

    return {
      content: text,
      usage: {
        input_tokens: usage.promptTokenCount || 0,
        output_tokens: usage.candidatesTokenCount || 0
      },
      model: this.model,
      stopReason: response.candidates?.[0]?.finishReason || 'STOP'
    };
  }

  async streamChat(messages, systemPrompt, maxTokens, onChunk) {
    if (!this.apiKey) throw new Error('API_KEY_MISSING');

    const contents = messages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }));

    const body = JSON.stringify({
      contents,
      systemInstruction: { parts: [{ text: systemPrompt }] },
      generationConfig: {
        maxOutputTokens: maxTokens || 4096,
      }
    });

    const url = `${this.baseUrl}/models/${this.model}:streamGenerateContent?alt=sse&key=${this.apiKey}`;

    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(url);
      const req = https.request(parsedUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }, (res) => {
        let fullText = '';
        let buffer = '';
        let lastUsage = null;

        res.on('data', (chunk) => {
          buffer += chunk.toString();
          const lines = buffer.split('\n');
          buffer = lines.pop();

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const jsonStr = line.slice(6).trim();
            if (!jsonStr) continue;
            try {
              const json = JSON.parse(jsonStr);
              if (json.usageMetadata) lastUsage = json.usageMetadata;
              const text = json.candidates?.[0]?.content?.parts
                ?.map(p => p.text).join('') || '';
              if (text) {
                fullText += text;
                if (onChunk) onChunk({ type: 'text', text });
              }
            } catch { /* skip */ }
          }
        });

        res.on('end', () => {
          // Process remaining buffer
          if (buffer.trim()) {
            const lines = buffer.split('\n');
            for (const line of lines) {
              if (!line.startsWith('data: ')) continue;
              try {
                const json = JSON.parse(line.slice(6).trim());
                if (json.usageMetadata) lastUsage = json.usageMetadata;
                const text = json.candidates?.[0]?.content?.parts
                  ?.map(p => p.text).join('') || '';
                if (text) {
                  fullText += text;
                  if (onChunk) onChunk({ type: 'text', text });
                }
              } catch { /* skip */ }
            }
          }
          resolve({
            content: fullText,
            usage: {
              input_tokens: lastUsage?.promptTokenCount || 0,
              output_tokens: lastUsage?.candidatesTokenCount || 0
            },
            model: this.model,
            stopReason: 'STOP'
          });
        });

        res.on('error', reject);
      });

      req.on('error', (err) => {
        const msg = err.message || err.code || 'connexion échouée';
        reject(new Error(`GEMINI_CONNECTION_ERROR: ${msg}`));
      });

      req.write(body);
      req.end();
    });
  }

  _fetch(url, body) {
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(url);
      const req = https.request(parsedUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            json._httpStatus = res.statusCode;
            resolve(json);
          }
          catch { reject(new Error('Invalid JSON from Gemini API')); }
        });
      });

      req.on('error', (err) => {
        const msg = err.message || err.code || 'connexion échouée';
        reject(new Error(`GEMINI_CONNECTION_ERROR: ${msg}`));
      });

      req.write(body);
      req.end();
    });
  }

  async isAvailable() {
    return !!this.apiKey;
  }

  // --- Retry + fallback logic ---
  static FALLBACK_MODELS = [
    'gemini-2.0-flash',
    'gemini-2.0-flash-lite',
    'gemini-1.5-flash',
    'gemini-1.5-pro',
  ];

  async chatWithFallback(messages, systemPrompt, maxTokens) {
    // Build ordered model list: current model first, then fallbacks
    const models = [this.model, ...GeminiProvider.FALLBACK_MODELS.filter(m => m !== this.model)];
    let lastError = null;

    for (const modelId of models) {
      try {
        const result = await this._chatWithModel(modelId, messages, systemPrompt, maxTokens);
        if (modelId !== this.model) {
          result.content = `[Modèle ${this.model} indisponible — basculé sur ${modelId}]\n\n` + result.content;
          result.fallbackModel = modelId;
        }
        return result;
      } catch (err) {
        lastError = err;
        const msg = err.message || '';
        // Only fallback on quota/rate-limit errors
        if (msg.includes('quota') || msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('rate')) {
          console.warn(`Gemini model ${modelId} quota exceeded, trying next...`);
          continue;
        }
        throw err; // Non-quota error, don't fallback
      }
    }
    // All models exhausted
    throw new Error('GEMINI_QUOTA_EXHAUSTED: Quota épuisé sur tous les modèles Gemini. Attendez quelques minutes ou passez à un autre fournisseur (Ollama est gratuit et illimité).');
  }

  async _chatWithModel(modelId, messages, systemPrompt, maxTokens) {
    if (!this.apiKey) throw new Error('API_KEY_MISSING');

    const contents = messages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }));

    const body = JSON.stringify({
      contents,
      systemInstruction: { parts: [{ text: systemPrompt }] },
      generationConfig: { maxOutputTokens: maxTokens || 4096 }
    });

    const url = `${this.baseUrl}/models/${modelId}:generateContent?key=${this.apiKey}`;
    const response = await this._fetch(url, body);

    if (response.error) {
      throw new Error(`GEMINI_ERROR: ${response.error.message || JSON.stringify(response.error)}`);
    }

    const text = response.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';
    const usage = response.usageMetadata || {};

    return {
      content: text,
      usage: {
        input_tokens: usage.promptTokenCount || 0,
        output_tokens: usage.candidatesTokenCount || 0
      },
      model: modelId,
      stopReason: response.candidates?.[0]?.finishReason || 'STOP'
    };
  }

  async streamChatWithFallback(messages, systemPrompt, maxTokens, onChunk) {
    const models = [this.model, ...GeminiProvider.FALLBACK_MODELS.filter(m => m !== this.model)];
    let lastError = null;

    for (const modelId of models) {
      try {
        if (modelId !== this.model) {
          onChunk({ type: 'text', text: `[Modèle ${this.model} indisponible — basculé sur ${modelId}]\n\n` });
        }
        return await this._streamWithModel(modelId, messages, systemPrompt, maxTokens, onChunk);
      } catch (err) {
        lastError = err;
        const msg = err.message || '';
        if (msg.includes('quota') || msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('rate')) {
          console.warn(`Gemini stream model ${modelId} quota exceeded, trying next...`);
          continue;
        }
        throw err;
      }
    }
    throw new Error('GEMINI_QUOTA_EXHAUSTED: Quota épuisé sur tous les modèles Gemini. Attendez quelques minutes ou passez à un autre fournisseur.');
  }

  async _streamWithModel(modelId, messages, systemPrompt, maxTokens, onChunk) {
    if (!this.apiKey) throw new Error('API_KEY_MISSING');

    const contents = messages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }));

    const body = JSON.stringify({
      contents,
      systemInstruction: { parts: [{ text: systemPrompt }] },
      generationConfig: { maxOutputTokens: maxTokens || 4096 }
    });

    const url = `${this.baseUrl}/models/${modelId}:streamGenerateContent?alt=sse&key=${this.apiKey}`;

    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(url);
      const req = https.request(parsedUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }, (res) => {
        // Check for HTTP error status before streaming
        if (res.statusCode === 429 || res.statusCode === 403) {
          let data = '';
          res.on('data', (chunk) => data += chunk);
          res.on('end', () => {
            try {
              const json = JSON.parse(data);
              reject(new Error(`GEMINI_ERROR: ${json.error?.message || 'quota exceeded'}`));
            } catch {
              reject(new Error('GEMINI_ERROR: quota exceeded (HTTP ' + res.statusCode + ')'));
            }
          });
          return;
        }

        let fullText = '';
        let buffer = '';
        let lastUsage = null;

        res.on('data', (chunk) => {
          buffer += chunk.toString();
          const lines = buffer.split('\n');
          buffer = lines.pop();

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const jsonStr = line.slice(6).trim();
            if (!jsonStr) continue;
            try {
              const json = JSON.parse(jsonStr);
              if (json.error) {
                reject(new Error(`GEMINI_ERROR: ${json.error.message || 'streaming error'}`));
                return;
              }
              if (json.usageMetadata) lastUsage = json.usageMetadata;
              const text = json.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';
              if (text) {
                fullText += text;
                if (onChunk) onChunk({ type: 'text', text });
              }
            } catch { /* skip */ }
          }
        });

        res.on('end', () => {
          if (buffer.trim()) {
            const lines = buffer.split('\n');
            for (const line of lines) {
              if (!line.startsWith('data: ')) continue;
              try {
                const json = JSON.parse(line.slice(6).trim());
                if (json.usageMetadata) lastUsage = json.usageMetadata;
                const text = json.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';
                if (text) {
                  fullText += text;
                  if (onChunk) onChunk({ type: 'text', text });
                }
              } catch { /* skip */ }
            }
          }
          resolve({
            content: fullText,
            usage: {
              input_tokens: lastUsage?.promptTokenCount || 0,
              output_tokens: lastUsage?.candidatesTokenCount || 0
            },
            model: modelId,
            stopReason: 'STOP'
          });
        });

        res.on('error', reject);
      });

      req.on('error', (err) => {
        const msg = err.message || err.code || 'connexion échouée';
        reject(new Error(`GEMINI_CONNECTION_ERROR: ${msg}`));
      });

      req.write(body);
      req.end();
    });
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
    const defaultModels = { ollama: 'llama3.1', anthropic: 'claude-sonnet-4-20250514', gemini: 'gemini-2.0-flash', openai: 'gpt-4o-mini' };
    this.model = config.model || defaultModels[this.providerName] || 'llama3.1';
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
    } else if (this.providerName === 'gemini') {
      this.provider = new GeminiProvider({
        apiKey: config.geminiApiKey,
        model: this.model
      });
    } else if (this.providerName === 'openai') {
      this.provider = new OpenAIProvider({
        apiKey: config.openaiApiKey,
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
      hasGeminiKey: !!config.geminiApiKey,
      geminiKeyPreview: config.geminiApiKey ? `${config.geminiApiKey.slice(0, 8)}...${config.geminiApiKey.slice(-4)}` : null,
      hasOpenaiKey: !!config.openaiApiKey,
      openaiKeyPreview: config.openaiApiKey ? `${config.openaiApiKey.slice(0, 8)}...${config.openaiApiKey.slice(-4)}` : null,
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

  async validateApiKey(providerName, apiKey) {
    try {
      if (providerName === 'gemini') {
        // Step 1: Check key can list models
        const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
        const listResult = await new Promise((resolve, reject) => {
          const parsedUrl = new URL(listUrl);
          const req = https.request(parsedUrl, { method: 'GET' }, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
              try {
                const json = JSON.parse(data);
                if (json.error) {
                  resolve({ valid: false, error: json.error.message || 'Clé invalide' });
                } else {
                  resolve({ valid: true, models: (json.models || []).map(m => m.name) });
                }
              } catch {
                resolve({ valid: false, error: 'Réponse invalide' });
              }
            });
          });
          req.on('error', (err) => {
            resolve({ valid: false, error: err.message || 'Erreur de connexion' });
          });
          req.end();
        });

        if (!listResult.valid) return listResult;

        // Step 2: Test actual generation with a minimal call
        const testModel = 'gemini-2.0-flash-lite'; // cheapest model
        const genUrl = `https://generativelanguage.googleapis.com/v1beta/models/${testModel}:generateContent?key=${apiKey}`;
        const genBody = JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: 'Hi' }] }],
          generationConfig: { maxOutputTokens: 5 }
        });

        const genResult = await new Promise((resolve) => {
          const parsedUrl = new URL(genUrl);
          const req = https.request(parsedUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
          }, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
              try {
                const json = JSON.parse(data);
                if (res.statusCode === 429 || (json.error && (
                  json.error.message?.includes('quota') ||
                  json.error.message?.includes('RESOURCE_EXHAUSTED') ||
                  json.error.status === 'RESOURCE_EXHAUSTED'
                ))) {
                  // Check if limit is 0 (never had access) vs. temporarily exhausted
                  const msg = json.error?.message || '';
                  if (msg.includes('limit: 0')) {
                    resolve({
                      valid: false,
                      error: `Clé valide mais quota = 0 pour ${testModel}. Votre clé API n'a pas accès au free tier de Gemini. Recréez-la sur https://aistudio.google.com/apikey (les clés Google Cloud Console n'ont pas toujours le free tier activé). En UE, certains modèles peuvent être indisponibles.`
                    });
                  } else {
                    resolve({ valid: true, note: 'Clé valide (quota temporairement atteint, réessayez dans 1-2 min)' });
                  }
                } else if (json.error) {
                  if (res.statusCode === 400 && json.error.message?.includes('API_KEY_INVALID')) {
                    resolve({ valid: false, error: 'Clé API invalide' });
                  } else if (res.statusCode === 403) {
                    resolve({ valid: false, error: `Accès refusé: ${json.error.message || 'API non activée'}` });
                  } else {
                    // Other error but key worked for listing - probably valid
                    resolve({ valid: true, note: `Clé valide (${json.error.message || 'avertissement mineur'})` });
                  }
                } else {
                  resolve({ valid: true, note: `Clé valide, ${testModel} fonctionne ✓` });
                }
              } catch {
                resolve({ valid: true, note: 'Clé probablement valide (réponse inattendue au test)' });
              }
            });
          });
          req.on('error', (err) => {
            resolve({ valid: true, note: `Clé valide pour lister les modèles (test génération échoué: ${err.message})` });
          });
          req.write(genBody);
          req.end();
        });

        return genResult;
      } else if (providerName === 'openai') {
        // Test with a minimal OpenAI call
        const testBody = JSON.stringify({
          model: 'gpt-4o-mini',
          max_tokens: 5,
          messages: [{ role: 'user', content: 'Hi' }]
        });
        const openaiResult = await new Promise((resolve) => {
          const url = new URL('https://api.openai.com/v1/chat/completions');
          const req = https.request(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`
            }
          }, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
              try {
                const json = JSON.parse(data);
                if (res.statusCode === 401) {
                  resolve({ valid: false, error: 'Clé API invalide' });
                } else if (res.statusCode === 429) {
                  resolve({ valid: true, note: 'Clé valide (rate limit temporaire)' });
                } else if (res.statusCode === 402 || res.statusCode === 403) {
                  resolve({ valid: false, error: json.error?.message || 'Accès refusé — vérifiez votre abonnement OpenAI' });
                } else if (json.error) {
                  // Insufficient quota = key is valid but no credits
                  if (json.error.code === 'insufficient_quota') {
                    resolve({ valid: false, error: 'Clé valide mais solde épuisé. Rechargez votre compte sur platform.openai.com/account/billing' });
                  }
                  resolve({ valid: false, error: json.error.message || 'Erreur OpenAI' });
                } else {
                  resolve({ valid: true, note: 'Clé valide, gpt-4o-mini fonctionne ✓' });
                }
              } catch {
                resolve({ valid: false, error: 'Réponse invalide' });
              }
            });
          });
          req.on('error', (err) => {
            resolve({ valid: false, error: err.message || 'Erreur de connexion' });
          });
          req.write(testBody);
          req.end();
        });
        return openaiResult;
      } else if (providerName === 'anthropic') {
        // Test with the Anthropic SDK
        try {
          const Anthropic = require('@anthropic-ai/sdk');
          const client = new Anthropic({ apiKey });
          await client.messages.create({
            model: 'claude-3-5-haiku-20241022',
            max_tokens: 5,
            messages: [{ role: 'user', content: 'Hi' }]
          });
          return { valid: true };
        } catch (err) {
          if (err.status === 401) return { valid: false, error: 'Clé API invalide' };
          if (err.status === 403) return { valid: false, error: 'Clé API sans permission' };
          if (err.status === 429) return { valid: true, note: 'Clé valide (rate limit atteint)' };
          // If error is about billing, key is valid but no credit
          if (err.status === 400) return { valid: true, note: 'Clé valide' };
          return { valid: false, error: err.message || 'Erreur inconnue' };
        }
      }
      return { valid: false, error: 'Provider inconnu' };
    } catch (err) {
      return { valid: false, error: err.message || 'Erreur de validation' };
    }
  }

  buildSystemPrompt(agentDefinition, agentName) {
    // Detect if this is the UX agent for Figma-specific instructions
    const isUxAgent = agentDefinition.includes('ux-expert') || agentDefinition.includes('UX Expert') || agentName.toLowerCase().includes('ux');

    let figmaInstructions = '';
    if (isUxAgent) {
      figmaInstructions = `

FIGMA-COMPATIBLE DESIGN OUTPUT:
You have a special capability: generating SVG wireframes and mockups that can be imported directly into Figma.

When the user asks for wireframes, mockups, UI designs, or Figma-compatible output:
1. Generate complete, well-structured SVG code wrapped in a \`\`\`svg code block
2. Use proper SVG structure with viewBox, named groups (<g id="...">), and layers
3. Include text elements with proper font-family (Inter, system-ui, sans-serif)
4. Use a design system approach:
   - Rectangles with rounded corners (rx="8") for cards/buttons
   - Proper spacing (8px grid)
   - Colors as CSS variables or hex codes with comments
   - Group related elements in <g> tags with descriptive IDs (e.g., id="header", id="sidebar", id="card-1")
5. The SVG MUST be self-contained and directly importable into Figma
6. Each component/section should be a named group so it becomes a layer in Figma
7. Add a comment at the top: <!-- Figma-compatible wireframe - Import via File > Import -->

Available design patterns you can generate:
- Full page wireframes (desktop/mobile)
- Component libraries (buttons, cards, forms, navbars)
- User flow diagrams
- Responsive layout grids
- Icon sets
- Design tokens visualization

When generating SVGs, ALWAYS remind the user they can download the file and import it into Figma via "File > Place image" or drag-and-drop, and that all groups/layers will be editable.

You can also generate:
- HTML/CSS prototypes (wrapped in \`\`\`html code blocks)
- Design token files (JSON format for Figma Tokens plugin)

FIGMA EXPORT UPLOAD & MODIFICATION:
The user can upload SVG files exported from Figma (via the 📎 button). When a SVG file is uploaded:
1. Analyze the structure: groups, layers, elements, colors, typography, layout
2. Provide a clear description of what you see in the design
3. Ask what modifications the user wants (unless they already specified)
4. Generate a MODIFIED version in a new \`\`\`svg code block, preserving the original structure/IDs where possible
5. Explain what you changed so the user can verify
6. Keep Figma-compatible structure (named groups, viewBox, etc.)

When modifying SVGs: preserve existing group IDs and layer names, maintain the viewBox dimensions unless asked to change them, and ensure the output stays Figma-importable.

IMPORTANT: Make SVGs detailed and professional. Use proper typography, spacing, and visual hierarchy.`;
    }

    return `You are operating as a BMAD-METHOD agent. Your complete agent definition follows below.
Read it carefully and adopt the persona, role, and behavior described.

IMPORTANT RULES:
- Stay in character at all times
- Follow your activation-instructions
- Use your defined commands when the user invokes them with * prefix
- Be helpful, concise, and follow your persona's style
- When referencing tasks or checklists, describe them clearly
- You are running inside the BMAD Agent GUI desktop application
- When you generate code blocks (SVG, HTML, CSS, JSON, etc.), the user can export them as files directly from the chat
${figmaInstructions}
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

    // Use non-streaming for greeting but with proper error handling
    try {
      return await this.sendMessage(sessionId, null);
    } catch (error) {
      // Clean up the conversation on failure
      this.conversations.delete(sessionId);
      throw error;
    }
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
      // Use fallback-enabled chat for Gemini
      const chatMethod = (this.providerName === 'gemini' && this.provider.chatWithFallback)
        ? this.provider.chatWithFallback.bind(this.provider)
        : this.provider.chat.bind(this.provider);
      const result = await chatMethod(messages, conversation.systemPrompt, this.maxTokens);

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
      // Use fallback-enabled streaming for Gemini
      const streamMethod = (this.providerName === 'gemini' && this.provider.streamChatWithFallback)
        ? this.provider.streamChatWithFallback.bind(this.provider)
        : this.provider.streamChat.bind(this.provider);
      const result = await streamMethod(messages, conversation.systemPrompt, this.maxTokens, onChunk);

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
    if (error.message?.startsWith('GEMINI_CONNECTION_ERROR')) throw error;
    if (error.message?.startsWith('GEMINI_QUOTA_EXHAUSTED')) throw error;
    if (error.message?.startsWith('OPENAI_CONNECTION_ERROR')) throw error;
    if (error.message?.startsWith('OPENAI_RATE_LIMITED')) throw error;
    if (error.message?.startsWith('OPENAI_ERROR')) throw error;
    if (error.message?.startsWith('GEMINI_ERROR')) {
      if (error.message.includes('quota') || error.message.includes('RESOURCE_EXHAUSTED')) {
        throw new Error('GEMINI_QUOTA_EXHAUSTED: Quota Gemini épuisé. Attendez 1-2 minutes ou changez de fournisseur dans Paramètres IA.');
      }
      throw error;
    }
    if (error.message?.startsWith('API_KEY_MISSING')) throw error;
    if (error.status === 401) throw new Error('INVALID_API_KEY');
    if (error.status === 429) throw new Error('RATE_LIMITED: Rate limit atteint. Attendez quelques secondes et réessayez.');
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

  /**
   * Add file content to a conversation as context.
   * @param {string} sessionId
   * @param {Object} processed - Output from file-processor.processFile()
   * @param {string} formattedText - Output from file-processor.formatFileForLLM()
   * @returns {Object} { success, fileName, fileType, note }
   */
  addFileToConversation(sessionId, processed, formattedText) {
    const conversation = this.conversations.get(sessionId);
    if (!conversation) throw new Error('SESSION_NOT_FOUND');

    if (processed.error) {
      return { success: false, fileName: processed.fileName, error: processed.error };
    }

    // For images on vision-capable providers, store base64 for multimodal use
    if (processed.fileType === 'image' && processed.base64Data) {
      const supportsVision = ['openai', 'gemini', 'anthropic'].includes(this.providerName);
      if (supportsVision) {
        // Store image data in conversation for next message
        if (!conversation.pendingFiles) conversation.pendingFiles = [];
        conversation.pendingFiles.push({
          type: 'image',
          fileName: processed.fileName,
          mimeType: processed.mimeType,
          base64Data: processed.base64Data,
        });
      }
    }

    // For Figma/SVG uploads, add modification instructions if this is the UX agent
    if (processed.fileType === 'figma') {
      const isUxAgent = conversation.agentName?.includes('ux') || conversation.systemPrompt?.includes('UX Expert');
      if (isUxAgent) {
        // Store SVG content for reference
        if (!conversation.pendingFiles) conversation.pendingFiles = [];
        conversation.pendingFiles.push({
          type: 'figma-svg',
          fileName: processed.fileName,
          mimeType: 'image/svg+xml',
          elementCount: processed.elementCount || 0,
        });
      }
    }

    // Always add text representation as a user message for context
    conversation.messages.push({
      role: 'user',
      content: formattedText
    });

    return {
      success: true,
      fileName: processed.fileName,
      fileType: processed.fileType,
      size: processed.size,
      note: processed.note || null,
      hasVisionData: !!(processed.fileType === 'image' && processed.base64Data),
    };
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
    if (this.providerName === 'gemini') return !!(this.provider && this.provider.apiKey);
    if (this.providerName === 'openai') return !!(this.provider && this.provider.apiKey);
    return !!(this.provider && this.provider.client);
  }
}

module.exports = AIService;
