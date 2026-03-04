/**
 * Tests for DocumentationManager — auto-save, artifact extraction, CRUD
 * Covers all features from commits 91d3ef7 and 918730f
 */

const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const os = require('os');
const crypto = require('crypto');

const DocumentationManager = require('../documentation-manager');

// ─── Test helpers ─────────────────────────────────────────────────────────

let testBaseDir;
let manager;

function uniqueDir() {
  return path.join(os.tmpdir(), `bmad-test-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`);
}

beforeEach(async () => {
  testBaseDir = uniqueDir();
  manager = new DocumentationManager({ baseDir: testBaseDir });
  await manager.initialize();
});

afterEach(async () => {
  try {
    await fs.rm(testBaseDir, { recursive: true, force: true });
  } catch { /* ignore */ }
});

// ═══════════════════════════════════════════════════════════════════════════
//  CONSTRUCTOR & INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════════

describe('DocumentationManager — Constructor & Init', () => {
  test('should use default baseDir when no options provided', () => {
    const mgr = new DocumentationManager();
    expect(mgr.baseDir).toBe(path.join(os.homedir(), 'Desktop', 'bmad-projects'));
  });

  test('should accept custom baseDir', () => {
    expect(manager.baseDir).toBe(testBaseDir);
  });

  test('initialize should create the base directory', async () => {
    const exists = fsSync.existsSync(testBaseDir);
    expect(exists).toBe(true);
  });

  test('initialize should scan existing projects', async () => {
    // Create a project first
    const project = await manager.createProject({ name: 'Test Scan' });

    // Create new manager pointing to same dir
    const mgr2 = new DocumentationManager({ baseDir: testBaseDir });
    await mgr2.initialize();

    expect(mgr2.projects.size).toBe(1);
    const scanned = mgr2.projects.get(project.id);
    expect(scanned).toBeDefined();
    expect(scanned.name).toBe('Test Scan');
  });

  test('initialize should handle empty base directory', async () => {
    const emptyDir = uniqueDir();
    const mgr = new DocumentationManager({ baseDir: emptyDir });
    await mgr.initialize();
    expect(mgr.projects.size).toBe(0);
    await fs.rm(emptyDir, { recursive: true, force: true });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  PROJECT CRUD
// ═══════════════════════════════════════════════════════════════════════════

describe('DocumentationManager — Project CRUD', () => {
  test('createProject should create project directories and return metadata', async () => {
    const project = await manager.createProject({ name: 'Mon Projet Test', description: 'Description test' });

    expect(project.id).toMatch(/^proj-/);
    expect(project.name).toBe('Mon Projet Test');
    expect(project.description).toBe('Description test');
    expect(project.documentCount).toBe(0);
    expect(project.createdAt).toBeDefined();
    expect(project.updatedAt).toBeDefined();
    expect(project.agents).toEqual({});

    // Verify directory structure
    const projectDir = project.path;
    expect(fsSync.existsSync(projectDir)).toBe(true);
    expect(fsSync.existsSync(path.join(projectDir, '01-analyse'))).toBe(true);
    expect(fsSync.existsSync(path.join(projectDir, '02-architecture'))).toBe(true);
    expect(fsSync.existsSync(path.join(projectDir, '03-product'))).toBe(true);
    expect(fsSync.existsSync(path.join(projectDir, '04-gestion-projet'))).toBe(true);
    expect(fsSync.existsSync(path.join(projectDir, '05-ux-design'))).toBe(true);
    expect(fsSync.existsSync(path.join(projectDir, '06-developpement'))).toBe(true);
    expect(fsSync.existsSync(path.join(projectDir, '07-qualite'))).toBe(true);
    expect(fsSync.existsSync(path.join(projectDir, '08-scrum'))).toBe(true);
    expect(fsSync.existsSync(path.join(projectDir, '09-master'))).toBe(true);
    expect(fsSync.existsSync(path.join(projectDir, '10-orchestrateur'))).toBe(true);
    expect(fsSync.existsSync(path.join(projectDir, '_historique'))).toBe(true);
  });

  test('createProject should create a README.md', async () => {
    const project = await manager.createProject({ name: 'Readme Check' });
    const readmePath = path.join(project.path, 'README.md');
    expect(fsSync.existsSync(readmePath)).toBe(true);

    const content = await fs.readFile(readmePath, 'utf8');
    expect(content).toContain('# Readme Check');
    expect(content).toContain('BMAD Agent GUI');
  });

  test('createProject should set it as active project', async () => {
    const project = await manager.createProject({ name: 'Active Test' });
    expect(manager.activeProjectId).toBe(project.id);
  });

  test('createProject should handle duplicate names with suffix', async () => {
    const p1 = await manager.createProject({ name: 'Same Name' });
    const p2 = await manager.createProject({ name: 'Same Name' });

    expect(p1.path).not.toBe(p2.path);
    expect(p2.path).toContain('same-name-1');
  });

  test('createProject should write .bmad-project.json', async () => {
    const project = await manager.createProject({ name: 'Meta Test' });
    const metaPath = path.join(project.path, '.bmad-project.json');
    expect(fsSync.existsSync(metaPath)).toBe(true);

    const meta = JSON.parse(await fs.readFile(metaPath, 'utf8'));
    expect(meta.id).toBe(project.id);
    expect(meta.name).toBe('Meta Test');
  });

  test('getProject should return project by id', async () => {
    const project = await manager.createProject({ name: 'Get Test' });
    const found = await manager.getProject(project.id);
    expect(found.name).toBe('Get Test');
    expect(found.id).toBe(project.id);
  });

  test('getProject should return null for unknown id', async () => {
    const found = await manager.getProject('nonexistent');
    expect(found).toBeNull();
  });

  test('listProjects should return all projects sorted by updatedAt', async () => {
    await manager.createProject({ name: 'Older' });
    // Small delay to ensure different timestamps
    await new Promise(r => setTimeout(r, 10));
    await manager.createProject({ name: 'Newer' });

    const list = await manager.listProjects();
    expect(list).toHaveLength(2);
    expect(list[0].name).toBe('Newer'); // most recent first
    expect(list[1].name).toBe('Older');
  });

  test('listProjects should return clean objects without internal fields', async () => {
    await manager.createProject({ name: 'Clean' });
    const list = await manager.listProjects();

    expect(list[0]).toHaveProperty('id');
    expect(list[0]).toHaveProperty('name');
    expect(list[0]).toHaveProperty('path');
    expect(list[0]).toHaveProperty('documentCount');
    expect(list[0]).not.toHaveProperty('agents');
  });

  test('deleteProject should remove project directory and metadata', async () => {
    const project = await manager.createProject({ name: 'Delete Me' });
    const projectPath = project.path;

    const result = await manager.deleteProject(project.id);
    expect(result.success).toBe(true);
    expect(fsSync.existsSync(projectPath)).toBe(false);
    expect(manager.projects.has(project.id)).toBe(false);
  });

  test('deleteProject should clear activeProjectId if deleted project was active', async () => {
    const project = await manager.createProject({ name: 'Active Delete' });
    expect(manager.activeProjectId).toBe(project.id);

    await manager.deleteProject(project.id);
    expect(manager.activeProjectId).toBeNull();
  });

  test('deleteProject should throw for unknown id', async () => {
    await expect(manager.deleteProject('nonexistent')).rejects.toThrow('PROJECT_NOT_FOUND');
  });

  test('setActiveProject should set the active project', async () => {
    const p1 = await manager.createProject({ name: 'P1' });
    const p2 = await manager.createProject({ name: 'P2' });

    // p2 is active because it was created last
    expect(manager.activeProjectId).toBe(p2.id);

    const result = manager.setActiveProject(p1.id);
    expect(manager.activeProjectId).toBe(p1.id);
    expect(result.name).toBe('P1');
  });

  test('setActiveProject with null should clear active project', () => {
    manager.setActiveProject(null);
    expect(manager.activeProjectId).toBeNull();
  });

  test('setActiveProject should throw for unknown id', () => {
    expect(() => manager.setActiveProject('nonexistent')).toThrow('PROJECT_NOT_FOUND');
  });

  test('getActiveProject should return active project or null', async () => {
    expect(manager.getActiveProject()).toBeNull();

    const project = await manager.createProject({ name: 'Active' });
    expect(manager.getActiveProject().name).toBe('Active');

    manager.setActiveProject(null);
    expect(manager.getActiveProject()).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  _normalizeAgentName
// ═══════════════════════════════════════════════════════════════════════════

describe('DocumentationManager — _normalizeAgentName', () => {
  const cases = [
    ['analyst', 'analyst'],
    ['Business Analyst', 'analyst'],
    ['Analyse des besoins', 'analyst'],
    ['architect', 'architect'],
    ['Software Architect', 'architect'],
    ['Architecte logiciel', 'architect'],
    ['po', 'po'],
    ['Product Owner', 'po'],
    ['pm', 'pm'],
    ['Project Manager', 'pm'],
    ['Chef de Projet', 'pm'],
    ['ux-expert', 'ux-expert'],
    ['UX Designer', 'ux-expert'],
    ['dev', 'dev'],
    ['Développeur', 'dev'],
    ['Senior Developer', 'dev'],
    ['qa', 'qa'],
    ['Qualité', 'qa'],
    ['Test Engineer', 'qa'],
    ['sm', 'sm'],
    ['Scrum Master', 'sm'],
    ['bmad-master', 'bmad-master'],
    ['BMAD Master', 'bmad-master'],
    ['bmad-orchestrator', 'bmad-orchestrator'],
    ['Orchestrateur', 'bmad-orchestrator'],
    [null, 'unknown'],
    ['', 'unknown'],
  ];

  test.each(cases)('_normalizeAgentName("%s") should return "%s"', (input, expected) => {
    const result = manager._normalizeAgentName(input);
    expect(result).toBe(expected);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  _parseCodeBlocks
// ═══════════════════════════════════════════════════════════════════════════

describe('DocumentationManager — _parseCodeBlocks', () => {
  test('should parse named code blocks with filename: prefix', () => {
    const content = '```filename:src/app.js\nconsole.log("hello");\n```';
    const blocks = manager._parseCodeBlocks(content);

    expect(blocks).toHaveLength(1);
    expect(blocks[0].filePath).toBe('src/app.js');
    expect(blocks[0].named).toBe(true);
    expect(blocks[0].content).toBe('console.log("hello");');
  });

  test('should parse named code blocks with direct file path', () => {
    const content = '```src/index.ts\nimport React from "react";\n```';
    const blocks = manager._parseCodeBlocks(content);

    expect(blocks).toHaveLength(1);
    expect(blocks[0].filePath).toBe('src/index.ts');
    expect(blocks[0].named).toBe(true);
  });

  test('should parse FILE: comment style', () => {
    const content = '```javascript\n// FILE: utils/helper.js\nfunction help() {}\n```';
    const blocks = manager._parseCodeBlocks(content);

    expect(blocks).toHaveLength(1);
    expect(blocks[0].filePath).toBe('utils/helper.js');
    expect(blocks[0].named).toBe(true);
    expect(blocks[0].content).not.toContain('FILE:');
  });

  test('should parse unnamed code blocks with language', () => {
    const content = '```python\nprint("hello")\n```';
    const blocks = manager._parseCodeBlocks(content);

    expect(blocks).toHaveLength(1);
    expect(blocks[0].filePath).toBeNull();
    expect(blocks[0].named).toBe(false);
    expect(blocks[0].language).toBe('python');
    expect(blocks[0].ext).toBe('py');
  });

  test('should parse unnamed code blocks without language', () => {
    const content = '```\nsome code\n```';
    const blocks = manager._parseCodeBlocks(content);

    expect(blocks).toHaveLength(1);
    expect(blocks[0].named).toBe(false);
    expect(blocks[0].ext).toBeNull();
  });

  test('should skip mermaid, json, and svg blocks', () => {
    const content = '```mermaid\ngraph TD\nA-->B\n```\n```json\n{"key": "val"}\n```\n```svg\n<svg></svg>\n```\n```javascript\nconsole.log("keep");\n```';
    const blocks = manager._parseCodeBlocks(content);

    expect(blocks).toHaveLength(1);
    expect(blocks[0].language).toBe('javascript');
  });

  test('should parse multiple code blocks', () => {
    const content = '```filename:a.js\nconst a = 1;\n```\nSome text\n```python\nprint(2)\n```\n```filename:c.css\n.x {}\n```';
    const blocks = manager._parseCodeBlocks(content);

    expect(blocks).toHaveLength(3);
    expect(blocks[0].filePath).toBe('a.js');
    expect(blocks[1].language).toBe('python');
    expect(blocks[2].filePath).toBe('c.css');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  _buildCleanDocument
// ═══════════════════════════════════════════════════════════════════════════

describe('DocumentationManager — _buildCleanDocument', () => {
  test('should return null for very short content', () => {
    const result = manager._buildCleanDocument('OK, done.', 'doc', 'test');
    expect(result).toBeNull();
  });

  test('should return null for chat-like replies without structure', () => {
    const chatReply = 'Bien sûr, je peux vous aider avec ça. Voici ce que je recommande pour votre projet. N\'hésitez pas à me poser d\'autres questions si besoin, je suis à votre disposition.';
    const result = manager._buildCleanDocument(chatReply, 'doc', 'test');
    expect(result).toBeNull();
  });

  test('should return content that contains headings', () => {
    const doc = '# Architecture du Projet\n\n## Backend\n\nNode.js avec Express pour le serveur API. Utilisation de MongoDB pour la base de données.';
    const result = manager._buildCleanDocument(doc, 'architecture', 'Architecture');
    expect(result).toBe(doc);
  });

  test('should return content that contains lists', () => {
    const doc = 'Voici les fonctionnalités identifiées pour le projet :\n\n- Authentification utilisateur\n- Tableau de bord\n- Gestion des projets\n- Notifications en temps réel\n- Export PDF';
    const result = manager._buildCleanDocument(doc, 'analyse', 'Analyse');
    expect(result).toBe(doc);
  });

  test('should return content that contains tables', () => {
    const doc = 'Backlog du projet :\n\n| ID | User Story | Priorité |\n|----|-----------|----------|\n| US-1.1 | Login | Must-Have |';
    const result = manager._buildCleanDocument(doc, 'backlog', 'Backlog');
    expect(result).toBe(doc);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  LANG_EXTENSIONS
// ═══════════════════════════════════════════════════════════════════════════

describe('DocumentationManager — LANG_EXTENSIONS', () => {
  test('should map common languages correctly', () => {
    expect(DocumentationManager.LANG_EXTENSIONS['javascript']).toBe('js');
    expect(DocumentationManager.LANG_EXTENSIONS['python']).toBe('py');
    expect(DocumentationManager.LANG_EXTENSIONS['typescript']).toBe('ts');
    expect(DocumentationManager.LANG_EXTENSIONS['ruby']).toBe('rb');
    expect(DocumentationManager.LANG_EXTENSIONS['rust']).toBe('rs');
    expect(DocumentationManager.LANG_EXTENSIONS['csharp']).toBe('cs');
    expect(DocumentationManager.LANG_EXTENSIONS['shell']).toBe('sh');
    expect(DocumentationManager.LANG_EXTENSIONS['dart']).toBe('dart');
    expect(DocumentationManager.LANG_EXTENSIONS['dockerfile']).toBe('Dockerfile');
  });

  test('should have aliases (js === javascript, py === python)', () => {
    expect(DocumentationManager.LANG_EXTENSIONS['js']).toBe('js');
    expect(DocumentationManager.LANG_EXTENSIONS['py']).toBe('py');
    expect(DocumentationManager.LANG_EXTENSIONS['ts']).toBe('ts');
    expect(DocumentationManager.LANG_EXTENSIONS['rb']).toBe('rb');
    expect(DocumentationManager.LANG_EXTENSIONS['rs']).toBe('rs');
    expect(DocumentationManager.LANG_EXTENSIONS['cs']).toBe('cs');
    expect(DocumentationManager.LANG_EXTENSIONS['sh']).toBe('sh');
  });

  test('should have at least 50 language mappings', () => {
    const keys = Object.keys(DocumentationManager.LANG_EXTENSIONS);
    expect(keys.length).toBeGreaterThanOrEqual(50);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  saveAgentResponse — Full artifact extraction
// ═══════════════════════════════════════════════════════════════════════════

describe('DocumentationManager — saveAgentResponse', () => {
  let project;

  beforeEach(async () => {
    project = await manager.createProject({ name: 'SaveTest' });
  });

  test('should return null when no active project', async () => {
    manager.setActiveProject(null);
    const result = await manager.saveAgentResponse('analyst', 'Business Analyst', 'Q?', 'Response');
    expect(result).toBeNull();
  });

  test('should return null for unknown project id', async () => {
    const result = await manager.saveAgentResponse('analyst', 'Business Analyst', 'Q?', 'Response', {
      projectId: 'nonexistent'
    });
    expect(result).toBeNull();
  });

  test('should create reference log in _historique/', async () => {
    const response = '# Analyse du besoin\n\n## Résumé\n\nApplication web de gestion de tâches avec authentification.';
    const result = await manager.saveAgentResponse('analyst', 'Business Analyst', 'Analyse mon besoin', response);

    expect(result).toBeDefined();
    expect(result.filePath).toContain('_historique');
    expect(result.agentKey).toBe('analyst');
    expect(result.docType).toBe('analyse');
    expect(fsSync.existsSync(result.filePath)).toBe(true);

    // Check front-matter
    const content = await fs.readFile(result.filePath, 'utf8');
    expect(content).toContain('---');
    expect(content).toContain('agent: Business Analyst');
    expect(content).toContain('agent_key: analyst');
    expect(content).toContain('type: analyse');
  });

  test('should create clean document artifact in agent folder', async () => {
    const response = '# Architecture du Projet\n\n## Stack technique\n\nReact + Node.js + MongoDB pour une application fullstack moderne.';
    const result = await manager.saveAgentResponse('architect', 'Software Architect', 'Architecture?', response);

    expect(result.artifacts).toBeDefined();
    const docArtifact = result.artifacts.find(a => a.type === 'document');
    expect(docArtifact).toBeDefined();
    expect(docArtifact.path).toContain('02-architecture');
    expect(fsSync.existsSync(docArtifact.path)).toBe(true);
  });

  test('should extract named code blocks as individual files', async () => {
    const response = '# Code\n\n```filename:src/app.js\nconsole.log("app");\n```\n\n```filename:src/index.html\n<!DOCTYPE html><html></html>\n```';
    const result = await manager.saveAgentResponse('dev', 'Senior Developer', 'Code', response);

    const codeArtifacts = result.artifacts.filter(a => a.type === 'code');
    expect(codeArtifacts).toHaveLength(2);

    // Named files should be in a code sub-directory
    const namedArtifact = codeArtifacts.find(a => a.named);
    expect(namedArtifact).toBeDefined();
    expect(namedArtifact.name).toBe('app.js');
    expect(fsSync.existsSync(namedArtifact.path)).toBe(true);
  });

  test('should extract unnamed code blocks with generated names', async () => {
    const response = '# Exemple\n\nVoici du code Python et JavaScript :\n\n```python\nprint("hello")\n```\n\n```javascript\nconsole.log("world");\n```';
    const result = await manager.saveAgentResponse('dev', 'Developer', 'Code?', response);

    const codeArtifacts = result.artifacts.filter(a => a.type === 'code');
    expect(codeArtifacts).toHaveLength(2);
    expect(codeArtifacts[0].named).toBe(false);
    expect(codeArtifacts[0].name).toContain('code-1.py');
    expect(codeArtifacts[1].name).toContain('code-2.js');
  });

  test('should extract SVG blocks', async () => {
    const response = '# Mockup\n\nVoici le wireframe du projet :\n\n<svg viewBox="0 0 100 100"><rect width="100" height="100" fill="blue"/></svg>';
    const result = await manager.saveAgentResponse('ux-expert', 'UX Expert', 'Mockup', response);

    const svgArtifacts = result.artifacts.filter(a => a.type === 'svg');
    expect(svgArtifacts).toHaveLength(1);
    expect(svgArtifacts[0].name).toContain('.svg');
    expect(fsSync.existsSync(svgArtifacts[0].path)).toBe(true);

    const svgContent = await fs.readFile(svgArtifacts[0].path, 'utf8');
    expect(svgContent).toContain('<svg');
    expect(svgContent).toContain('</svg>');
  });

  test('should extract Mermaid blocks as .mmd files', async () => {
    const response = '# Diagramme\n\nArchitecture du système :\n\n```mermaid\ngraph TD\nA[Client] --> B[API Gateway]\nB --> C[Service]\n```';
    const result = await manager.saveAgentResponse('architect', 'Architect', 'Diagramme', response);

    const mermaidArtifacts = result.artifacts.filter(a => a.type === 'mermaid');
    expect(mermaidArtifacts).toHaveLength(1);
    expect(mermaidArtifacts[0].name).toContain('.mmd');
    expect(fsSync.existsSync(mermaidArtifacts[0].path)).toBe(true);

    const mmdContent = await fs.readFile(mermaidArtifacts[0].path, 'utf8');
    expect(mmdContent).toContain('graph TD');
  });

  test('should extract valid JSON blocks as .json files', async () => {
    const response = '# Config\n\nConfiguration du projet :\n\n```json\n{"name": "test", "version": "1.0.0"}\n```';
    const result = await manager.saveAgentResponse('architect', 'Architect', 'Config', response);

    const jsonArtifacts = result.artifacts.filter(a => a.type === 'json');
    expect(jsonArtifacts).toHaveLength(1);
    expect(jsonArtifacts[0].name).toContain('.json');

    const jsonContent = await fs.readFile(jsonArtifacts[0].path, 'utf8');
    expect(JSON.parse(jsonContent)).toEqual({ name: 'test', version: '1.0.0' });
  });

  test('should skip invalid JSON blocks', async () => {
    const response = '# Bad JSON\n\nVoici un objet invalide :\n\n```json\n{invalid: json,}\n```';
    const result = await manager.saveAgentResponse('dev', 'Developer', 'Bad JSON', response);

    const jsonArtifacts = result.artifacts.filter(a => a.type === 'json');
    expect(jsonArtifacts).toHaveLength(0);
  });

  test('should extract YAML blocks as .yaml files', async () => {
    const response = '# Manifest\n\nFichier de configuration Kubernetes :\n\n```yaml\napiVersion: v1\nkind: Service\nmetadata:\n  name: my-service\n```';
    const result = await manager.saveAgentResponse('architect', 'Architect', 'Manifest', response);

    const yamlArtifacts = result.artifacts.filter(a => a.type === 'yaml');
    expect(yamlArtifacts).toHaveLength(1);
    expect(yamlArtifacts[0].name).toContain('.yaml');
  });

  test('should also match yml language tag for YAML', async () => {
    const response = '# Config\n\nConfiguration Docker compose :\n\n```yml\nversion: "3"\nservices:\n  web:\n    image: nginx\n```';
    const result = await manager.saveAgentResponse('dev', 'Developer', 'Docker', response);

    const yamlArtifacts = result.artifacts.filter(a => a.type === 'yaml');
    expect(yamlArtifacts).toHaveLength(1);
  });

  test('should extract HTML blocks (full document or >200 chars)', async () => {
    const response = '# Page\n\nPrototype de la page :\n\n```html\n<!DOCTYPE html>\n<html><head><title>Test</title></head><body><h1>Hello</h1><p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation.</p></body></html>\n```';
    const result = await manager.saveAgentResponse('ux-expert', 'UX Expert', 'Page', response);

    const htmlArtifacts = result.artifacts.filter(a => a.type === 'html');
    expect(htmlArtifacts).toHaveLength(1);
    expect(htmlArtifacts[0].name).toContain('.html');
  });

  test('should NOT extract small HTML fragments', async () => {
    const response = '# Snippet\n\nExemple de bouton :\n\n```html\n<button>Click</button>\n```';
    const result = await manager.saveAgentResponse('dev', 'Developer', 'Snippet', response);

    const htmlArtifacts = result.artifacts.filter(a => a.type === 'html');
    expect(htmlArtifacts).toHaveLength(0);
  });

  test('should update project stats after saving', async () => {
    const response = '# Analysis\n\n## Requirements\n\n- Feature A\n- Feature B\n- Feature C\n- Feature D';
    await manager.saveAgentResponse('analyst', 'Business Analyst', 'Analyse', response);

    const updatedProject = await manager.getProject(project.id);
    expect(updatedProject.documentCount).toBeGreaterThan(0);
    expect(updatedProject.agents['analyst']).toBeDefined();
    expect(updatedProject.agents['analyst'].docCount).toBeGreaterThan(0);
    expect(updatedProject.agents['analyst'].lastActivity).toBeGreaterThan(0);
  });

  test('should return correct result structure', async () => {
    const response = '# Test\n\n## Section\n\nContent with a list:\n- Item 1\n- Item 2';
    const result = await manager.saveAgentResponse('analyst', 'Analyst', 'Question', response);

    expect(result).toHaveProperty('filePath');
    expect(result).toHaveProperty('relativePath');
    expect(result).toHaveProperty('fileName');
    expect(result).toHaveProperty('docType');
    expect(result).toHaveProperty('title');
    expect(result).toHaveProperty('agentKey');
    expect(result).toHaveProperty('folder');
    expect(result).toHaveProperty('artifacts');
    expect(result).toHaveProperty('artifactCount');
    expect(typeof result.artifactCount).toBe('number');
  });

  test('should produce multiple artifact types from complex response', async () => {
    const response = `# Architecture complète

## Vue d'ensemble

Application fullstack avec composants séparés.

## Diagramme

\`\`\`mermaid
graph TD
A[Frontend] --> B[Backend]
B --> C[Database]
\`\`\`

## Configuration

\`\`\`json
{"name": "myapp", "version": "1.0"}
\`\`\`

## Code serveur

\`\`\`filename:server.js
const express = require('express');
const app = express();
app.listen(3000);
\`\`\`

## Wireframe

<svg viewBox="0 0 200 100"><rect x="10" y="10" width="180" height="80" fill="gray"/></svg>
`;
    const result = await manager.saveAgentResponse('architect', 'Architect', 'Architecture', response);

    expect(result.artifacts.find(a => a.type === 'document')).toBeDefined();
    expect(result.artifacts.find(a => a.type === 'mermaid')).toBeDefined();
    expect(result.artifacts.find(a => a.type === 'json')).toBeDefined();
    expect(result.artifacts.find(a => a.type === 'code')).toBeDefined();
    expect(result.artifacts.find(a => a.type === 'svg')).toBeDefined();
    expect(result.artifactCount).toBeGreaterThanOrEqual(5);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  saveConversationHistory
// ═══════════════════════════════════════════════════════════════════════════

describe('DocumentationManager — saveConversationHistory', () => {
  test('should save conversation as a markdown file in _historique/', async () => {
    const project = await manager.createProject({ name: 'ConvTest' });
    const messages = [
      { role: 'user', content: 'Hello!', timestamp: Date.now() },
      { role: 'assistant', content: 'Bonjour, comment puis-je vous aider ?', timestamp: Date.now() },
    ];

    const result = await manager.saveConversationHistory('analyst', 'Business Analyst', messages);

    expect(result).toBeDefined();
    expect(result.filePath).toContain('_historique');
    expect(result.fileName).toContain('conversation-analyst');
    expect(fsSync.existsSync(result.filePath)).toBe(true);

    const content = await fs.readFile(result.filePath, 'utf8');
    expect(content).toContain('Conversation avec Business Analyst');
    expect(content).toContain('Utilisateur');
    expect(content).toContain('Business Analyst');
    expect(content).toContain('Hello!');
    expect(content).toContain('Bonjour');
  });

  test('should return null when no active project', async () => {
    manager.setActiveProject(null);
    const result = await manager.saveConversationHistory('dev', 'Dev', []);
    expect(result).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  getProjectTree
// ═══════════════════════════════════════════════════════════════════════════

describe('DocumentationManager — getProjectTree', () => {
  test('should return tree with all agent folders + history', async () => {
    const project = await manager.createProject({ name: 'TreeTest' });
    const tree = await manager.getProjectTree(project.id);

    // 10 agent folders + 1 history
    expect(tree).toHaveLength(11);

    const agentKeys = tree.map(t => t.agent);
    expect(agentKeys).toContain('analyst');
    expect(agentKeys).toContain('architect');
    expect(agentKeys).toContain('po');
    expect(agentKeys).toContain('pm');
    expect(agentKeys).toContain('ux-expert');
    expect(agentKeys).toContain('dev');
    expect(agentKeys).toContain('qa');
    expect(agentKeys).toContain('sm');
    expect(agentKeys).toContain('bmad-master');
    expect(agentKeys).toContain('bmad-orchestrator');
    expect(agentKeys).toContain('_history');
  });

  test('should include documents after saving', async () => {
    const project = await manager.createProject({ name: 'TreeDocs' });
    const response = '# Analyse complète du besoin\n\n## Résumé exécutif\n\nApplication web de gestion de tâches avec de nombreuses fonctionnalités avancées et un système de notification.\n\n## Fonctionnalités\n\n- Authentification utilisateur\n- Tableau de bord\n- Gestion des projets\n- Notifications en temps réel\n- Export PDF des rapports';
    await manager.saveAgentResponse('analyst', 'Analyst', 'Analyse mon besoin', response);

    const tree = await manager.getProjectTree(project.id);
    const analystNode = tree.find(t => t.agent === 'analyst');
    expect(analystNode.count).toBeGreaterThan(0);
    expect(analystNode.documents.length).toBeGreaterThan(0);
  });

  test('should return empty arrays for folders with no documents', async () => {
    const project = await manager.createProject({ name: 'EmptyTree' });
    const tree = await manager.getProjectTree(project.id);

    for (const node of tree) {
      expect(Array.isArray(node.documents)).toBe(true);
      expect(typeof node.count).toBe('number');
    }
  });

  test('should return empty array for unknown project', async () => {
    const tree = await manager.getProjectTree('nonexistent');
    expect(tree).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  readDocument
// ═══════════════════════════════════════════════════════════════════════════

describe('DocumentationManager — readDocument', () => {
  test('should read a document from a project', async () => {
    const project = await manager.createProject({ name: 'ReadTest' });
    // The README should exist
    const result = await manager.readDocument(project.id, 'README.md');

    expect(result).toBeDefined();
    expect(result.content).toContain('# ReadTest');
    expect(result.size).toBeGreaterThan(0);
    expect(result.path).toBe('README.md');
    expect(result.modifiedAt).toBeGreaterThan(0);
  });

  test('should throw for unknown project', async () => {
    await expect(manager.readDocument('nonexistent', 'README.md')).rejects.toThrow('PROJECT_NOT_FOUND');
  });

  test('should throw for path traversal attempt', async () => {
    const project = await manager.createProject({ name: 'SecurityTest' });
    await expect(manager.readDocument(project.id, '../../etc/passwd')).rejects.toThrow('INVALID_PATH');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  detectDocType helper (tested via saveAgentResponse)
// ═══════════════════════════════════════════════════════════════════════════

describe('DocumentationManager — detectDocType (via saveAgentResponse)', () => {
  let project;

  beforeEach(async () => {
    project = await manager.createProject({ name: 'DocTypeTest' });
  });

  test('analyst + PRD content → "prd"', async () => {
    const result = await manager.saveAgentResponse('analyst', 'Analyst', 'Q', '# PRD - Product Requirements Document\n\n## Section\n\n- Detail');
    expect(result.docType).toBe('prd');
  });

  test('architect + diagramme content → "diagramme"', async () => {
    const result = await manager.saveAgentResponse('architect', 'Architect', 'Q', '# Diagramme d\'architecture\n\n## Mermaid\n\n- Composants');
    expect(result.docType).toBe('diagramme');
  });

  test('po + user story content → "user-story"', async () => {
    const result = await manager.saveAgentResponse('po', 'PO', 'Q', '# User Story\n\nEn tant qu\'utilisateur, je veux pouvoir me connecter');
    expect(result.docType).toBe('user-story');
  });

  test('pm + planning content → "planning"', async () => {
    const result = await manager.saveAgentResponse('pm', 'PM', 'Q', '# Planning du projet\n\n## Roadmap\n\n- Sprint 1\n- Sprint 2');
    expect(result.docType).toBe('planning');
  });

  test('ux-expert + wireframe content → "wireframe"', async () => {
    const result = await manager.saveAgentResponse('ux-expert', 'UX', 'Q', '# Wireframe de la page\n\n## Maquette\n\n- Header\n- Content');
    expect(result.docType).toBe('wireframe');
  });

  test('qa + test plan content → "plan-test"', async () => {
    const result = await manager.saveAgentResponse('qa', 'QA', 'Q', '# Test Plan\n\n## Cas de test\n\n- TC1\n- TC2');
    expect(result.docType).toBe('plan-test');
  });
});
// ═══════════════════════════════════════════════════════════════════════════
//  writeDocument / exportProjectZip — new features
// ═══════════════════════════════════════════════════════════════════════════

describe('DocumentationManager — writeDocument', () => {
  test('should write a new file into the project', async () => {
    const project = await manager.createProject({ name: 'Write Test' });
    manager.setActiveProject(project.id);

    const result = await manager.writeDocument(project.id, '06-developpement/my-spec.md', '# My Spec\n\nHello world');
    expect(result.success).toBe(true);
    expect(result.path).toBe('06-developpement/my-spec.md');

    const fullPath = path.join(project.path, '06-developpement', 'my-spec.md');
    const content = await fs.readFile(fullPath, 'utf8');
    expect(content).toBe('# My Spec\n\nHello world');
  });

  test('should overwrite an existing file', async () => {
    const project = await manager.createProject({ name: 'Overwrite Test' });
    manager.setActiveProject(project.id);

    await manager.writeDocument(project.id, 'note.md', 'original');
    await manager.writeDocument(project.id, 'note.md', 'updated');

    const fullPath = path.join(project.path, 'note.md');
    const content = await fs.readFile(fullPath, 'utf8');
    expect(content).toBe('updated');
  });

  test('should reject path traversal', async () => {
    const project = await manager.createProject({ name: 'Security Test' });
    manager.setActiveProject(project.id);

    await expect(
      manager.writeDocument(project.id, '../../evil.txt', 'pwned')
    ).rejects.toThrow(/INVALID_PATH/);
  });

  test('should throw for unknown project', async () => {
    await expect(
      manager.writeDocument('nonexistent', 'file.md', 'content')
    ).rejects.toThrow(/PROJECT_NOT_FOUND/);
  });
});
