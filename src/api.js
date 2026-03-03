/**
 * API abstraction layer.
 * When running in Electron, uses IPC via window.bmadAPI.
 * When running in browser dev mode, falls back to mock data.
 */

const isElectron = !!window.bmadAPI;

// Mock data for browser development
const MOCK_AGENTS = [
  { name: 'bmad-master', id: 'bmad-master', title: 'BMAD Master Agent', icon: '🧙', whenToUse: 'Overall project coordination and multi-agent orchestration' },
  { name: 'bmad-orchestrator', id: 'bmad-orchestrator', title: 'BMAD Orchestrator', icon: '🎭', whenToUse: 'Workflow orchestration and agent routing' },
  { name: 'pm', id: 'pm', title: 'Project Manager', icon: '📋', whenToUse: 'User stories, PRD creation, sprint planning' },
  { name: 'architect', id: 'architect', title: 'Software Architect', icon: '🏗️', whenToUse: 'System design, architecture decisions, tech stack' },
  { name: 'dev', id: 'dev', title: 'Developer Agent', icon: '💻', whenToUse: 'Code implementation, debugging, refactoring' },
  { name: 'qa', id: 'qa', title: 'QA Engineer', icon: '🐛', whenToUse: 'Testing, quality assurance, code review' },
  { name: 'ux-expert', id: 'ux-expert', title: 'UX Expert', icon: '🎨', whenToUse: 'UI/UX design, user experience, wireframes' },
  { name: 'sm', id: 'sm', title: 'Scrum Master', icon: '🏃', whenToUse: 'Agile ceremonies, process improvement' },
  { name: 'analyst', id: 'analyst', title: 'Business Analyst', icon: '📊', whenToUse: 'Requirements gathering, business analysis' },
  { name: 'po', id: 'po', title: 'Product Owner', icon: '📦', whenToUse: 'Product vision, backlog management, prioritization' },
];

const MOCK_SESSIONS = [
  { id: 'session-1', agent: 'architect', status: 'active', created: new Date().toISOString(), lastActivity: Date.now(), ui: { icon: '🏗️', displayName: 'Architect', color: 'orange' }, context: { conversationHistory: [{ role: 'user', text: 'Design microservices architecture' }] } },
  { id: 'session-2', agent: 'pm', status: 'suspended', created: new Date(Date.now() - 3600000).toISOString(), lastActivity: Date.now() - 3600000, ui: { icon: '📋', displayName: 'Project Manager', color: 'green' }, context: { conversationHistory: [] } },
];

const MOCK_QUEUE_METRICS = {
  active: 3, completed: 47, failed: 2, total: 52,
  history: Array.from({ length: 24 }, (_, i) => ({
    time: `${String(i).padStart(2, '0')}:00`,
    completed: Math.floor(Math.random() * 5),
    failed: Math.random() > 0.85 ? 1 : 0
  }))
};

const api = {
  agents: {
    list: async () => isElectron ? window.bmadAPI.agents.list() : MOCK_AGENTS,
    get: async (name) => isElectron ? window.bmadAPI.agents.get(name) : { name, rawContent: `# ${name} Agent\n\nMock content for development.` },
    getMetadata: async (name) => isElectron ? window.bmadAPI.agents.getMetadata(name) : MOCK_AGENTS.find(a => a.name === name) || { name },
  },

  sessions: {
    list: async () => isElectron ? window.bmadAPI.sessions.list() : MOCK_SESSIONS,
    create: async (agentName, context) => isElectron ? window.bmadAPI.sessions.create(agentName, context) : { id: `session-${Date.now()}`, agent: agentName, status: 'active', created: new Date().toISOString(), lastActivity: Date.now(), ui: MOCK_AGENTS.find(a => a.name === agentName)?.ui || {} },
    switch: async (id) => isElectron ? window.bmadAPI.sessions.switch(id) : {},
    suspend: async (id) => isElectron ? window.bmadAPI.sessions.suspend(id) : {},
    resume: async (id) => isElectron ? window.bmadAPI.sessions.resume(id) : {},
    delete: async (id) => isElectron ? window.bmadAPI.sessions.delete(id) : {},
  },

  queue: {
    list: async (status) => isElectron ? window.bmadAPI.queue.list(status) : [],
    metrics: async () => isElectron ? window.bmadAPI.queue.metrics() : MOCK_QUEUE_METRICS,
    retry: async (id) => isElectron ? window.bmadAPI.queue.retry(id) : {},
    cleanup: async () => isElectron ? window.bmadAPI.queue.cleanup() : {},
  },

  config: {
    get: async () => isElectron ? window.bmadAPI.config.get() : { raw: 'markdownExploder: true\nprd:\n  prdFile: docs/prd.md\n  prdVersion: v4', parsed: { markdownExploder: true } },
    update: async (config) => isElectron ? window.bmadAPI.config.update(config) : { success: true },
    getTeams: async () => isElectron ? window.bmadAPI.config.getTeams() : [
      { name: 'team-all', config: { agents: MOCK_AGENTS.map(a => a.name) } },
      { name: 'team-fullstack', config: { agents: ['pm', 'architect', 'dev', 'qa'] } },
    ],
  },

  workflows: {
    list: async () => isElectron ? window.bmadAPI.workflows.list() : [
      { name: 'standard-dev', title: 'Standard Development Workflow', rawContent: '# Standard Development Workflow\n\n## Steps\n1. Requirements → Analyst\n2. Architecture → Architect\n3. Stories → PM\n4. Implementation → Dev\n5. QA → QA' },
    ],
    get: async (name) => isElectron ? window.bmadAPI.workflows.get(name) : { name, rawContent: '# Workflow\nMock' },
  },

  checklists: {
    list: async () => isElectron ? window.bmadAPI.checklists.list() : [
      { name: 'architect-checklist', title: 'Architect Checklist', itemCount: 15 },
      { name: 'pm-checklist', title: 'PM Checklist', itemCount: 12 },
      { name: 'story-dod-checklist', title: 'Story DoD Checklist', itemCount: 8 },
    ],
    get: async (name) => isElectron ? window.bmadAPI.checklists.get(name) : { name, rawContent: '# Checklist\n- Item 1\n- Item 2' },
  },

  tasks: {
    list: async () => isElectron ? window.bmadAPI.tasks.list() : [
      { name: 'create-prd', title: 'Create PRD', source: 'tasks' },
      { name: 'create-architecture', title: 'Create Architecture Doc', source: 'tasks' },
    ],
    get: async (name) => isElectron ? window.bmadAPI.tasks.get(name) : { name, rawContent: '# Task\nMock task' },
  },

  system: {
    info: async () => isElectron ? window.bmadAPI.system.info() : { bmadRoot: '/mock', coreModulesLoaded: false, nodeVersion: 'v20', platform: 'browser' },
    health: async () => isElectron ? window.bmadAPI.system.health() : { status: 'healthy', checks: { coreModules: true, bmadLoader: true, agentsDir: true, queueDir: true, configFile: true } },
  },

  // Chat / AI
  chat: {
    start: async (agentName) => {
      if (isElectron) return window.bmadAPI.chat.start(agentName);
      // Mock for browser dev
      return {
        sessionId: `chat-${agentName}-${Date.now()}`,
        agentName,
        agentTitle: agentName,
        agentIcon: '🤖',
        greeting: `Bonjour ! Je suis l'agent **${agentName}**. Comment puis-je vous aider ?`,
        usage: { input_tokens: 0, output_tokens: 0 }
      };
    },
    send: async (sessionId, message) => {
      if (isElectron) return window.bmadAPI.chat.send(sessionId, message);
      return {
        content: `[Mode navigateur] Réponse simulée à : "${message}"`,
        usage: { input_tokens: 10, output_tokens: 20 },
        model: 'mock',
        stopReason: 'end_turn'
      };
    },
    stream: (sessionId, message) => {
      if (isElectron) window.bmadAPI.chat.stream(sessionId, message);
    },
    onStreamChunk: (callback) => {
      if (isElectron) return window.bmadAPI.chat.onStreamChunk(callback);
      return () => {};
    },
    onStreamDone: (callback) => {
      if (isElectron) return window.bmadAPI.chat.onStreamDone(callback);
      return () => {};
    },
    onStreamError: (callback) => {
      if (isElectron) return window.bmadAPI.chat.onStreamError(callback);
      return () => {};
    },
    history: async (sessionId) => {
      if (isElectron) return window.bmadAPI.chat.history(sessionId);
      return [];
    },
    clear: async (sessionId) => {
      if (isElectron) return window.bmadAPI.chat.clear(sessionId);
      return { success: true };
    },
    list: async () => {
      if (isElectron) return window.bmadAPI.chat.list();
      return [];
    },
    pickFile: async () => {
      if (isElectron) return window.bmadAPI.chat.pickFile();
      return { canceled: true, filePaths: [] };
    },
    uploadFile: async (sessionId, filePath) => {
      if (isElectron) return window.bmadAPI.chat.uploadFile(sessionId, filePath);
      return { success: false, error: 'Non disponible en mode navigateur' };
    },
    saveFile: async (content, defaultName, filters) => {
      if (isElectron) return window.bmadAPI.chat.saveFile(content, defaultName, filters);
      // Browser fallback: download via blob
      const blob = new Blob([content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = defaultName || 'export.svg';
      a.click();
      URL.revokeObjectURL(url);
      return { canceled: false };
    },
  },

  ai: {
    getConfig: async () => {
      if (isElectron) return window.bmadAPI.ai.getConfig();
      return { provider: 'ollama', hasApiKey: false, model: 'llama3.1', maxTokens: 4096, ollamaUrl: 'http://localhost:11434' };
    },
    updateConfig: async (config) => {
      if (isElectron) return window.bmadAPI.ai.updateConfig(config);
      return config;
    },
    isConfigured: async () => {
      if (isElectron) return window.bmadAPI.ai.isConfigured();
      return false;
    },
    ollamaStatus: async () => {
      if (isElectron) return window.bmadAPI.ai.ollamaStatus();
      return { available: false, models: [], url: 'http://localhost:11434' };
    },
    validateKey: async (provider, apiKey) => {
      if (isElectron) return window.bmadAPI.ai.validateKey(provider, apiKey);
      return { valid: false, error: 'Non disponible en mode navigateur' };
    },
  },

  // Project Context (Shared Memory)
  context: {
    stats: async () => {
      if (isElectron) return window.bmadAPI.context.stats();
      return { totalArtifacts: 0, totalDecisions: 0, byType: {}, byAgent: {}, lastUpdate: null };
    },
    listArtifacts: async (filter) => {
      if (isElectron) return window.bmadAPI.context.listArtifacts(filter);
      return [];
    },
    getArtifact: async (id) => {
      if (isElectron) return window.bmadAPI.context.getArtifact(id);
      return null;
    },
    addArtifact: async (artifact) => {
      if (isElectron) return window.bmadAPI.context.addArtifact(artifact);
      return { id: 'mock', ...artifact };
    },
    updateArtifact: async (id, updates) => {
      if (isElectron) return window.bmadAPI.context.updateArtifact(id, updates);
      return { id, ...updates };
    },
    removeArtifact: async (id) => {
      if (isElectron) return window.bmadAPI.context.removeArtifact(id);
      return { success: true };
    },
    listDecisions: async () => {
      if (isElectron) return window.bmadAPI.context.listDecisions();
      return [];
    },
    addDecision: async (decision) => {
      if (isElectron) return window.bmadAPI.context.addDecision(decision);
      return { id: 'mock', ...decision };
    },
    clear: async () => {
      if (isElectron) return window.bmadAPI.context.clear();
      return { success: true };
    },
  },

  // Coordination (Delegation, Pipeline, Party Mode)
  coord: {
    delegate: async (fromSessionId, targetAgent, question, options) => {
      if (isElectron) return window.bmadAPI.coord.delegate(fromSessionId, targetAgent, question, options);
      return { agentName: targetAgent, agentTitle: targetAgent, agentIcon: '🤖', question, response: '[Mode navigateur] Réponse simulée', usage: {} };
    },
    pipelineTemplates: async () => {
      if (isElectron) return window.bmadAPI.coord.pipelineTemplates();
      return [];
    },
    listPipelines: async () => {
      if (isElectron) return window.bmadAPI.coord.listPipelines();
      return [];
    },
    pipelineStatus: async (pipelineId) => {
      if (isElectron) return window.bmadAPI.coord.pipelineStatus(pipelineId);
      return null;
    },
    executePipeline: async (pipeline, options) => {
      if (isElectron) return window.bmadAPI.coord.executePipeline(pipeline, options);
      return { id: 'mock', status: 'completed', results: [] };
    },
    onPipelineStepStart: (callback) => {
      if (isElectron) return window.bmadAPI.coord.onPipelineStepStart(callback);
      return () => {};
    },
    onPipelineStepDone: (callback) => {
      if (isElectron) return window.bmadAPI.coord.onPipelineStepDone(callback);
      return () => {};
    },
    onPipelineStepError: (callback) => {
      if (isElectron) return window.bmadAPI.coord.onPipelineStepError(callback);
      return () => {};
    },
    startParty: async (agentNames) => {
      if (isElectron) return window.bmadAPI.coord.startParty(agentNames);
      return { partyId: 'mock', agents: [], greeting: 'Mode navigateur', messageCount: 0 };
    },
    sendPartyMessage: async (partyId, message, options) => {
      if (isElectron) return window.bmadAPI.coord.sendPartyMessage(partyId, message, options);
      return { responses: [], messageCount: 0 };
    },
    getPartySession: async (partyId) => {
      if (isElectron) return window.bmadAPI.coord.getPartySession(partyId);
      return null;
    },
    endParty: async (partyId) => {
      if (isElectron) return window.bmadAPI.coord.endParty(partyId);
      return { success: true };
    },
    listPartySessions: async () => {
      if (isElectron) return window.bmadAPI.coord.listPartySessions();
      return [];
    },
  },
};

export default api;
