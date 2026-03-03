const { contextBridge, ipcRenderer } = require('electron');

// Expose a safe API to the renderer process
contextBridge.exposeInMainWorld('bmadAPI', {
  // Agents
  agents: {
    list: () => ipcRenderer.invoke('agents:list'),
    get: (name) => ipcRenderer.invoke('agents:get', name),
    getMetadata: (name) => ipcRenderer.invoke('agents:getMetadata', name),
  },

  // Sessions
  sessions: {
    list: () => ipcRenderer.invoke('sessions:list'),
    create: (agentName, context) => ipcRenderer.invoke('sessions:create', agentName, context),
    switch: (sessionId) => ipcRenderer.invoke('sessions:switch', sessionId),
    suspend: (sessionId) => ipcRenderer.invoke('sessions:suspend', sessionId),
    resume: (sessionId) => ipcRenderer.invoke('sessions:resume', sessionId),
    delete: (sessionId) => ipcRenderer.invoke('sessions:delete', sessionId),
  },

  // Queue
  queue: {
    list: (status) => ipcRenderer.invoke('queue:list', status),
    metrics: () => ipcRenderer.invoke('queue:metrics'),
    retry: (messageId) => ipcRenderer.invoke('queue:retry', messageId),
    cleanup: () => ipcRenderer.invoke('queue:cleanup'),
  },

  // Config
  config: {
    get: () => ipcRenderer.invoke('config:get'),
    update: (config) => ipcRenderer.invoke('config:update', config),
    getTeams: () => ipcRenderer.invoke('config:getTeams'),
  },

  // Workflows
  workflows: {
    list: () => ipcRenderer.invoke('workflows:list'),
    get: (name) => ipcRenderer.invoke('workflows:get', name),
  },

  // Checklists
  checklists: {
    list: () => ipcRenderer.invoke('checklists:list'),
    get: (name) => ipcRenderer.invoke('checklists:get', name),
  },

  // Tasks
  tasks: {
    list: () => ipcRenderer.invoke('tasks:list'),
    get: (name) => ipcRenderer.invoke('tasks:get', name),
  },

  // System
  system: {
    info: () => ipcRenderer.invoke('system:info'),
    health: () => ipcRenderer.invoke('system:health'),
  },

  // Chat / AI
  chat: {
    start: (agentName) => ipcRenderer.invoke('chat:start', agentName),
    send: (sessionId, message) => ipcRenderer.invoke('chat:send', sessionId, message),
    stream: (sessionId, message) => ipcRenderer.send('chat:stream', sessionId, message),
    onStreamChunk: (callback) => {
      ipcRenderer.on('chat:stream:chunk', (_, sessionId, chunk) => callback(sessionId, chunk));
      return () => ipcRenderer.removeAllListeners('chat:stream:chunk');
    },
    onStreamDone: (callback) => {
      ipcRenderer.on('chat:stream:done', (_, sessionId, result) => callback(sessionId, result));
      return () => ipcRenderer.removeAllListeners('chat:stream:done');
    },
    onStreamError: (callback) => {
      ipcRenderer.on('chat:stream:error', (_, sessionId, error) => callback(sessionId, error));
      return () => ipcRenderer.removeAllListeners('chat:stream:error');
    },
    history: (sessionId) => ipcRenderer.invoke('chat:history', sessionId),
    clear: (sessionId) => ipcRenderer.invoke('chat:clear', sessionId),
    list: () => ipcRenderer.invoke('chat:list'),
    pickFile: () => ipcRenderer.invoke('chat:pick-file'),
    uploadFile: (sessionId, filePath) => ipcRenderer.invoke('chat:upload-file', sessionId, filePath),
    saveFile: (content, defaultName, filters) => ipcRenderer.invoke('chat:save-file', content, defaultName, filters),
  },

  // AI Config
  ai: {
    getConfig: () => ipcRenderer.invoke('ai:config:get'),
    updateConfig: (config) => ipcRenderer.invoke('ai:config:update', config),
    isConfigured: () => ipcRenderer.invoke('ai:configured'),
    ollamaStatus: () => ipcRenderer.invoke('ollama:status'),
    validateKey: (provider, apiKey) => ipcRenderer.invoke('ai:validate-key', provider, apiKey),
  },

  // Project Context (Shared Memory)
  context: {
    stats: () => ipcRenderer.invoke('context:stats'),
    listArtifacts: (filter) => ipcRenderer.invoke('context:artifacts:list', filter),
    getArtifact: (id) => ipcRenderer.invoke('context:artifacts:get', id),
    addArtifact: (artifact) => ipcRenderer.invoke('context:artifacts:add', artifact),
    updateArtifact: (id, updates) => ipcRenderer.invoke('context:artifacts:update', id, updates),
    removeArtifact: (id) => ipcRenderer.invoke('context:artifacts:remove', id),
    listDecisions: () => ipcRenderer.invoke('context:decisions:list'),
    addDecision: (decision) => ipcRenderer.invoke('context:decisions:add', decision),
    clear: () => ipcRenderer.invoke('context:clear'),
  },

  // Coordination (Delegation, Pipeline, Party Mode)
  coord: {
    delegate: (fromSessionId, targetAgent, question, options) =>
      ipcRenderer.invoke('coord:delegate', fromSessionId, targetAgent, question, options),

    pipelineTemplates: () => ipcRenderer.invoke('coord:pipeline:templates'),
    listPipelines: () => ipcRenderer.invoke('coord:pipeline:list'),
    pipelineStatus: (pipelineId) => ipcRenderer.invoke('coord:pipeline:status', pipelineId),
    executePipeline: (pipeline, options) => ipcRenderer.invoke('coord:pipeline:execute', pipeline, options),
    onPipelineStepStart: (callback) => {
      ipcRenderer.on('pipeline:step:start', (_, data) => callback(data));
      return () => ipcRenderer.removeAllListeners('pipeline:step:start');
    },
    onPipelineStepDone: (callback) => {
      ipcRenderer.on('pipeline:step:done', (_, data) => callback(data));
      return () => ipcRenderer.removeAllListeners('pipeline:step:done');
    },
    onPipelineStepError: (callback) => {
      ipcRenderer.on('pipeline:step:error', (_, data) => callback(data));
      return () => ipcRenderer.removeAllListeners('pipeline:step:error');
    },

    startParty: (agentNames) => ipcRenderer.invoke('coord:party:start', agentNames),
    sendPartyMessage: (partyId, message, options) => ipcRenderer.invoke('coord:party:send', partyId, message, options),
    getPartySession: (partyId) => ipcRenderer.invoke('coord:party:get', partyId),
    endParty: (partyId) => ipcRenderer.invoke('coord:party:end', partyId),
    listPartySessions: () => ipcRenderer.invoke('coord:party:list'),
  },

  // Workspace Manager
  workspace: {
    create: (options) => ipcRenderer.invoke('workspace:create', options),
    get: (id) => ipcRenderer.invoke('workspace:get', id),
    list: () => ipcRenderer.invoke('workspace:list'),
    delete: (id) => ipcRenderer.invoke('workspace:delete', id),
    fileTree: (id) => ipcRenderer.invoke('workspace:fileTree', id),
    readFile: (id, filePath) => ipcRenderer.invoke('workspace:readFile', id, filePath),
    writeFile: (id, filePath, content, options) => ipcRenderer.invoke('workspace:writeFile', id, filePath, content, options),
    runCommand: (id, command, options) => ipcRenderer.invoke('workspace:runCommand', id, command, options),
    runCommandBg: (id, command, options) => ipcRenderer.invoke('workspace:runCommandBg', id, command, options),
    processOutput: (wsId, procId) => ipcRenderer.invoke('workspace:processOutput', wsId, procId),
    killProcess: (wsId, procId) => ipcRenderer.invoke('workspace:killProcess', wsId, procId),
    detectCommands: (id) => ipcRenderer.invoke('workspace:detectCommands', id),
    getPath: (id) => ipcRenderer.invoke('workspace:getPath', id),
    openFolder: (id) => ipcRenderer.invoke('workspace:openFolder', id),
    onFilesWritten: (callback) => {
      ipcRenderer.on('pipeline:files:written', (_, data) => callback(data));
      return () => ipcRenderer.removeAllListeners('pipeline:files:written');
    },
  },

  // Navigation events from menu
  onNavigate: (callback) => {
    ipcRenderer.on('navigate', (_, path) => callback(path));
    return () => ipcRenderer.removeAllListeners('navigate');
  },
});
