/**
 * BMAD Backend Bridge
 * Connects Electron IPC to the existing BMAD core modules
 */

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const AIService = require('./ai-service');
const ProjectContext = require('./project-context');
const AgentCoordinator = require('./agent-coordinator');
const WorkspaceManager = require('./workspace-manager');
const DocumentationManager = require('./documentation-manager');

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

    // Project context (shared memory)
    this._projectContext = new ProjectContext({ basePath: this.basePath });

    // Workspace manager (real project files on disk)
    this._workspaceManager = new WorkspaceManager();

    // Documentation manager (auto-save agent outputs as doc files)
    this._docManager = new DocumentationManager();

    // Agent coordinator (delegation, pipeline, party mode)
    this._coordinator = null; // initialized after aiService
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

    // Initialize project context (shared memory)
    await this._projectContext.initialize();
    this._aiService.projectContext = this._projectContext;

    // Initialize workspace manager
    await this._workspaceManager.initialize();

    // Initialize documentation manager
    await this._docManager.initialize();

    // Initialize coordinator (delegation, pipeline, party mode)
    this._coordinator = new AgentCoordinator({
      aiService: this._aiService,
      projectContext: this._projectContext,
      bmadBackend: this,
      workspaceManager: this._workspaceManager
    });
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

  async uploadFileToChat(sessionId, filePath) {
    const { processFile, formatFileForLLM } = require('./file-processor');
    const processed = await processFile(filePath);
    const formattedText = formatFileForLLM(processed);
    const result = this._aiService.addFileToConversation(sessionId, processed, formattedText);
    return {
      ...result,
      formattedText,
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

  async validateApiKey(provider, apiKey) {
    return await this._aiService.validateApiKey(provider, apiKey);
  }

  // ─── Project Context (Shared Memory) ─────────────────────────────────

  async getProjectContextStats() {
    return this._projectContext.getStats();
  }

  async listArtifacts(filter) {
    return this._projectContext.listArtifacts(filter || {});
  }

  async getArtifact(id) {
    const art = this._projectContext.getArtifact(id);
    if (!art) throw new Error(`Artefact ${id} introuvable`);
    return art;
  }

  async addArtifact(artifact) {
    return await this._projectContext.addArtifact(artifact);
  }

  async updateArtifact(id, updates) {
    return await this._projectContext.updateArtifact(id, updates);
  }

  async removeArtifact(id) {
    return await this._projectContext.removeArtifact(id);
  }

  async listDecisions() {
    return this._projectContext.listDecisions();
  }

  async addDecision(decision) {
    return await this._projectContext.addDecision(decision);
  }

  async clearProjectContext() {
    await this._projectContext.clear();
    return { success: true };
  }

  // ─── Coordination (Delegation, Pipeline, Party) ─────────────────────

  async delegateToAgent(fromSessionId, targetAgentName, question, options) {
    return await this._coordinator.delegateToAgent(fromSessionId, targetAgentName, question, options || {});
  }

  async executePipeline(pipeline, options) {
    return await this._coordinator.executePipeline(pipeline, options || {});
  }

  getPipelineTemplates() {
    return this._coordinator.getPipelineTemplates();
  }

  getPipelineStatus(pipelineId) {
    return this._coordinator.getPipelineStatus(pipelineId);
  }

  listPipelines() {
    return this._coordinator.listPipelines();
  }

  async startParty(agentNames) {
    return await this._coordinator.startParty(agentNames);
  }

  async sendPartyMessage(partyId, message, options) {
    return await this._coordinator.sendPartyMessage(partyId, message, options || {});
  }

  getPartySession(partyId) {
    return this._coordinator.getPartySession(partyId);
  }

  endParty(partyId) {
    return this._coordinator.endParty(partyId);
  }

  listPartySessions() {
    return this._coordinator.listPartySessions();
  }

  getCoordinator() {
    return this._coordinator;
  }

  // ─── Workspace Manager ──────────────────────────────────────────────

  async createWorkspace(options) {
    return await this._workspaceManager.createWorkspace(options);
  }

  getWorkspace(id) {
    return this._workspaceManager.getWorkspace(id);
  }

  listWorkspaces() {
    return this._workspaceManager.listWorkspaces();
  }

  async deleteWorkspace(id) {
    return await this._workspaceManager.deleteWorkspace(id);
  }

  async getFileTree(workspaceId) {
    return await this._workspaceManager.getFileTree(workspaceId);
  }

  async readWorkspaceFile(workspaceId, filePath) {
    return await this._workspaceManager.readFile(workspaceId, filePath);
  }

  async writeWorkspaceFile(workspaceId, filePath, content, options) {
    return await this._workspaceManager.writeFile(workspaceId, filePath, content, options);
  }

  runWorkspaceCommand(workspaceId, command, options) {
    return this._workspaceManager.runCommandSync(workspaceId, command, options);
  }

  runWorkspaceCommandBackground(workspaceId, command, options) {
    return this._workspaceManager.runCommandBackground(workspaceId, command, options);
  }

  getProcessOutput(workspaceId, processId) {
    return this._workspaceManager.getProcessOutput(workspaceId, processId);
  }

  killProcess(workspaceId, processId) {
    return this._workspaceManager.killProcess(workspaceId, processId);
  }

  async detectSetupCommands(workspaceId) {
    return await this._workspaceManager.detectSetupCommands(workspaceId);
  }

  getWorkspacePath(id) {
    return this._workspaceManager.getWorkspacePath(id);
  }

  async createDesktopShortcut(workspaceId, options) {
    return await this._workspaceManager.createDesktopShortcut(workspaceId, options);
  }

  // ─── Documentation Manager ────────────────────────────────────────────

  async createDocProject(options) {
    return await this._docManager.createProject(options);
  }

  async getDocProject(id) {
    return await this._docManager.getProject(id);
  }

  async listDocProjects() {
    return await this._docManager.listProjects();
  }

  async deleteDocProject(id) {
    return await this._docManager.deleteProject(id);
  }

  setActiveDocProject(id) {
    return this._docManager.setActiveProject(id);
  }

  getActiveDocProject() {
    return this._docManager.getActiveProject();
  }

  async getDocProjectTree(projectId) {
    return await this._docManager.getProjectTree(projectId);
  }

  async readDocFile(projectId, relativePath) {
    return await this._docManager.readDocument(projectId, relativePath);
  }

  /**
   * Auto-save an agent response as documentation.
   * Called from IPC after stream:done or chat:send.
   */
  async saveAgentDoc(sessionId, userQuestion, responseContent) {
    const conv = this._aiService.conversations.get(sessionId);
    if (!conv) return null;
    const agentName = conv.agentName || 'unknown';
    return await this._docManager.saveAgentResponse(
      agentName, agentName, userQuestion, responseContent, { sessionId }
    );
  }

  async saveConversationHistory(sessionId) {
    const conv = this._aiService.conversations.get(sessionId);
    if (!conv) return null;
    const agentName = conv.agentName || 'unknown';
    const messages = conv.messages.map(m => ({
      role: m.role,
      content: m.content,
      timestamp: Date.now()
    }));
    return await this._docManager.saveConversationHistory(agentName, agentName, messages, { sessionId });
  }

  getDocManager() {
    return this._docManager;
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
