/**
 * Workspace Manager - Creates and manages real project workspaces on disk
 * Extracts code blocks from LLM responses and writes actual files.
 * Can run shell commands (npm install, npm start, etc.)
 */

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync, spawn } = require('child_process');
const os = require('os');

class WorkspaceManager {
  constructor(options = {}) {
    this.baseDir = options.baseDir || path.join(os.homedir(), 'Desktop', 'bmad-projects');
    this.workspaces = new Map(); // id -> workspace state
  }

  async initialize() {
    await fs.mkdir(this.baseDir, { recursive: true });
    // Scan existing workspaces
    try {
      const dirs = await fs.readdir(this.baseDir, { withFileTypes: true });
      for (const d of dirs.filter(d => d.isDirectory())) {
        const metaPath = path.join(this.baseDir, d.name, '.bmad-workspace.json');
        try {
          const meta = JSON.parse(await fs.readFile(metaPath, 'utf8'));
          this.workspaces.set(meta.id, meta);
        } catch { /* not a bmad workspace */ }
      }
    } catch { /* base dir doesn't exist yet */ }
  }

  // ─── Create workspace ──────────────────────────────────────────────────

  async createWorkspace(options = {}) {
    const id = `ws-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const name = options.name || 'nouveau-projet';
    const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase();
    const projectDir = path.join(this.baseDir, safeName);

    // If dir exists, add suffix
    let finalDir = projectDir;
    let suffix = 1;
    while (fsSync.existsSync(finalDir)) {
      finalDir = `${projectDir}-${suffix++}`;
    }

    await fs.mkdir(finalDir, { recursive: true });

    const workspace = {
      id,
      name,
      path: finalDir,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      files: [],
      techStack: options.techStack || null,
      description: options.description || '',
      type: options.type || 'web', // 'web', 'desktop', 'fullstack', 'api'
      commands: {
        install: null,
        dev: null,
        build: null,
        start: null
      },
      status: 'created' // created, generating, ready, running
    };

    // Save metadata
    await this._saveMeta(workspace);
    this.workspaces.set(id, workspace);

    return workspace;
  }

  // ─── Write files from code blocks ──────────────────────────────────────

  /**
   * Parse an LLM response and extract code blocks with file paths.
   * Supports formats:
   *   ```filename:path/to/file.js     (preferred)
   *   ```path/to/file.js
   *   // FILE: path/to/file.js        (comment-based)
   *   <!-- FILE: path/to/file.html -->
   * Returns: [{ filePath, language, content }]
   */
  parseCodeBlocks(response) {
    const blocks = [];
    
    // Pattern 1: ```filename:path/to/file.ext or ```path/to/file.ext
    const fencedRegex = /```(?:filename:)?([^\s`]+\.[a-zA-Z0-9]+)\s*\n([\s\S]*?)```/g;
    let match;
    while ((match = fencedRegex.exec(response)) !== null) {
      const filePath = match[1].trim();
      const content = match[2].trim();
      if (filePath && content && filePath.includes('.')) {
        const ext = path.extname(filePath).slice(1);
        blocks.push({ filePath, language: ext, content });
      }
    }

    // Pattern 2: ```lang\n// FILE: path/to/file.ext\n...```
    if (blocks.length === 0) {
      const langRegex = /```(\w+)\s*\n\s*(?:\/\/|#|<!--)\s*FILE:\s*([^\n]+?)(?:-->)?\s*\n([\s\S]*?)```/g;
      while ((match = langRegex.exec(response)) !== null) {
        const language = match[1].trim();
        const filePath = match[2].trim();
        const content = match[3].trim();
        if (filePath && content) {
          blocks.push({ filePath, language, content });
        }
      }
    }

    // Pattern 3: Numbered file blocks like "**1. path/to/file.js**\n```js\n..."
    if (blocks.length === 0) {
      const numberedRegex = /\*{0,2}\d+\.\s*`?([^\s`*]+\.[a-zA-Z0-9]+)`?\*{0,2}\s*\n```\w*\s*\n([\s\S]*?)```/g;
      while ((match = numberedRegex.exec(response)) !== null) {
        const filePath = match[1].trim();
        const content = match[2].trim();
        if (filePath && content) {
          const ext = path.extname(filePath).slice(1);
          blocks.push({ filePath, language: ext, content });
        }
      }
    }

    return blocks;
  }

  /**
   * Extract code blocks from a response and write them to the workspace.
   * Returns the list of files written.
   */
  async writeCodeBlocks(workspaceId, response, options = {}) {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) throw new Error('WORKSPACE_NOT_FOUND');

    const blocks = this.parseCodeBlocks(response);
    const written = [];

    for (const block of blocks) {
      try {
        const fullPath = path.join(workspace.path, block.filePath);
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        await fs.writeFile(fullPath, block.content, 'utf8');

        const fileEntry = {
          path: block.filePath,
          language: block.language,
          size: Buffer.byteLength(block.content),
          writtenAt: Date.now(),
          agent: options.agent || 'unknown'
        };

        // Track in workspace file list
        const existingIdx = workspace.files.findIndex(f => f.path === block.filePath);
        if (existingIdx >= 0) {
          workspace.files[existingIdx] = fileEntry;
        } else {
          workspace.files.push(fileEntry);
        }

        written.push(fileEntry);
      } catch (err) {
        console.error(`Failed to write ${block.filePath}:`, err.message);
      }
    }

    workspace.updatedAt = Date.now();
    await this._saveMeta(workspace);

    return { written, total: blocks.length };
  }

  /**
   * Write a single file to the workspace.
   */
  async writeFile(workspaceId, filePath, content, options = {}) {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) throw new Error('WORKSPACE_NOT_FOUND');

    const fullPath = path.join(workspace.path, filePath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content, 'utf8');

    const ext = path.extname(filePath).slice(1);
    const fileEntry = {
      path: filePath,
      language: ext,
      size: Buffer.byteLength(content),
      writtenAt: Date.now(),
      agent: options.agent || 'unknown'
    };

    const existingIdx = workspace.files.findIndex(f => f.path === filePath);
    if (existingIdx >= 0) {
      workspace.files[existingIdx] = fileEntry;
    } else {
      workspace.files.push(fileEntry);
    }

    workspace.updatedAt = Date.now();
    await this._saveMeta(workspace);
    return fileEntry;
  }

  // ─── Read file from workspace ──────────────────────────────────────────

  async readFile(workspaceId, filePath) {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) throw new Error('WORKSPACE_NOT_FOUND');

    const fullPath = path.join(workspace.path, filePath);
    const content = await fs.readFile(fullPath, 'utf8');
    return { path: filePath, content };
  }

  // ─── Run commands ──────────────────────────────────────────────────────

  /**
   * Run a shell command in the workspace directory.
   * Returns { stdout, stderr, exitCode }
   */
  runCommandSync(workspaceId, command, options = {}) {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) throw new Error('WORKSPACE_NOT_FOUND');

    try {
      const stdout = execSync(command, {
        cwd: workspace.path,
        encoding: 'utf8',
        timeout: options.timeout || 120000,
        env: { ...process.env, ...options.env },
        shell: true
      });
      return { stdout, stderr: '', exitCode: 0 };
    } catch (err) {
      return {
        stdout: err.stdout || '',
        stderr: err.stderr || err.message,
        exitCode: err.status || 1
      };
    }
  }

  /**
   * Run a command in background (for dev servers, etc.)
   * Returns a process handle ID
   */
  runCommandBackground(workspaceId, command, options = {}) {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) throw new Error('WORKSPACE_NOT_FOUND');

    const child = spawn(command, {
      cwd: workspace.path,
      shell: true,
      detached: false,
      env: { ...process.env, ...options.env }
    });

    const processId = `proc-${Date.now()}`;
    const output = { stdout: '', stderr: '' };

    child.stdout?.on('data', (data) => { output.stdout += data.toString(); });
    child.stderr?.on('data', (data) => { output.stderr += data.toString(); });

    if (!workspace._processes) workspace._processes = {};
    workspace._processes[processId] = { child, output, command, startedAt: Date.now() };

    return { processId, pid: child.pid };
  }

  /**
   * Get output from a background process
   */
  getProcessOutput(workspaceId, processId) {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace?._processes?.[processId]) return null;
    const proc = workspace._processes[processId];
    return {
      stdout: proc.output.stdout.slice(-5000),
      stderr: proc.output.stderr.slice(-5000),
      running: !proc.child.killed && proc.child.exitCode === null,
      command: proc.command
    };
  }

  /**
   * Kill a background process
   */
  killProcess(workspaceId, processId) {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace?._processes?.[processId]) return false;
    try {
      workspace._processes[processId].child.kill();
      return true;
    } catch { return false; }
  }

  // ─── Setup commands detection ──────────────────────────────────────────

  /**
   * Auto-detect setup commands based on files in workspace
   */
  async detectSetupCommands(workspaceId) {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) throw new Error('WORKSPACE_NOT_FOUND');

    const commands = { install: null, dev: null, build: null, start: null };
    const filePaths = workspace.files.map(f => f.path);

    // Check for package.json
    if (filePaths.includes('package.json')) {
      commands.install = 'npm install';
      try {
        const pkg = JSON.parse(await fs.readFile(path.join(workspace.path, 'package.json'), 'utf8'));
        const scripts = pkg.scripts || {};
        if (scripts.dev) commands.dev = 'npm run dev';
        else if (scripts.start) commands.dev = 'npm start';
        if (scripts.build) commands.build = 'npm run build';
        if (scripts.start) commands.start = 'npm start';
        if (scripts.electron) commands.start = 'npm run electron';
      } catch { /* ignore */ }
    }

    // Python
    if (filePaths.includes('requirements.txt')) {
      commands.install = 'pip install -r requirements.txt';
      if (filePaths.some(f => f.includes('manage.py'))) {
        commands.dev = 'python manage.py runserver';
      } else if (filePaths.some(f => f.includes('app.py') || f.includes('main.py'))) {
        commands.dev = 'python app.py';
      }
    }

    // Static HTML — just open in browser
    if (filePaths.includes('index.html') && !filePaths.includes('package.json')) {
      commands.start = process.platform === 'win32'
        ? `start "" "${path.join(workspace.path, 'index.html')}"`
        : `open "${path.join(workspace.path, 'index.html')}"`;
    }

    workspace.commands = commands;
    await this._saveMeta(workspace);
    return commands;
  }

  // ─── List / Get / Delete ───────────────────────────────────────────────

  getWorkspace(id) {
    const ws = this.workspaces.get(id);
    if (!ws) return null;
    return { ...ws, _processes: undefined };
  }

  listWorkspaces() {
    return [...this.workspaces.values()]
      .map(ws => ({
        id: ws.id,
        name: ws.name,
        path: ws.path,
        type: ws.type,
        status: ws.status,
        fileCount: ws.files.length,
        createdAt: ws.createdAt,
        updatedAt: ws.updatedAt,
        description: ws.description
      }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async deleteWorkspace(id) {
    const ws = this.workspaces.get(id);
    if (!ws) throw new Error('WORKSPACE_NOT_FOUND');

    // Kill any running processes
    if (ws._processes) {
      for (const proc of Object.values(ws._processes)) {
        try { proc.child.kill(); } catch { /* ignore */ }
      }
    }

    // Remove directory
    await fs.rm(ws.path, { recursive: true, force: true });
    this.workspaces.delete(id);
    return { success: true };
  }

  /**
   * Open workspace folder in system file explorer
   */
  getWorkspacePath(id) {
    const ws = this.workspaces.get(id);
    if (!ws) return null;
    return ws.path;
  }

  // ─── File tree ─────────────────────────────────────────────────────────

  async getFileTree(workspaceId) {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) throw new Error('WORKSPACE_NOT_FOUND');

    const tree = await this._scanDir(workspace.path, '', 0);
    return tree;
  }

  async _scanDir(basePath, relativePath, depth) {
    if (depth > 5) return []; // prevent deep recursion
    const fullPath = path.join(basePath, relativePath);
    const entries = await fs.readdir(fullPath, { withFileTypes: true });
    const items = [];

    for (const entry of entries) {
      // Skip node_modules, .git, etc.
      if (['node_modules', '.git', '__pycache__', '.bmad-workspace.json'].includes(entry.name)) continue;

      const relPath = path.join(relativePath, entry.name).replace(/\\/g, '/');
      if (entry.isDirectory()) {
        const children = await this._scanDir(basePath, relPath, depth + 1);
        items.push({ name: entry.name, path: relPath, type: 'dir', children });
      } else {
        const stat = await fs.stat(path.join(fullPath, entry.name));
        items.push({
          name: entry.name,
          path: relPath,
          type: 'file',
          size: stat.size,
          ext: path.extname(entry.name).slice(1)
        });
      }
    }

    return items.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }

  // ─── Internal ──────────────────────────────────────────────────────────

  async _saveMeta(workspace) {
    const meta = { ...workspace, _processes: undefined };
    await fs.writeFile(
      path.join(workspace.path, '.bmad-workspace.json'),
      JSON.stringify(meta, null, 2)
    );
  }
}

module.exports = WorkspaceManager;
