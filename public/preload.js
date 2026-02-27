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

  // Navigation events from menu
  onNavigate: (callback) => {
    ipcRenderer.on('navigate', (_, path) => callback(path));
    return () => ipcRenderer.removeAllListeners('navigate');
  },
});
