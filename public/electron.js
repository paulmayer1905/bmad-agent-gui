const { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage, dialog } = require('electron');
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
        { label: 'À propos de BMAD Agent GUI', role: 'about' },
        { type: 'separator' },
        { label: 'Préférences...', accelerator: 'CmdOrCtrl+,', click: () => mainWindow.webContents.send('navigate', '/config') },
        { type: 'separator' },
        { label: 'Quitter', accelerator: 'CmdOrCtrl+Q', click: () => app.quit() }
      ]
    },
    {
      label: 'Affichage',
      submenu: [
        { label: 'Accueil', accelerator: 'CmdOrCtrl+1', click: () => mainWindow.webContents.send('navigate', '/') },
        { label: 'Agents', accelerator: 'CmdOrCtrl+2', click: () => mainWindow.webContents.send('navigate', '/agents') },
        { label: 'Sessions', accelerator: 'CmdOrCtrl+3', click: () => mainWindow.webContents.send('navigate', '/sessions') },
        { label: 'Collaboration', accelerator: 'CmdOrCtrl+4', click: () => mainWindow.webContents.send('navigate', '/collaboration') },
        { label: 'File d\'attente', accelerator: 'CmdOrCtrl+5', click: () => mainWindow.webContents.send('navigate', '/queue') },
        { label: 'Workflows', accelerator: 'CmdOrCtrl+5', click: () => mainWindow.webContents.send('navigate', '/workflows') },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Édition',
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
  safeHandle('chat:send', async (_, sessionId, message) => {
    const result = await backend.sendChatMessage(sessionId, message);
    // Auto-save to doc project (fire and forget)
    backend.saveAgentDoc(sessionId, message, result.content).catch(() => {});
    return result;
  });
  safeHandle('chat:history', (_, sessionId) => backend.getChatHistory(sessionId));
  safeHandle('chat:clear', (_, sessionId) => backend.clearChat(sessionId));
  safeHandle('chat:list', () => backend.listChats());
  safeHandle('ai:config:get', () => backend.getAIConfig());
  safeHandle('ai:config:update', (_, config) => backend.updateAIConfig(config));
  safeHandle('ai:configured', () => backend.isAIConfigured());
  safeHandle('ollama:status', () => backend.getOllamaStatus());
  safeHandle('ai:validate-key', (_, provider, apiKey) => backend.validateApiKey(provider, apiKey));

  // File upload for chat
  safeHandle('chat:upload-file', async (_, sessionId, filePath) => {
    return await backend.uploadFileToChat(sessionId, filePath);
  });

  safeHandle('chat:pick-file', async () => {
    const { getDialogFilters } = require('../src/backend/file-processor');
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Ajouter un fichier au chat',
      properties: ['openFile', 'multiSelections'],
      filters: getDialogFilters(),
    });
    if (result.canceled) return { canceled: true, filePaths: [] };
    return { canceled: false, filePaths: result.filePaths };
  });

  // Save file from chat (export SVG, code, etc.)
  safeHandle('chat:save-file', async (_, content, defaultName, filters) => {
    const fsPromises = require('fs').promises;
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Exporter le fichier',
      defaultPath: defaultName || 'export.svg',
      filters: filters || [
        { name: 'SVG (Figma)', extensions: ['svg'] },
        { name: 'HTML', extensions: ['html'] },
        { name: 'Tous les fichiers', extensions: ['*'] },
      ],
    });
    if (result.canceled) return { canceled: true };
    await fsPromises.writeFile(result.filePath, content, 'utf8');
    return { canceled: false, filePath: result.filePath };
  });

  // ─── Project Context (Shared Memory) ────────────────────────────────
  safeHandle('context:stats', () => backend.getProjectContextStats());
  safeHandle('context:artifacts:list', (_, filter) => backend.listArtifacts(filter));
  safeHandle('context:artifacts:get', (_, id) => backend.getArtifact(id));
  safeHandle('context:artifacts:add', (_, artifact) => backend.addArtifact(artifact));
  safeHandle('context:artifacts:update', (_, id, updates) => backend.updateArtifact(id, updates));
  safeHandle('context:artifacts:remove', (_, id) => backend.removeArtifact(id));
  safeHandle('context:decisions:list', () => backend.listDecisions());
  safeHandle('context:decisions:add', (_, decision) => backend.addDecision(decision));
  safeHandle('context:clear', () => backend.clearProjectContext());

  // ─── Coordination (Delegation, Pipeline, Party) ──────────────────────
  safeHandle('coord:delegate', (_, fromSessionId, targetAgent, question, options) =>
    backend.delegateToAgent(fromSessionId, targetAgent, question, options));

  safeHandle('coord:pipeline:templates', () => backend.getPipelineTemplates());
  safeHandle('coord:pipeline:list', () => backend.listPipelines());
  safeHandle('coord:pipeline:status', (_, pipelineId) => backend.getPipelineStatus(pipelineId));

  // Pipeline execution (uses events for progress)
  safeHandle('coord:pipeline:execute', async (_, pipeline, options) => {
    const coordinator = backend.getCoordinator();

    // Forward pipeline events to renderer
    const onStepStart = (data) => {
      if (!mainWindow.isDestroyed()) mainWindow.webContents.send('pipeline:step:start', data);
    };
    const onStepDone = (data) => {
      if (!mainWindow.isDestroyed()) mainWindow.webContents.send('pipeline:step:done', data);
    };
    const onStepError = (data) => {
      if (!mainWindow.isDestroyed()) mainWindow.webContents.send('pipeline:step:error', data);
    };
    const onFilesWritten = (data) => {
      if (!mainWindow.isDestroyed()) mainWindow.webContents.send('pipeline:files:written', data);
    };

    coordinator.on('pipeline:step:start', onStepStart);
    coordinator.on('pipeline:step:done', onStepDone);
    coordinator.on('pipeline:step:error', onStepError);
    coordinator.on('pipeline:files:written', onFilesWritten);

    try {
      const result = await backend.executePipeline(pipeline, options);
      return result;
    } finally {
      coordinator.removeListener('pipeline:step:start', onStepStart);
      coordinator.removeListener('pipeline:step:done', onStepDone);
      coordinator.removeListener('pipeline:step:error', onStepError);
      coordinator.removeListener('pipeline:files:written', onFilesWritten);
    }
  });

  // Party mode
  safeHandle('coord:party:start', (_, agentNames) => backend.startParty(agentNames));
  safeHandle('coord:party:send', (_, partyId, message, options) => backend.sendPartyMessage(partyId, message, options));
  safeHandle('coord:party:get', (_, partyId) => backend.getPartySession(partyId));
  safeHandle('coord:party:end', (_, partyId) => backend.endParty(partyId));
  safeHandle('coord:party:list', () => backend.listPartySessions());

  // ─── Workspace Manager ────────────────────────────────────────────────
  safeHandle('workspace:create', (_, options) => backend.createWorkspace(options));
  safeHandle('workspace:get', (_, id) => backend.getWorkspace(id));
  safeHandle('workspace:list', () => backend.listWorkspaces());
  safeHandle('workspace:delete', (_, id) => backend.deleteWorkspace(id));
  safeHandle('workspace:fileTree', (_, id) => backend.getFileTree(id));
  safeHandle('workspace:readFile', (_, id, filePath) => backend.readWorkspaceFile(id, filePath));
  safeHandle('workspace:writeFile', (_, id, filePath, content, options) => backend.writeWorkspaceFile(id, filePath, content, options));
  safeHandle('workspace:runCommand', (_, id, command, options) => backend.runWorkspaceCommand(id, command, options));
  safeHandle('workspace:runCommandBg', (_, id, command, options) => backend.runWorkspaceCommandBackground(id, command, options));
  safeHandle('workspace:processOutput', (_, wsId, procId) => backend.getProcessOutput(wsId, procId));
  safeHandle('workspace:killProcess', (_, wsId, procId) => backend.killProcess(wsId, procId));
  safeHandle('workspace:detectCommands', (_, id) => backend.detectSetupCommands(id));
  safeHandle('workspace:getPath', (_, id) => backend.getWorkspacePath(id));
  safeHandle('workspace:openFolder', async (_, id) => {
    const wsPath = backend.getWorkspacePath(id);
    if (wsPath) {
      const { shell } = require('electron');
      await shell.openPath(wsPath);
      return { success: true };
    }
    return { success: false };
  });
  safeHandle('workspace:createShortcut', (_, id, options) => backend.createDesktopShortcut(id, options));

  // Documentation Projects
  safeHandle('doc:project:create', (_, options) => backend.createDocProject(options));
  safeHandle('doc:project:get', (_, id) => backend.getDocProject(id));
  safeHandle('doc:project:list', () => backend.listDocProjects());
  safeHandle('doc:project:delete', (_, id) => backend.deleteDocProject(id));
  safeHandle('doc:project:setActive', (_, id) => backend.setActiveDocProject(id));
  safeHandle('doc:project:getActive', () => backend.getActiveDocProject());
  safeHandle('doc:project:tree', (_, id) => backend.getDocProjectTree(id));
  safeHandle('doc:file:read', (_, projectId, relativePath) => backend.readDocFile(projectId, relativePath));
  safeHandle('doc:conversation:save', (_, sessionId) => backend.saveConversationHistory(sessionId));
  safeHandle('doc:project:open', async (_, id) => {
    const project = await backend.getDocProject(id);
    if (project && project.path) {
      const { shell } = require('electron');
      await shell.openPath(project.path);
      return { success: true };
    }
    return { success: false };
  });

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
      // Auto-save to doc project (fire and forget)
      backend.saveAgentDoc(sessionId, message, result.content).catch(() => {});
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
