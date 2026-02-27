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
  },

  // AI Config
  ai: {
    getConfig: () => ipcRenderer.invoke('ai:config:get'),
    updateConfig: (config) => ipcRenderer.invoke('ai:config:update', config),
    isConfigured: () => ipcRenderer.invoke('ai:configured'),
    ollamaStatus: () => ipcRenderer.invoke('ollama:status'),
  },

  // Navigation events from menu
  onNavigate: (callback) => {
    ipcRenderer.on('navigate', (_, path) => callback(path));
    return () => ipcRenderer.removeAllListeners('navigate');
  },
});
