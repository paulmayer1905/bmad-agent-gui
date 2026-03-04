/**
 * Tests for WorkspaceManager — Extended features (desktop shortcuts, 12 stack detection)
 * Covers features from commits ada1be1, bdc39fc
 */

const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const os = require('os');
const crypto = require('crypto');

const WorkspaceManager = require('../workspace-manager');

// ─── Test helpers ─────────────────────────────────────────────────────────

let testBaseDir;
let manager;

function uniqueDir() {
  return path.join(os.tmpdir(), `bmad-ws-test-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`);
}

beforeEach(async () => {
  testBaseDir = uniqueDir();
  manager = new WorkspaceManager({ baseDir: testBaseDir });
  await manager.initialize();
});

afterEach(async () => {
  try {
    await fs.rm(testBaseDir, { recursive: true, force: true });
  } catch { /* ignore */ }
});

// Helper to create workspace with specific files
async function createWorkspaceWithFiles(name, files) {
  const ws = await manager.createWorkspace({ name });
  for (const [filePath, content] of Object.entries(files)) {
    await manager.writeFile(ws.id, filePath, content);
  }
  return ws;
}

// ═══════════════════════════════════════════════════════════════════════════
//  detectSetupCommands — 12 Tech Stacks
// ═══════════════════════════════════════════════════════════════════════════

describe('WorkspaceManager — detectSetupCommands', () => {

  test('Node.js / package.json with dev+build scripts', async () => {
    const ws = await createWorkspaceWithFiles('node-app', {
      'package.json': JSON.stringify({
        name: 'test',
        scripts: { dev: 'vite', build: 'vite build', start: 'node server.js' }
      }),
      'src/index.js': 'console.log("hello");'
    });

    const cmds = await manager.detectSetupCommands(ws.id);
    expect(cmds.install).toBe('npm install');
    expect(cmds.dev).toBe('npm run dev');
    expect(cmds.build).toBe('npm run build');
    expect(cmds.start).toBe('npm start');
  });

  test('Node.js / Electron project', async () => {
    const ws = await createWorkspaceWithFiles('electron-app', {
      'package.json': JSON.stringify({
        name: 'electron-test',
        scripts: { 'electron:dev': 'electron .', start: 'electron .' }
      }),
      'main.js': 'const { app } = require("electron");'
    });

    const cmds = await manager.detectSetupCommands(ws.id);
    expect(cmds.install).toBe('npm install');
    expect(cmds.dev).toBe('npm run electron:dev');
  });

  test('Node.js / Tauri project', async () => {
    const ws = await createWorkspaceWithFiles('tauri-app', {
      'package.json': JSON.stringify({
        name: 'tauri-test',
        scripts: { 'tauri:dev': 'tauri dev', build: 'tauri build' }
      }),
      'src-tauri/tauri.conf.json': '{}'
    });

    const cmds = await manager.detectSetupCommands(ws.id);
    expect(cmds.dev).toBe('npm run tauri dev');
  });

  test('Node.js / serve script (no dev)', async () => {
    const ws = await createWorkspaceWithFiles('serve-app', {
      'package.json': JSON.stringify({
        name: 'serve-test',
        scripts: { serve: 'vue-cli-service serve' }
      }),
      'src/main.js': ''
    });

    const cmds = await manager.detectSetupCommands(ws.id);
    expect(cmds.dev).toBe('npm run serve');
  });

  test('Python / requirements.txt', async () => {
    const ws = await createWorkspaceWithFiles('python-app', {
      'requirements.txt': 'flask==3.0\n',
      'app.py': 'from flask import Flask'
    });

    const cmds = await manager.detectSetupCommands(ws.id);
    expect(cmds.install).toBe('pip install -r requirements.txt');
    expect(cmds.dev).toBe('python app.py');
    expect(cmds.start).toBe('python app.py');
  });

  test('Python / Django (manage.py)', async () => {
    const ws = await createWorkspaceWithFiles('django-app', {
      'requirements.txt': 'django==5.0\n',
      'manage.py': '#!/usr/bin/env python'
    });

    const cmds = await manager.detectSetupCommands(ws.id);
    expect(cmds.install).toBe('pip install -r requirements.txt');
    expect(cmds.dev).toBe('python manage.py runserver');
  });

  test('Python / pyproject.toml', async () => {
    const ws = await createWorkspaceWithFiles('pyproject-app', {
      'pyproject.toml': '[project]\nname = "test"',
      'main.py': 'print("hello")'
    });

    const cmds = await manager.detectSetupCommands(ws.id);
    expect(cmds.install).toBe('pip install -e .');
    expect(cmds.dev).toBe('python main.py');
  });

  test('Rust / Cargo', async () => {
    const ws = await createWorkspaceWithFiles('rust-app', {
      'Cargo.toml': '[package]\nname = "test"\nversion = "0.1.0"',
      'src/main.rs': 'fn main() { println!("Hello"); }'
    });

    const cmds = await manager.detectSetupCommands(ws.id);
    expect(cmds.install).toBe('cargo fetch');
    expect(cmds.build).toBe('cargo build --release');
    expect(cmds.dev).toBe('cargo run');
    expect(cmds.start).toBe('cargo run --release');
  });

  test('Go / go.mod', async () => {
    const ws = await createWorkspaceWithFiles('go-app', {
      'go.mod': 'module example.com/test\ngo 1.21',
      'main.go': 'package main'
    });

    const cmds = await manager.detectSetupCommands(ws.id);
    expect(cmds.install).toBe('go mod download');
    expect(cmds.build).toBe('go build -o app .');
    expect(cmds.dev).toBe('go run .');
    expect(cmds.start).toMatch(/app/);
  });

  test('Java / Maven (pom.xml)', async () => {
    const ws = await createWorkspaceWithFiles('java-maven', {
      'pom.xml': '<project><modelVersion>4.0.0</modelVersion></project>',
      'src/main/java/App.java': 'public class App {}'
    });

    const cmds = await manager.detectSetupCommands(ws.id);
    expect(cmds.install).toMatch(/mvn.*install/);
    expect(cmds.build).toMatch(/mvn.*package/);
    expect(cmds.dev).toMatch(/mvn.*spring-boot:run/);
    expect(cmds.start).toContain('java -jar');
  });

  test('Java / Gradle (build.gradle)', async () => {
    const ws = await createWorkspaceWithFiles('java-gradle', {
      'build.gradle': 'plugins { id "java" }',
      'src/main/java/App.java': 'public class App {}'
    });

    const cmds = await manager.detectSetupCommands(ws.id);
    expect(cmds.install).toMatch(/gradle.*dependencies/);
    expect(cmds.build).toMatch(/gradle.*build/);
    expect(cmds.dev).toMatch(/gradle.*bootRun/);
    expect(cmds.start).toContain('java -jar');
  });

  test('Java / Gradle with wrapper (gradlew)', async () => {
    const ws = await createWorkspaceWithFiles('java-gradle-wrapper', {
      'build.gradle.kts': 'plugins { id("java") }',
      'gradlew': '#!/bin/sh',
      'gradlew.bat': '@echo off'
    });

    const cmds = await manager.detectSetupCommands(ws.id);
    // Should use the wrapper, not bare gradle
    const expectedPrefix = process.platform === 'win32' ? '.\\gradlew.bat' : './gradlew';
    expect(cmds.install).toContain(expectedPrefix);
    expect(cmds.build).toContain(expectedPrefix);
  });

  test('.NET / C# (.csproj)', async () => {
    const ws = await createWorkspaceWithFiles('dotnet-app', {
      'MyApp.csproj': '<Project Sdk="Microsoft.NET.Sdk"></Project>',
      'Program.cs': 'Console.WriteLine("Hello");'
    });

    const cmds = await manager.detectSetupCommands(ws.id);
    expect(cmds.install).toBe('dotnet restore');
    expect(cmds.build).toContain('dotnet build');
    expect(cmds.dev).toBe('dotnet run');
    expect(cmds.start).toContain('dotnet run');
  });

  test('.NET / C# (.sln)', async () => {
    const ws = await createWorkspaceWithFiles('dotnet-sln', {
      'MySolution.sln': 'Microsoft Visual Studio Solution File'
    });

    const cmds = await manager.detectSetupCommands(ws.id);
    expect(cmds.install).toBe('dotnet restore');
  });

  test('C/C++ / CMake', async () => {
    const ws = await createWorkspaceWithFiles('cmake-app', {
      'CMakeLists.txt': 'cmake_minimum_required(VERSION 3.20)',
      'src/main.cpp': 'int main() {}'
    });

    const cmds = await manager.detectSetupCommands(ws.id);
    expect(cmds.install).toContain('cmake -B build');
    expect(cmds.build).toContain('cmake --build');
  });

  test('C/C++ / Makefile (no cmake)', async () => {
    const ws = await createWorkspaceWithFiles('make-app', {
      'Makefile': 'all:\n\tgcc main.c -o app',
      'main.c': 'int main() {}'
    });

    const cmds = await manager.detectSetupCommands(ws.id);
    expect(cmds.build).toBe('make');
    expect(cmds.dev).toBe('make run');
  });

  test('Flutter / Dart (pubspec.yaml)', async () => {
    const ws = await createWorkspaceWithFiles('flutter-app', {
      'pubspec.yaml': 'name: my_app\ndescription: A Flutter project',
      'lib/main.dart': 'void main() {}'
    });

    const cmds = await manager.detectSetupCommands(ws.id);
    expect(cmds.install).toBe('flutter pub get');
    expect(cmds.build).toBe('flutter build');
    expect(cmds.dev).toBe('flutter run');
    expect(cmds.start).toBe('flutter run --release');
  });

  test('Ruby / Bundler (Gemfile)', async () => {
    const ws = await createWorkspaceWithFiles('ruby-app', {
      'Gemfile': 'source "https://rubygems.org"\ngem "sinatra"',
      'app.rb': 'require "sinatra"'
    });

    const cmds = await manager.detectSetupCommands(ws.id);
    expect(cmds.install).toBe('bundle install');
    expect(cmds.dev).toBe('ruby app.rb');
  });

  test('Ruby / Rails (config.ru + config/application.rb)', async () => {
    const ws = await createWorkspaceWithFiles('rails-app', {
      'Gemfile': 'source "https://rubygems.org"',
      'config.ru': 'require_relative "config/environment"'
    });

    const cmds = await manager.detectSetupCommands(ws.id);
    expect(cmds.install).toBe('bundle install');
    expect(cmds.dev).toContain('rails server');
    expect(cmds.start).toContain('rails server');
  });

  test('PHP / Composer', async () => {
    const ws = await createWorkspaceWithFiles('php-app', {
      'composer.json': '{"name": "vendor/app"}',
      'index.php': '<?php echo "Hello";'
    });

    const cmds = await manager.detectSetupCommands(ws.id);
    expect(cmds.install).toBe('composer install');
    expect(cmds.dev).toBe('php -S localhost:8080');
  });

  test('PHP / Laravel (artisan)', async () => {
    const ws = await createWorkspaceWithFiles('laravel-app', {
      'composer.json': '{"name": "vendor/laravel-app"}',
      'artisan': '#!/usr/bin/env php'
    });

    const cmds = await manager.detectSetupCommands(ws.id);
    expect(cmds.install).toBe('composer install');
    expect(cmds.dev).toBe('php artisan serve');
    expect(cmds.start).toBe('php artisan serve');
  });

  test('Static HTML (index.html, no other detections)', async () => {
    const ws = await createWorkspaceWithFiles('static-html', {
      'index.html': '<!DOCTYPE html><html><body>Hello</body></html>',
      'style.css': 'body { color: red; }'
    });

    const cmds = await manager.detectSetupCommands(ws.id);
    expect(cmds.install).toBeNull();
    expect(cmds.start).toContain('index.html');
  });

  test('should throw for unknown workspace', async () => {
    await expect(manager.detectSetupCommands('nonexistent')).rejects.toThrow('WORKSPACE_NOT_FOUND');
  });

  test('should return all nulls for empty workspace', async () => {
    const ws = await manager.createWorkspace({ name: 'empty' });
    const cmds = await manager.detectSetupCommands(ws.id);
    expect(cmds.install).toBeNull();
    expect(cmds.dev).toBeNull();
    expect(cmds.build).toBeNull();
    expect(cmds.start).toBeNull();
  });

  test('should save commands to workspace meta', async () => {
    const ws = await createWorkspaceWithFiles('rust-meta', {
      'Cargo.toml': '[package]\nname = "test"',
      'src/main.rs': 'fn main() {}'
    });

    await manager.detectSetupCommands(ws.id);

    // Re-read from disk
    const metaPath = path.join(ws.path, '.bmad-workspace.json');
    const meta = JSON.parse(await fs.readFile(metaPath, 'utf8'));
    expect(meta.commands.install).toBe('cargo fetch');
    expect(meta.commands.build).toBe('cargo build --release');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  createDesktopShortcut
// ═══════════════════════════════════════════════════════════════════════════

describe('WorkspaceManager — createDesktopShortcut', () => {
  test('should create .url shortcut for web apps', async () => {
    const ws = await manager.createWorkspace({ name: 'web-shortcut' });

    const result = await manager.createDesktopShortcut(ws.id, {
      url: 'http://localhost:3000'
    });

    expect(result.success).toBe(true);
    expect(result.type).toBe('url');
    expect(result.path).toContain('.url');

    // Check the .url file content
    const content = await fs.readFile(result.path, 'utf8');
    expect(content).toContain('[InternetShortcut]');
    expect(content).toContain('URL=http://localhost:3000');

    // Cleanup
    try { await fs.unlink(result.path); } catch { /* ignore */ }
  });

  test('should include icon in .url shortcut', async () => {
    const ws = await manager.createWorkspace({ name: 'web-icon' });
    // Create a fake icon file in workspace
    const iconPath = path.join(ws.path, 'icon.ico');
    await fs.writeFile(iconPath, 'fake-icon-data', 'utf8');

    const result = await manager.createDesktopShortcut(ws.id, {
      url: 'http://localhost:8080',
      iconPath
    });

    expect(result.success).toBe(true);
    const content = await fs.readFile(result.path, 'utf8');
    expect(content).toContain('IconFile=');
    expect(content).toContain('IconIndex=0');

    // Cleanup
    try { await fs.unlink(result.path); } catch { /* ignore */ }
  });

  test('should throw for unknown workspace', async () => {
    await expect(manager.createDesktopShortcut('nonexistent')).rejects.toThrow('WORKSPACE_NOT_FOUND');
  });

  // Platform-specific .lnk test (Windows only)
  if (process.platform === 'win32') {
    test('should create .lnk shortcut to folder on Windows', async () => {
      const ws = await manager.createWorkspace({ name: 'win-lnk' });
      // No exe, no url → should fall back to folder shortcut
      const result = await manager.createDesktopShortcut(ws.id);

      expect(result.success).toBe(true);
      expect(result.type).toBe('folder');
      expect(result.path).toContain('.lnk');

      // Cleanup
      try { await fs.unlink(result.path); } catch { /* ignore */ }
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
//  parseCodeBlocks (3 patterns)
// ═══════════════════════════════════════════════════════════════════════════

describe('WorkspaceManager — parseCodeBlocks', () => {
  test('pattern 1: filename:path prefix', () => {
    const response = '```filename:src/app.js\nconsole.log("hello");\n```';
    const blocks = manager.parseCodeBlocks(response);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].filePath).toBe('src/app.js');
    expect(blocks[0].content).toBe('console.log("hello");');
  });

  test('pattern 1: direct file path', () => {
    const response = '```src/index.ts\nimport React from "react";\n```';
    const blocks = manager.parseCodeBlocks(response);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].filePath).toBe('src/index.ts');
  });

  test('pattern 2: FILE: comment style', () => {
    const response = '```javascript\n// FILE: utils/helper.js\nfunction help() {}\n```';
    const blocks = manager.parseCodeBlocks(response);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].filePath).toBe('utils/helper.js');
  });

  test('pattern 3: numbered file blocks', () => {
    const response = '**1. index.html**\n```html\n<html></html>\n```\n**2. style.css**\n```css\nbody {}\n```';
    const blocks = manager.parseCodeBlocks(response);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].filePath).toBe('index.html');
    expect(blocks[1].filePath).toBe('style.css');
  });

  test('should parse multiple named code blocks', () => {
    const response = '```filename:a.js\nconst a = 1;\n```\n```filename:b.js\nconst b = 2;\n```';
    const blocks = manager.parseCodeBlocks(response);
    expect(blocks).toHaveLength(2);
  });

  test('should return empty array for no code blocks', () => {
    const response = 'Just some text without any code blocks.';
    const blocks = manager.parseCodeBlocks(response);
    expect(blocks).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  writeCodeBlocks
// ═══════════════════════════════════════════════════════════════════════════

describe('WorkspaceManager — writeCodeBlocks', () => {
  test('should write code blocks as real files', async () => {
    const ws = await manager.createWorkspace({ name: 'write-test' });
    const response = '```filename:src/hello.js\nconsole.log("hello world!");\n```';

    const result = await manager.writeCodeBlocks(ws.id, response);
    expect(result.written).toHaveLength(1);
    expect(result.total).toBe(1);

    // Verify file exists on disk
    const filePath = path.join(ws.path, 'src', 'hello.js');
    expect(fsSync.existsSync(filePath)).toBe(true);
    const content = await fs.readFile(filePath, 'utf8');
    expect(content).toBe('console.log("hello world!");');
  });

  test('should track written files in workspace.files', async () => {
    const ws = await manager.createWorkspace({ name: 'track-test' });
    const response = '```filename:index.html\n<html></html>\n```';
    await manager.writeCodeBlocks(ws.id, response);

    const workspace = manager.getWorkspace(ws.id);
    expect(workspace.files).toHaveLength(1);
    expect(workspace.files[0].path).toBe('index.html');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  _findIcon
// ═══════════════════════════════════════════════════════════════════════════

describe('WorkspaceManager — _findIcon', () => {
  test('should prefer files named icon, logo, or favicon', async () => {
    const ws = await manager.createWorkspace({ name: 'find-icon-test' });
    // Create multiple icon candidates
    await fs.writeFile(path.join(ws.path, 'random.png'), 'png', 'utf8');
    await fs.writeFile(path.join(ws.path, 'favicon.ico'), 'ico', 'utf8');

    const icon = await manager._findIcon(ws);
    expect(icon).toBeDefined();
    expect(path.basename(icon)).toBe('favicon.ico');
  });

  test('should fall back to any icon file', async () => {
    const ws = await manager.createWorkspace({ name: 'fallback-icon' });
    await fs.writeFile(path.join(ws.path, 'something.png'), 'png', 'utf8');

    const icon = await manager._findIcon(ws);
    expect(icon).toBeDefined();
    expect(icon).toContain('something.png');
  });

  test('should return null when no icons found', async () => {
    const ws = await manager.createWorkspace({ name: 'no-icon' });
    const icon = await manager._findIcon(ws);
    expect(icon).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  _findExecutable
// ═══════════════════════════════════════════════════════════════════════════

describe('WorkspaceManager — _findExecutable', () => {
  test('should return node.exe for Node projects with main', async () => {
    const ws = await manager.createWorkspace({ name: 'node-exe' });
    await fs.writeFile(
      path.join(ws.path, 'package.json'),
      JSON.stringify({ main: 'index.js' }),
      'utf8'
    );

    const exe = await manager._findExecutable(ws);
    expect(exe).toBe(process.execPath);
  });

  test('should return null for workspace with no executables', async () => {
    const ws = await manager.createWorkspace({ name: 'no-exe' });
    await fs.writeFile(path.join(ws.path, 'readme.md'), '# Hello', 'utf8');

    const exe = await manager._findExecutable(ws);
    expect(exe).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  Workspace CRUD basics
// ═══════════════════════════════════════════════════════════════════════════

describe('WorkspaceManager — CRUD', () => {
  test('createWorkspace should create directory and metadata', async () => {
    const ws = await manager.createWorkspace({ name: 'My Project', description: 'Test desc' });

    expect(ws.id).toMatch(/^ws-/);
    expect(ws.name).toBe('My Project');
    expect(ws.description).toBe('Test desc');
    expect(fsSync.existsSync(ws.path)).toBe(true);

    const metaPath = path.join(ws.path, '.bmad-workspace.json');
    expect(fsSync.existsSync(metaPath)).toBe(true);
  });

  test('getWorkspace should return workspace without _processes', () => {
    // createWorkspace returns workspace directly, but getWorkspace should strip _processes
    manager.workspaces.set('test-id', { id: 'test-id', name: 'Test', _processes: { p1: {} } });
    const ws = manager.getWorkspace('test-id');
    expect(ws._processes).toBeUndefined();
  });

  test('listWorkspaces should return all workspaces sorted', async () => {
    await manager.createWorkspace({ name: 'Old' });
    await new Promise(r => setTimeout(r, 10));
    await manager.createWorkspace({ name: 'New' });

    const list = manager.listWorkspaces();
    expect(list).toHaveLength(2);
    expect(list[0].name).toBe('New');
    expect(list[1].name).toBe('Old');
  });

  test('deleteWorkspace should remove directory', async () => {
    const ws = await manager.createWorkspace({ name: 'DeleteMe' });
    const wsPath = ws.path;

    const result = await manager.deleteWorkspace(ws.id);
    expect(result.success).toBe(true);
    expect(fsSync.existsSync(wsPath)).toBe(false);
    expect(manager.workspaces.has(ws.id)).toBe(false);
  });

  test('deleteWorkspace should throw for unknown id', async () => {
    await expect(manager.deleteWorkspace('nonexistent')).rejects.toThrow('WORKSPACE_NOT_FOUND');
  });
});
