const { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage } = require('electron');
const path = require('path');
const url = require('url');

// Backend bridge - connects to BMAD core modules
const BMADBackend = require('../src/backend/bmad-backend');

let mainWindow;
let tray;
let backend;

const isDev = process.env.NODE_ENV === 'development';

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    title: 'BMAD Agent GUI',
    backgroundColor: '#0f0f1a',
    titleBarStyle: 'hiddenInset',
    frame: process.platform === 'darwin' ? false : true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    icon: path.join(__dirname, '..', 'assets', 'icon.png')
  });

  const startUrl = isDev
    ? 'http://localhost:3000'
    : url.format({
        pathname: path.join(__dirname, '..', 'build', 'index.html'),
        protocol: 'file:',
        slashes: true,
      });

  mainWindow.loadURL(startUrl);

  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Create application menu
  const menuTemplate = [
    {
      label: 'BMAD',
      submenu: [
        { label: 'About BMAD Agent GUI', role: 'about' },
        { type: 'separator' },
        { label: 'Preferences...', accelerator: 'CmdOrCtrl+,', click: () => mainWindow.webContents.send('navigate', '/config') },
        { type: 'separator' },
        { label: 'Quit', accelerator: 'CmdOrCtrl+Q', click: () => app.quit() }
      ]
    },
    {
      label: 'View',
      submenu: [
        { label: 'Dashboard', accelerator: 'CmdOrCtrl+1', click: () => mainWindow.webContents.send('navigate', '/') },
        { label: 'Agents', accelerator: 'CmdOrCtrl+2', click: () => mainWindow.webContents.send('navigate', '/agents') },
        { label: 'Sessions', accelerator: 'CmdOrCtrl+3', click: () => mainWindow.webContents.send('navigate', '/sessions') },
        { label: 'Queue Monitor', accelerator: 'CmdOrCtrl+4', click: () => mainWindow.webContents.send('navigate', '/queue') },
        { label: 'Workflows', accelerator: 'CmdOrCtrl+5', click: () => mainWindow.webContents.send('navigate', '/workflows') },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }
      ]
    }
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate));
}

async function initBackend() {
  const bmadRoot = path.resolve(__dirname, '..', '..');
  backend = new BMADBackend({
    bmadRoot,
    integrationRoot: path.join(bmadRoot, 'bmad-claude-integration'),
    coreRoot: path.join(bmadRoot, 'bmad-core')
  });
  await backend.initialize();
}

// ─── IPC Handlers ───────────────────────────────────────────────────────────

function registerIpcHandlers() {
  // Agents
  ipcMain.handle('agents:list', () => backend.listAgents());
  ipcMain.handle('agents:get', (_, name) => backend.getAgent(name));
  ipcMain.handle('agents:getMetadata', (_, name) => backend.getAgentMetadata(name));

  // Sessions
  ipcMain.handle('sessions:list', () => backend.listSessions());
  ipcMain.handle('sessions:create', (_, agentName, context) => backend.createSession(agentName, context));
  ipcMain.handle('sessions:switch', (_, sessionId) => backend.switchSession(sessionId));
  ipcMain.handle('sessions:suspend', (_, sessionId) => backend.suspendSession(sessionId));
  ipcMain.handle('sessions:resume', (_, sessionId) => backend.resumeSession(sessionId));
  ipcMain.handle('sessions:delete', (_, sessionId) => backend.deleteSession(sessionId));

  // Queue
  ipcMain.handle('queue:list', (_, status) => backend.listMessages(status));
  ipcMain.handle('queue:metrics', () => backend.getQueueMetrics());
  ipcMain.handle('queue:retry', (_, messageId) => backend.retryMessage(messageId));
  ipcMain.handle('queue:cleanup', () => backend.cleanupQueue());

  // Config
  ipcMain.handle('config:get', () => backend.getConfig());
  ipcMain.handle('config:update', (_, config) => backend.updateConfig(config));
  ipcMain.handle('config:getTeams', () => backend.getTeams());

  // Workflows
  ipcMain.handle('workflows:list', () => backend.listWorkflows());
  ipcMain.handle('workflows:get', (_, name) => backend.getWorkflow(name));

  // Checklists
  ipcMain.handle('checklists:list', () => backend.listChecklists());
  ipcMain.handle('checklists:get', (_, name) => backend.getChecklist(name));

  // Tasks
  ipcMain.handle('tasks:list', () => backend.listTasks());
  ipcMain.handle('tasks:get', (_, name) => backend.getTask(name));

  // System
  ipcMain.handle('system:info', () => backend.getSystemInfo());
  ipcMain.handle('system:health', () => backend.getHealthCheck());

  // Helper: wrap IPC handlers to serialize errors properly across IPC
  const safeHandle = (channel, fn) => {
    ipcMain.handle(channel, async (...args) => {
      try {
        return await fn(...args);
      } catch (err) {
        // Re-throw with guaranteed message (Node.js v22 AggregateError has empty message)
        const msg = err.message || err.code || String(err) || 'Unknown error';
        throw new Error(msg);
      }
    });
  };

  // Chat / AI
  safeHandle('chat:start', (_, agentName) => backend.startChat(agentName));
  safeHandle('chat:send', (_, sessionId, message) => backend.sendChatMessage(sessionId, message));
  safeHandle('chat:history', (_, sessionId) => backend.getChatHistory(sessionId));
  safeHandle('chat:clear', (_, sessionId) => backend.clearChat(sessionId));
  safeHandle('chat:list', () => backend.listChats());
  safeHandle('ai:config:get', () => backend.getAIConfig());
  safeHandle('ai:config:update', (_, config) => backend.updateAIConfig(config));
  safeHandle('ai:configured', () => backend.isAIConfigured());
  safeHandle('ollama:status', () => backend.getOllamaStatus());

  // Streaming chat (uses IPC events instead of invoke)
  ipcMain.on('chat:stream', async (event, sessionId, message) => {
    try {
      const result = await backend.streamChatMessage(sessionId, message, (chunk) => {
        if (!event.sender.isDestroyed()) {
          event.sender.send('chat:stream:chunk', sessionId, chunk);
        }
      });
      if (!event.sender.isDestroyed()) {
        event.sender.send('chat:stream:done', sessionId, result);
      }
    } catch (error) {
      if (!event.sender.isDestroyed()) {
        event.sender.send('chat:stream:error', sessionId, error.message);
      }
    }
  });
}

// ─── App Lifecycle ──────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  await initBackend();
  registerIpcHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
