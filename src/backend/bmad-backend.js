/**
 * BMAD Backend Bridge
 * Connects Electron IPC to the existing BMAD core modules
 */

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const AIService = require('./ai-service');

class BMADBackend {
  constructor(options = {}) {
    this.bmadRoot = options.bmadRoot;
    this.integrationRoot = options.integrationRoot;
    this.coreRoot = options.coreRoot;
    this.basePath = options.basePath || path.join(process.env.HOME || process.env.USERPROFILE, '.bmad');

    // Lazily loaded core modules
    this._messageQueue = null;
    this._elicitationBroker = null;
    this._sessionManager = null;
    this._bmadLoader = null;

    // AI Chat service
    this._aiService = new AIService({
      configPath: path.join(this.basePath, 'ai-config.json')
    });
  }

  async initialize() {
    // Ensure .bmad directory
    await fs.mkdir(this.basePath, { recursive: true });

    // Try to load core modules from integration
    try {
      const MQ = require(path.join(this.integrationRoot, 'core', 'message-queue'));
      this._messageQueue = new MQ({ basePath: this.basePath });
      await this._messageQueue.initialize();

      const EB = require(path.join(this.integrationRoot, 'core', 'elicitation-broker'));
      this._elicitationBroker = new EB(this._messageQueue, { basePath: this.basePath });

      const SM = require(path.join(this.integrationRoot, 'core', 'session-manager'));
      this._sessionManager = new SM(this._messageQueue, this._elicitationBroker, { basePath: this.basePath });
      await this._sessionManager.initialize();

      const Loader = require(path.join(this.integrationRoot, 'core', 'bmad-loader'));
      this._bmadLoader = new Loader({ bmadRoot: this.coreRoot });
    } catch (err) {
      console.warn('Could not load BMAD core modules, running in standalone mode:', err.message);
    }

    // Initialize AI service
    await this._aiService.initialize();
  }

  // ─── Agents ─────────────────────────────────────────────────────────────
  async listAgents() {
    try {
      const agentsDir = path.join(this.coreRoot, 'agents');
      const files = await fs.readdir(agentsDir);
      const agents = [];

      for (const file of files.filter(f => f.endsWith('.md'))) {
        const name = file.replace('.md', '');
        try {
          const metadata = this._bmadLoader
            ? await this._bmadLoader.getAgentMetadata(name)
            : await this._parseAgentBasic(path.join(agentsDir, file), name);
          agents.push(metadata);
        } catch (e) {
          agents.push({ name, id: name, title: name, icon: '🤖' });
        }
      }

      return agents;
    } catch (err) {
      return [];
    }
  }

  async getAgent(name) {
    if (this._bmadLoader) {
      return await this._bmadLoader.loadAgent(name);
    }
    const filePath = path.join(this.coreRoot, 'agents', `${name}.md`);
    const content = await fs.readFile(filePath, 'utf8');
    return { name, rawContent: content };
  }

  async getAgentMetadata(name) {
    if (this._bmadLoader) {
      return await this._bmadLoader.getAgentMetadata(name);
    }
    return { name, id: name, title: name, icon: '🤖' };
  }

  async _parseAgentBasic(filePath, name) {
    const content = await fs.readFile(filePath, 'utf8');
    const titleMatch = content.match(/^#\s+(.+)$/m);
    const iconMap = {
      'bmad-master': '🧙', 'bmad-orchestrator': '🎭', 'pm': '📋',
      'architect': '🏗️', 'dev': '💻', 'qa': '🐛', 'ux-expert': '🎨',
      'sm': '🏃', 'analyst': '📊', 'po': '📦'
    };
    return {
      name,
      id: name,
      title: titleMatch ? titleMatch[1].trim() : name,
      icon: iconMap[name] || '🤖',
      rawContent: content
    };
  }

  // ─── Sessions ───────────────────────────────────────────────────────────
  async listSessions() {
    if (this._sessionManager) {
      const sessions = Array.from(this._sessionManager.activeSessions.values());
      return sessions;
    }
    // Fallback: read from disk
    try {
      const sessionsDir = path.join(this.basePath, 'sessions');
      const files = await fs.readdir(sessionsDir);
      const sessions = [];
      for (const file of files.filter(f => f.endsWith('.json'))) {
        const content = await fs.readFile(path.join(sessionsDir, file), 'utf8');
        sessions.push(JSON.parse(content));
      }
      return sessions;
    } catch {
      return [];
    }
  }

  async createSession(agentName, context) {
    if (this._sessionManager) {
      return await this._sessionManager.createAgentSession(agentName, context);
    }
    throw new Error('Session manager not available');
  }

  async switchSession(sessionId) {
    if (this._sessionManager) {
      return await this._sessionManager.switchSession(sessionId);
    }
    throw new Error('Session manager not available');
  }

  async suspendSession(sessionId) {
    if (this._sessionManager) {
      return await this._sessionManager.suspendSession(sessionId);
    }
    throw new Error('Session manager not available');
  }

  async resumeSession(sessionId) {
    if (this._sessionManager) {
      return await this._sessionManager.resumeSession(sessionId);
    }
    throw new Error('Session manager not available');
  }

  async deleteSession(sessionId) {
    // Remove from session manager if available
    if (this._sessionManager) {
      try {
        // Try suspending first to clean up state
        if (this._sessionManager.activeSessions.has(sessionId)) {
          await this._sessionManager.suspendSession(sessionId);
        }
        this._sessionManager.activeSessions.delete(sessionId);
      } catch { /* ignore */ }
    }
    // Remove session file from disk
    try {
      const sessionFile = path.join(this.basePath, 'sessions', `${sessionId}.json`);
      await fs.unlink(sessionFile);
    } catch { /* file may not exist */ }
    // Also clean up any associated chat
    try {
      this._aiService.clearChat(sessionId);
    } catch { /* ignore */ }
    return { success: true, sessionId };
  }

  // ─── Queue ──────────────────────────────────────────────────────────────
  async listMessages(status = 'active') {
    if (this._messageQueue) {
      return await this._messageQueue.listMessages(status);
    }
    return [];
  }

  async getQueueMetrics() {
    if (this._messageQueue) {
      const active = await this._messageQueue.listMessages('active');
      const completed = await this._messageQueue.listMessages('completed');
      const failed = await this._messageQueue.listMessages('failed');
      return {
        active: active.length,
        completed: completed.length,
        failed: failed.length,
        total: active.length + completed.length + failed.length,
        history: this._buildMetricsHistory(completed, failed)
      };
    }
    return { active: 0, completed: 0, failed: 0, total: 0, history: [] };
  }

  _buildMetricsHistory(completed, failed) {
    // Build last 24h metrics grouped by hour
    const now = Date.now();
    const hours = [];
    for (let i = 23; i >= 0; i--) {
      const hourStart = now - (i + 1) * 3600000;
      const hourEnd = now - i * 3600000;
      const hourCompleted = completed.filter(m => m.completedAt >= hourStart && m.completedAt < hourEnd).length;
      const hourFailed = failed.filter(m => m.failedAt >= hourStart && m.failedAt < hourEnd).length;
      hours.push({
        time: new Date(hourEnd).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        completed: hourCompleted,
        failed: hourFailed
      });
    }
    return hours;
  }

  async retryMessage(messageId) {
    if (this._messageQueue) {
      return await this._messageQueue.retry(messageId);
    }
    throw new Error('Message queue not available');
  }

  async cleanupQueue() {
    if (this._messageQueue) {
      return await this._messageQueue.cleanup();
    }
  }

  // ─── Config ─────────────────────────────────────────────────────────────
  async getConfig() {
    try {
      const configPath = path.join(this.coreRoot, 'core-config.yaml');
      const content = await fs.readFile(configPath, 'utf8');
      return {
        raw: content,
        parsed: yaml.load(content),
        path: configPath
      };
    } catch {
      return { raw: '', parsed: {}, path: '' };
    }
  }

  async updateConfig(config) {
    const configPath = path.join(this.coreRoot, 'core-config.yaml');
    const yamlContent = typeof config === 'string' ? config : yaml.dump(config);
    await fs.writeFile(configPath, yamlContent);
    return { success: true };
  }

  async getTeams() {
    try {
      const teamsDir = path.join(this.coreRoot, 'agent-teams');
      const files = await fs.readdir(teamsDir);
      const teams = [];
      for (const file of files.filter(f => f.endsWith('.yaml'))) {
        const content = await fs.readFile(path.join(teamsDir, file), 'utf8');
        teams.push({
          name: file.replace('.yaml', ''),
          config: yaml.load(content),
          raw: content
        });
      }
      return teams;
    } catch {
      return [];
    }
  }

  // ─── Workflows ──────────────────────────────────────────────────────────
  async listWorkflows() {
    try {
      const workflowsDir = path.join(this.coreRoot, 'workflows');
      const files = await fs.readdir(workflowsDir);
      const workflows = [];
      for (const file of files.filter(f => f.endsWith('.md') || f.endsWith('.yaml'))) {
        const content = await fs.readFile(path.join(workflowsDir, file), 'utf8');
        const titleMatch = content.match(/^#\s+(.+)$/m);
        workflows.push({
          name: file.replace(/\.(md|yaml)$/, ''),
          filename: file,
          title: titleMatch ? titleMatch[1].trim() : file,
          rawContent: content
        });
      }
      return workflows;
    } catch {
      return [];
    }
  }

  async getWorkflow(name) {
    const workflowsDir = path.join(this.coreRoot, 'workflows');
    const files = await fs.readdir(workflowsDir);
    const match = files.find(f => f.startsWith(name));
    if (!match) throw new Error(`Workflow ${name} not found`);
    const content = await fs.readFile(path.join(workflowsDir, match), 'utf8');
    return { name, filename: match, rawContent: content };
  }

  // ─── Checklists ─────────────────────────────────────────────────────────
  async listChecklists() {
    try {
      const dir = path.join(this.coreRoot, 'checklists');
      const files = await fs.readdir(dir);
      const checklists = [];
      for (const file of files.filter(f => f.endsWith('.md'))) {
        const content = await fs.readFile(path.join(dir, file), 'utf8');
        const titleMatch = content.match(/^#\s+(.+)$/m);
        const items = (content.match(/^\s*[-□]\s+(.+)$/gm) || []).length;
        checklists.push({
          name: file.replace('.md', ''),
          filename: file,
          title: titleMatch ? titleMatch[1].trim() : file,
          itemCount: items
        });
      }
      return checklists;
    } catch {
      return [];
    }
  }

  async getChecklist(name) {
    if (this._bmadLoader) {
      return await this._bmadLoader.loadChecklist(`${name}.md`);
    }
    const filePath = path.join(this.coreRoot, 'checklists', `${name}.md`);
    const content = await fs.readFile(filePath, 'utf8');
    return { name, rawContent: content };
  }

  // ─── Tasks ──────────────────────────────────────────────────────────────
  async listTasks() {
    try {
      // Look both in bmad-core/tasks and common/tasks
      const dirs = [
        path.join(this.coreRoot, 'tasks'),
        path.join(this.bmadRoot, 'common', 'tasks')
      ];
      const tasks = [];
      for (const dir of dirs) {
        try {
          const files = await fs.readdir(dir);
          for (const file of files.filter(f => f.endsWith('.md'))) {
            const content = await fs.readFile(path.join(dir, file), 'utf8');
            const titleMatch = content.match(/^#\s+(.+)$/m);
            tasks.push({
              name: file.replace('.md', ''),
              filename: file,
              title: titleMatch ? titleMatch[1].trim() : file,
              source: path.basename(dir)
            });
          }
        } catch { /* dir does not exist */ }
      }
      return tasks;
    } catch {
      return [];
    }
  }

  async getTask(name) {
    if (this._bmadLoader) {
      return await this._bmadLoader.loadTask(`${name}.md`);
    }
    // search both dirs
    for (const dir of [path.join(this.coreRoot, 'tasks'), path.join(this.bmadRoot, 'common', 'tasks')]) {
      try {
        const content = await fs.readFile(path.join(dir, `${name}.md`), 'utf8');
        return { name, rawContent: content };
      } catch { /* continue */ }
    }
    throw new Error(`Task ${name} not found`);
  }

  // ─── Chat / AI ───────────────────────────────────────────────────────
  async startChat(agentName) {
    const agent = await this.getAgent(agentName);
    const metadata = await this.getAgentMetadata(agentName);
    const sessionId = `chat-${agentName}-${Date.now()}`;
    const displayName = metadata.title || metadata.name || agentName;
    
    const result = await this._aiService.startChat(sessionId, agent.rawContent, displayName);
    return {
      sessionId,
      agentName,
      agentTitle: displayName,
      agentIcon: metadata.icon || '🤖',
      greeting: result.content,
      usage: result.usage
    };
  }

  async sendChatMessage(sessionId, message) {
    return await this._aiService.sendMessage(sessionId, message);
  }

  async streamChatMessage(sessionId, message, onChunk) {
    return await this._aiService.streamMessage(sessionId, message, onChunk);
  }

  getChatHistory(sessionId) {
    return this._aiService.getHistory(sessionId);
  }

  clearChat(sessionId) {
    return this._aiService.clearChat(sessionId);
  }

  listChats() {
    return this._aiService.listChats();
  }

  async getAIConfig() {
    return await this._aiService.getConfig();
  }

  async updateAIConfig(config) {
    return await this._aiService.saveConfig(config);
  }

  isAIConfigured() {
    return this._aiService.isConfigured();
  }

  async getOllamaStatus() {
    return await this._aiService.getOllamaStatus();
  }

  // ─── System ─────────────────────────────────────────────────────────────
  async getSystemInfo() {
    return {
      bmadRoot: this.bmadRoot,
      integrationRoot: this.integrationRoot,
      coreRoot: this.coreRoot,
      basePath: this.basePath,
      coreModulesLoaded: !!(this._messageQueue && this._sessionManager && this._bmadLoader),
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch
    };
  }

  async getHealthCheck() {
    const checks = {
      coreModules: !!(this._messageQueue && this._sessionManager),
      bmadLoader: !!this._bmadLoader,
      agentsDir: false,
      queueDir: false,
      configFile: false
    };

    try { await fs.access(path.join(this.coreRoot, 'agents')); checks.agentsDir = true; } catch {}
    try { await fs.access(path.join(this.basePath, 'queue')); checks.queueDir = true; } catch {}
    try { await fs.access(path.join(this.coreRoot, 'core-config.yaml')); checks.configFile = true; } catch {}

    const allGood = Object.values(checks).every(v => v);
    return { status: allGood ? 'healthy' : 'degraded', checks };
  }
}

module.exports = BMADBackend;
