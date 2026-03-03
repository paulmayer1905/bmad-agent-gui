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

    // ── Node.js / package.json ──────────────────────────────────────────
    if (filePaths.includes('package.json')) {
      commands.install = 'npm install';
      try {
        const pkg = JSON.parse(await fs.readFile(path.join(workspace.path, 'package.json'), 'utf8'));
        const scripts = pkg.scripts || {};
        if (scripts.dev) commands.dev = 'npm run dev';
        else if (scripts.serve) commands.dev = 'npm run serve';
        else if (scripts.start) commands.dev = 'npm start';
        if (scripts.build) commands.build = 'npm run build';
        if (scripts.start) commands.start = 'npm start';
        if (scripts.electron) commands.start = 'npm run electron';
        if (scripts['electron:dev']) commands.dev = 'npm run electron:dev';
        if (scripts['tauri:dev'] || scripts['tauri']) commands.dev = 'npm run tauri dev';
      } catch { /* ignore */ }
    }

    // ── Python ───────────────────────────────────────────────────────────
    if (filePaths.includes('requirements.txt') || filePaths.includes('pyproject.toml') || filePaths.includes('setup.py')) {
      if (filePaths.includes('requirements.txt')) {
        commands.install = 'pip install -r requirements.txt';
      } else if (filePaths.includes('pyproject.toml')) {
        commands.install = 'pip install -e .';
      } else {
        commands.install = 'pip install -e .';
      }
      if (filePaths.some(f => f.includes('manage.py'))) {
        commands.dev = 'python manage.py runserver';
      } else if (filePaths.some(f => f.match(/^(app|main|server|run)\.py$/))) {
        const entry = filePaths.find(f => f.match(/^(app|main|server|run)\.py$/));
        commands.dev = `python ${entry}`;
        commands.start = `python ${entry}`;
      }
      if (filePaths.includes('setup.py')) {
        commands.build = 'python setup.py build';
      }
    }

    // ── Rust / Cargo ─────────────────────────────────────────────────────
    if (filePaths.includes('Cargo.toml')) {
      commands.install = 'cargo fetch';
      commands.build = 'cargo build --release';
      commands.dev = 'cargo run';
      commands.start = 'cargo run --release';
    }

    // ── Go ───────────────────────────────────────────────────────────────
    if (filePaths.includes('go.mod')) {
      commands.install = 'go mod download';
      commands.build = 'go build -o app .';
      commands.dev = 'go run .';
      commands.start = process.platform === 'win32' ? '.\\app.exe' : './app';
    }

    // ── Java / Maven ─────────────────────────────────────────────────────
    if (filePaths.includes('pom.xml')) {
      const mvn = process.platform === 'win32' ? 'mvn.cmd' : 'mvn';
      commands.install = `${mvn} install -DskipTests`;
      commands.build = `${mvn} package`;
      commands.dev = `${mvn} spring-boot:run`;
      commands.start = 'java -jar target/*.jar';
    }

    // ── Java / Gradle ────────────────────────────────────────────────────
    if (filePaths.includes('build.gradle') || filePaths.includes('build.gradle.kts')) {
      const gw = process.platform === 'win32' ? '.\\gradlew.bat' : './gradlew';
      const hasWrapper = filePaths.includes('gradlew') || filePaths.includes('gradlew.bat');
      const gradle = hasWrapper ? gw : 'gradle';
      commands.install = `${gradle} dependencies`;
      commands.build = `${gradle} build`;
      commands.dev = `${gradle} bootRun`;
      commands.start = 'java -jar build/libs/*.jar';
    }

    // ── .NET / C# ────────────────────────────────────────────────────────
    if (filePaths.some(f => f.endsWith('.csproj') || f.endsWith('.sln'))) {
      commands.install = 'dotnet restore';
      commands.build = 'dotnet build --configuration Release';
      commands.dev = 'dotnet run';
      commands.start = 'dotnet run --configuration Release';
    }

    // ── C/C++ / CMake ────────────────────────────────────────────────────
    if (filePaths.includes('CMakeLists.txt')) {
      commands.install = 'cmake -B build -S .';
      commands.build = 'cmake --build build --config Release';
      commands.dev = 'cmake --build build && ' + (process.platform === 'win32' ? '.\\build\\Debug\\app.exe' : './build/app');
      commands.start = process.platform === 'win32' ? '.\\build\\Release\\app.exe' : './build/app';
    }

    // ── C/C++ / Makefile ─────────────────────────────────────────────────
    if (filePaths.includes('Makefile') && !commands.build) {
      commands.build = 'make';
      commands.dev = 'make run';
      commands.start = 'make run';
    }

    // ── Flutter / Dart ───────────────────────────────────────────────────
    if (filePaths.includes('pubspec.yaml')) {
      commands.install = 'flutter pub get';
      commands.build = 'flutter build';
      commands.dev = 'flutter run';
      commands.start = 'flutter run --release';
    }

    // ── Ruby / Bundler ───────────────────────────────────────────────────
    if (filePaths.includes('Gemfile')) {
      commands.install = 'bundle install';
      if (filePaths.includes('config.ru') || filePaths.some(f => f.includes('config/application.rb'))) {
        commands.dev = 'bundle exec rails server';
        commands.start = 'bundle exec rails server -e production';
      } else if (filePaths.some(f => f.match(/^(app|server|main)\.rb$/))) {
        const entry = filePaths.find(f => f.match(/^(app|server|main)\.rb$/));
        commands.dev = `ruby ${entry}`;
      }
    }

    // ── PHP / Composer ───────────────────────────────────────────────────
    if (filePaths.includes('composer.json')) {
      commands.install = 'composer install';
      if (filePaths.includes('artisan')) {
        commands.dev = 'php artisan serve';
        commands.start = 'php artisan serve';
      } else if (filePaths.some(f => f.match(/^(index|server|app)\.php$/))) {
        commands.dev = 'php -S localhost:8080';
        commands.start = 'php -S localhost:8080';
      }
    }

    // ── Static HTML (fallback) ───────────────────────────────────────────
    if (filePaths.includes('index.html') && !commands.install && !commands.dev) {
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
  // ─── Desktop shortcut ──────────────────────────────────────────────

  /**
   * Create a desktop shortcut for the project.
   * - For web apps: .url shortcut pointing to localhost URL
   * - For desktop apps: .lnk shortcut pointing to the executable
   * - Fallback: .lnk shortcut that opens the project folder
   * @param {string} workspaceId
   * @param {object} options - { url, exePath, iconPath }
   */
  async createDesktopShortcut(workspaceId, options = {}) {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) throw new Error('WORKSPACE_NOT_FOUND');

    const desktop = path.join(os.homedir(), 'Desktop');
    const safeName = workspace.name.replace(/[^a-zA-Z0-9_ -]/g, '-');

    // ── Web app: create .url shortcut ────────────────────────────────
    if (options.url) {
      const shortcutPath = path.join(desktop, `${safeName}.url`);
      const urlContent = `[InternetShortcut]\nURL=${options.url}\n`;
      // Add icon if available
      let content = urlContent;
      if (options.iconPath && fsSync.existsSync(options.iconPath)) {
        content += `IconFile=${options.iconPath}\nIconIndex=0\n`;
      }
      await fs.writeFile(shortcutPath, content, 'utf8');
      return { success: true, type: 'url', path: shortcutPath };
    }

    // ── Desktop app: create .lnk shortcut (Windows only) ─────────────
    if (process.platform === 'win32') {
      const shortcutPath = path.join(desktop, `${safeName}.lnk`);

      // Determine target: explicit exe, or auto-detect in workspace
      let targetExe = options.exePath || null;
      if (!targetExe) {
        targetExe = await this._findExecutable(workspace);
      }

      // Determine icon
      let iconLocation = options.iconPath || '';
      if (!iconLocation) {
        iconLocation = await this._findIcon(workspace) || targetExe || '';
      }

      if (targetExe) {
        // Create .lnk via PowerShell WScript.Shell COM
        const ps = `
          $ws = New-Object -ComObject WScript.Shell;
          $s = $ws.CreateShortcut('${shortcutPath.replace(/'/g, "''")}');
          $s.TargetPath = '${targetExe.replace(/'/g, "''")}'; 
          $s.WorkingDirectory = '${workspace.path.replace(/'/g, "''")}'; 
          $s.Description = '${safeName} - BMAD Project'; 
          ${iconLocation ? `$s.IconLocation = '${iconLocation.replace(/'/g, "''")}';` : ''}
          $s.Save();
        `.replace(/\n\s+/g, ' ');

        try {
          execSync(`powershell -NoProfile -Command "${ps}"`, { timeout: 10000 });
          return { success: true, type: 'lnk', path: shortcutPath };
        } catch (err) {
          return { success: false, error: err.message };
        }
      }

      // Fallback: shortcut to project folder
      const ps = `
        $ws = New-Object -ComObject WScript.Shell;
        $s = $ws.CreateShortcut('${shortcutPath.replace(/'/g, "''")}');
        $s.TargetPath = '${workspace.path.replace(/'/g, "''")}'; 
        $s.Description = '${safeName} - BMAD Project'; 
        $s.Save();
      `.replace(/\n\s+/g, ' ');

      try {
        execSync(`powershell -NoProfile -Command "${ps}"`, { timeout: 10000 });
        return { success: true, type: 'folder', path: shortcutPath };
      } catch (err) {
        return { success: false, error: err.message };
      }
    }

    // macOS / Linux: create a .desktop or alias
    if (process.platform === 'darwin') {
      // Create a simple shell alias script
      const scriptPath = path.join(desktop, `${safeName}.command`);
      const targetExe = options.exePath || await this._findExecutable(workspace);
      const script = targetExe
        ? `#!/bin/bash\ncd "${workspace.path}"\n"${targetExe}"\n`
        : `#!/bin/bash\nopen "${workspace.path}"\n`;
      await fs.writeFile(scriptPath, script, 'utf8');
      await fs.chmod(scriptPath, 0o755);
      return { success: true, type: 'command', path: scriptPath };
    }

    // Linux .desktop file
    const desktopPath = path.join(desktop, `${safeName}.desktop`);
    const targetExe = options.exePath || await this._findExecutable(workspace);
    const icon = options.iconPath || await this._findIcon(workspace) || '';
    const entry = [
      '[Desktop Entry]',
      'Type=Application',
      `Name=${workspace.name}`,
      `Comment=${safeName} - BMAD Project`,
      `Exec=${targetExe || `xdg-open "${workspace.path}"`}`,
      `Path=${workspace.path}`,
      icon ? `Icon=${icon}` : '',
      'Terminal=false',
    ].filter(Boolean).join('\n');
    await fs.writeFile(desktopPath, entry + '\n', 'utf8');
    await fs.chmod(desktopPath, 0o755);
    return { success: true, type: 'desktop', path: desktopPath };
  }

  /**
   * Find an executable in the workspace (built app, Electron, etc.)
   */
  async _findExecutable(workspace) {
    const candidates = [
      // Electron packaged output
      'dist/**/*.exe', 'out/**/*.exe', 'release/**/*.exe',
      // Go / Rust / C built binaries
      'build/Release/*.exe', 'target/release/*.exe',
      'build/*.exe', '*.exe',
    ];
    // Simple search: look for .exe files recursively (max 2 levels deep)
    try {
      const files = await this._findFiles(workspace.path, '.exe', 3);
      if (files.length > 0) return files[0];
    } catch { /* ignore */ }

    // Check if it's a Node project that can be launched via node/npm
    const pkgPath = path.join(workspace.path, 'package.json');
    if (fsSync.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf8'));
        if (pkg.main) {
          // Return node as the launcher
          return process.execPath; // node.exe itself
        }
      } catch { /* ignore */ }
    }
    return null;
  }

  /**
   * Find an icon file in the workspace (.ico, .png, .svg)
   */
  async _findIcon(workspace) {
    const iconExts = ['.ico', '.png', '.svg'];
    for (const ext of iconExts) {
      try {
        const files = await this._findFiles(workspace.path, ext, 3);
        // Prefer files named icon, logo, favicon
        const preferred = files.find(f => {
          const name = path.basename(f).toLowerCase();
          return name.includes('icon') || name.includes('logo') || name.includes('favicon');
        });
        if (preferred) return preferred;
        if (files.length > 0) return files[0];
      } catch { /* ignore */ }
    }
    return null;
  }

  /**
   * Find files with a given extension recursively (limited depth)
   */
  async _findFiles(dir, ext, maxDepth, depth = 0) {
    if (depth >= maxDepth) return [];
    const results = [];
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (['node_modules', '.git', '__pycache__', 'venv', '.venv'].includes(entry.name)) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          const sub = await this._findFiles(full, ext, maxDepth, depth + 1);
          results.push(...sub);
        } else if (entry.name.endsWith(ext)) {
          results.push(full);
        }
      }
    } catch { /* ignore */ }
    return results;
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
