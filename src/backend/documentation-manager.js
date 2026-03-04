/**
 * Documentation Manager - Auto-saves agent outputs as organized documentation
 * Creates a structured folder hierarchy per project on the user's Desktop,
 * with one sub-folder per BMAD agent role.
 *
 * Output format: Markdown (.md) with YAML front-matter metadata.
 */

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

// ─── Agent → folder mapping (BMAD method order) ──────────────────────────

const AGENT_FOLDERS = {
  'analyst':            { dir: '01-analyse',        label: 'Analyse' },
  'architect':          { dir: '02-architecture',    label: 'Architecture' },
  'po':                 { dir: '03-product',         label: 'Product Owner' },
  'pm':                 { dir: '04-gestion-projet',  label: 'Gestion de projet' },
  'ux-expert':          { dir: '05-ux-design',       label: 'UX Design' },
  'dev':                { dir: '06-developpement',   label: 'Développement' },
  'qa':                 { dir: '07-qualite',         label: 'Qualité / Tests' },
  'sm':                 { dir: '08-scrum',           label: 'Scrum Master' },
  'bmad-master':        { dir: '09-master',          label: 'BMAD Master' },
  'bmad-orchestrator':  { dir: '10-orchestrateur',   label: 'Orchestrateur' },
};
const HISTORY_DIR = '_historique';

// ─── Helpers ──────────────────────────────────────────────────────────────

function sanitize(name) {
  return name.replace(/[<>:"/\\|?*\x00-\x1F]/g, '-').replace(/\s+/g, '-').toLowerCase().slice(0, 80);
}

function timestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

/**
 * Detect the best document title from the content.
 * Looks for a first-level markdown heading, or first line, or a summary.
 */
function extractTitle(content, fallback) {
  const headingMatch = content.match(/^#\s+(.+)$/m);
  if (headingMatch) return headingMatch[1].trim();
  const firstLine = content.split('\n').find(l => l.trim().length > 0);
  if (firstLine && firstLine.length < 120) return firstLine.replace(/^[#*_>\- ]+/, '').trim();
  return fallback || 'sans-titre';
}

/**
 * Detect document type from agent and content.
 */
function detectDocType(agentName, content) {
  const lower = content.toLowerCase();
  const agentTypes = {
    'analyst':   () => {
      if (lower.includes('prd') || lower.includes('product requirement')) return 'prd';
      if (lower.includes('analyse des besoins') || lower.includes('requirements')) return 'analyse-besoins';
      if (lower.includes('brief') || lower.includes('cahier des charges')) return 'cahier-charges';
      return 'analyse';
    },
    'architect': () => {
      if (lower.includes('diagramme') || lower.includes('diagram') || lower.includes('mermaid')) return 'diagramme';
      if (lower.includes('architecture') || lower.includes('technical design')) return 'architecture';
      if (lower.includes('api') || lower.includes('endpoint')) return 'api-spec';
      if (lower.includes('data model') || lower.includes('modèle de données') || lower.includes('schema')) return 'data-model';
      return 'architecture';
    },
    'po':        () => {
      if (lower.includes('user story') || lower.includes('story')) return 'user-story';
      if (lower.includes('backlog') || lower.includes('épic') || lower.includes('epic')) return 'backlog';
      if (lower.includes('acceptance criteria') || lower.includes("critère d'acceptation")) return 'criteres-acceptation';
      return 'product';
    },
    'pm':        () => {
      if (lower.includes('planning') || lower.includes('roadmap') || lower.includes('gantt')) return 'planning';
      if (lower.includes('risque') || lower.includes('risk')) return 'risques';
      if (lower.includes('sprint') || lower.includes('milestone')) return 'sprint';
      return 'gestion';
    },
    'ux-expert': () => {
      if (lower.includes('<svg') || lower.includes('</svg>')) return 'svg-mockup';
      if (lower.includes('wireframe') || lower.includes('maquette')) return 'wireframe';
      if (lower.includes('persona')) return 'persona';
      if (lower.includes('user flow') || lower.includes('parcours')) return 'user-flow';
      return 'ux';
    },
    'dev':       () => {
      if (lower.includes('```') && (lower.includes('function') || lower.includes('class') || lower.includes('import'))) return 'code';
      if (lower.includes('implémentation') || lower.includes('implementation')) return 'implementation';
      if (lower.includes('debug') || lower.includes('fix')) return 'debug';
      return 'dev';
    },
    'qa':        () => {
      if (lower.includes('test plan') || lower.includes('plan de test')) return 'plan-test';
      if (lower.includes('test case') || lower.includes('cas de test')) return 'cas-test';
      if (lower.includes('bug') || lower.includes('defect') || lower.includes('anomalie')) return 'rapport-bugs';
      return 'qa';
    },
    'sm':        () => {
      if (lower.includes('retrospective') || lower.includes('rétro')) return 'retrospective';
      if (lower.includes('daily') || lower.includes('standup')) return 'daily';
      if (lower.includes('sprint review') || lower.includes('démonstration')) return 'sprint-review';
      return 'scrum';
    },
  };

  const detector = agentTypes[agentName];
  return detector ? detector() : 'document';
}


class DocumentationManager {
  constructor(options = {}) {
    this.baseDir = options.baseDir || path.join(os.homedir(), 'Desktop', 'bmad-projects');
    this.projects = new Map(); // id -> project metadata
    this.activeProjectId = null;
  }

  async initialize() {
    await fs.mkdir(this.baseDir, { recursive: true });
    // Scan existing projects (those with .bmad-project.json)
    try {
      const dirs = await fs.readdir(this.baseDir, { withFileTypes: true });
      for (const d of dirs.filter(d => d.isDirectory())) {
        const metaPath = path.join(this.baseDir, d.name, '.bmad-project.json');
        try {
          const meta = JSON.parse(await fs.readFile(metaPath, 'utf8'));
          this.projects.set(meta.id, meta);
        } catch { /* not a bmad project */ }
      }
    } catch { /* base dir doesn't exist yet */ }
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  PROJECT CRUD
  // ═══════════════════════════════════════════════════════════════════════

  async createProject(options = {}) {
    const id = `proj-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const name = options.name || 'Nouveau projet';
    const safeName = sanitize(name);

    let projectDir = path.join(this.baseDir, safeName);
    let suffix = 1;
    while (fsSync.existsSync(projectDir)) {
      projectDir = path.join(this.baseDir, `${safeName}-${suffix++}`);
    }

    // Create root + all agent sub-folders
    await fs.mkdir(projectDir, { recursive: true });
    for (const { dir } of Object.values(AGENT_FOLDERS)) {
      await fs.mkdir(path.join(projectDir, dir), { recursive: true });
    }
    await fs.mkdir(path.join(projectDir, HISTORY_DIR), { recursive: true });

    const project = {
      id,
      name,
      path: projectDir,
      description: options.description || '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      documentCount: 0,
      agents: {} // agentName -> { docCount, lastActivity }
    };

    // Write a README.md at root
    const readmeContent = `# ${name}

> Projet BMAD créé le ${new Date().toLocaleDateString('fr-FR')}

${options.description || ''}

## Structure

| Dossier | Agent | Contenu |
|---------|-------|---------|
${Object.entries(AGENT_FOLDERS).map(([agent, { dir, label }]) => `| \`${dir}/\` | ${label} | Documents produits par l'agent ${agent} |`).join('\n')}
| \`${HISTORY_DIR}/\` | — | Historique complet des conversations |

---
*Généré automatiquement par BMAD Agent GUI*
`;
    await fs.writeFile(path.join(projectDir, 'README.md'), readmeContent, 'utf8');

    await this._saveMeta(project);
    this.projects.set(id, project);
    this.activeProjectId = id;

    return project;
  }

  async getProject(id) {
    return this.projects.get(id) || null;
  }

  async listProjects() {
    return [...this.projects.values()]
      .map(p => ({
        id: p.id,
        name: p.name,
        path: p.path,
        description: p.description,
        documentCount: p.documentCount,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async deleteProject(id) {
    const project = this.projects.get(id);
    if (!project) throw new Error('PROJECT_NOT_FOUND');
    await fs.rm(project.path, { recursive: true, force: true });
    this.projects.delete(id);
    if (this.activeProjectId === id) this.activeProjectId = null;
    return { success: true };
  }

  setActiveProject(id) {
    if (!id) {
      this.activeProjectId = null;
      return null;
    }
    if (!this.projects.has(id)) throw new Error('PROJECT_NOT_FOUND');
    this.activeProjectId = id;
    return this.projects.get(id);
  }

  getActiveProject() {
    if (!this.activeProjectId) return null;
    return this.projects.get(this.activeProjectId) || null;
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  DOCUMENT SAVING — Core feature
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Language tag → file extension mapping for code block extraction.
   */
  static LANG_EXTENSIONS = {
    javascript: 'js', js: 'js', jsx: 'jsx', typescript: 'ts', ts: 'ts', tsx: 'tsx',
    python: 'py', py: 'py', ruby: 'rb', rb: 'rb', go: 'go', rust: 'rs', rs: 'rs',
    java: 'java', kotlin: 'kt', swift: 'swift', csharp: 'cs', cs: 'cs', cpp: 'cpp',
    c: 'c', php: 'php', html: 'html', css: 'css', scss: 'scss', less: 'less',
    sql: 'sql', shell: 'sh', bash: 'sh', sh: 'sh', powershell: 'ps1', ps1: 'ps1',
    yaml: 'yaml', yml: 'yaml', toml: 'toml', xml: 'xml', dockerfile: 'Dockerfile',
    docker: 'Dockerfile', makefile: 'Makefile', cmake: 'cmake', lua: 'lua',
    dart: 'dart', r: 'r', scala: 'scala', perl: 'pl', elixir: 'ex', haskell: 'hs',
    vue: 'vue', svelte: 'svelte', graphql: 'graphql', proto: 'proto', tf: 'tf',
    terraform: 'tf', nginx: 'conf', conf: 'conf', ini: 'ini', env: 'env',
    bat: 'bat', cmd: 'cmd',
  };

  /**
   * Parse ALL code blocks from a response.
   * Returns: [{ filePath, language, ext, content, named }]
   *
   * Supports:
   *   ```filename:path/file.ext          → named block with path
   *   ```path/file.ext                   → named block with path
   *   ```lang\n// FILE: path/file.ext    → named block (comment-style)
   *   ```lang\n...                        → unnamed block, language known
   *   ```\n...                            → unnamed block, language unknown
   */
  _parseCodeBlocks(responseContent) {
    const blocks = [];
    // We do a single pass through the content looking for fenced code blocks
    const fenceRegex = /```([^\n]*)\n([\s\S]*?)```/g;
    let match;
    while ((match = fenceRegex.exec(responseContent)) !== null) {
      const info = match[1].trim();
      let content = match[2];
      let filePath = null;
      let language = null;

      // Case 1: ```filename:path/to/file.ext  or  ```path/to/file.ext
      const fileInfoMatch = info.match(/^(?:filename:)?([^\s]+\.[a-zA-Z0-9]+)$/);
      if (fileInfoMatch) {
        filePath = fileInfoMatch[1];
        const ext = path.extname(filePath).slice(1).toLowerCase();
        language = ext;
      } else {
        // Case 2: info string is a language tag (e.g. "javascript", "python")
        language = info.split(/\s/)[0].toLowerCase() || null;
      }

      // Case 3: First line has // FILE: path or # FILE: path
      if (!filePath && content) {
        const commentFileMatch = content.match(/^\s*(?:\/\/|#|<!--|\/\*)\s*FILE:\s*([^\n*>]+?)(?:-->|\*\/)?\s*\n/);
        if (commentFileMatch) {
          filePath = commentFileMatch[1].trim();
          content = content.replace(commentFileMatch[0], ''); // strip the FILE: line
        }
      }

      // Skip mermaid/json/svg blocks (handled separately)
      if (['mermaid', 'json', 'svg'].includes(language)) continue;

      const ext = filePath
        ? path.extname(filePath).slice(1).toLowerCase()
        : (DocumentationManager.LANG_EXTENSIONS[language] || null);

      blocks.push({
        filePath: filePath || null,
        language,
        ext,
        content: content.trimEnd(),
        named: !!filePath,
      });
    }
    return blocks;
  }

  /**
   * Build clean artifact content from the response.
   *
   * For document agents (analyst, architect, po, pm, ux-expert, qa, sm):
   *   → strip the markdown fences and return the body as a clean .md
   *
   * Returns null if response is too short or looks like a simple chat reply.
   */
  _buildCleanDocument(responseContent, docType, title) {
    // Don't produce a doc artifact for very short responses (under ~150 chars of real text)
    const textOnly = responseContent.replace(/```[\s\S]*?```/g, '').trim();
    if (textOnly.length < 100) return null;

    // If there is no heading AND no list AND no table → likely a chat reply, not a document
    if (!/^#{1,3}\s/m.test(responseContent) &&
        !/^[-*]\s/m.test(responseContent) &&
        !/^\|/m.test(responseContent)) {
      return null;
    }

    return responseContent;
  }

  /**
   * Save an agent response as documentation — with full artifact extraction.
   * Called automatically after each agent response completes.
   *
   * Produces:
   *   1. A reference log (.md with front-matter) in _historique/
   *   2. A clean editable document artifact in the agent folder (if doc-type)
   *   3. Individual source files for every code block (in a sub-directory)
   *   4. Extracted SVG, Mermaid (.mmd), JSON files
   *
   * @param {string} agentName - Agent key (e.g. 'architect', 'dev')
   * @param {string} agentTitle - Display name
   * @param {string} userQuestion - The user's question/request
   * @param {string} responseContent - The agent's full response
   * @param {Object} options - { sessionId, usage, projectId }
   * @returns {{ filePath, docType, title, artifacts[] }}
   */
  async saveAgentResponse(agentName, agentTitle, userQuestion, responseContent, options = {}) {
    const projectId = options.projectId || this.activeProjectId;
    if (!projectId) return null; // No active project — skip

    const project = this.projects.get(projectId);
    if (!project) return null;

    // Determine folder
    const agentKey = this._normalizeAgentName(agentName);
    const folderInfo = AGENT_FOLDERS[agentKey] || { dir: '99-other', label: agentName };
    const targetDir = path.join(project.path, folderInfo.dir);
    await fs.mkdir(targetDir, { recursive: true });

    // Detect doc type and title
    const docType = detectDocType(agentKey, responseContent);
    const title = extractTitle(responseContent, userQuestion.slice(0, 60));
    const safeTitle = sanitize(title);
    const ts = timestamp();

    // All produced artifact paths
    const artifacts = [];

    // ── 1. Reference log → _historique/ ──────────────────────────────
    const histDir = path.join(project.path, HISTORY_DIR);
    await fs.mkdir(histDir, { recursive: true });

    const logFileName = `${ts}-${agentKey}-${docType}-${safeTitle}.md`;
    const logFilePath = path.join(histDir, logFileName);

    const frontMatter = [
      '---',
      `title: "${title.replace(/"/g, '\\"')}"`,
      `agent: ${agentTitle}`,
      `agent_key: ${agentKey}`,
      `type: ${docType}`,
      `date: ${new Date().toISOString()}`,
      `project: "${project.name.replace(/"/g, '\\"')}"`,
      options.sessionId ? `session: ${options.sessionId}` : null,
      `question: "${userQuestion.slice(0, 200).replace(/"/g, '\\"').replace(/\n/g, ' ')}"`,
      '---',
    ].filter(Boolean).join('\n');

    await fs.writeFile(logFilePath, `${frontMatter}\n\n${responseContent}`, 'utf8');

    // ── 2. Clean document artifact → agent folder ────────────────────
    const cleanDoc = this._buildCleanDocument(responseContent, docType, title);
    if (cleanDoc) {
      const docFileName = `${ts}-${docType}-${safeTitle}.md`;
      const docFilePath = path.join(targetDir, docFileName);
      await fs.writeFile(docFilePath, cleanDoc, 'utf8');
      artifacts.push({ type: 'document', path: docFilePath, name: docFileName });
    }

    // ── 3. Code blocks → individual source files ─────────────────────
    const codeBlocks = this._parseCodeBlocks(responseContent);
    if (codeBlocks.length > 0) {
      // If there are named files, create a sub-directory for the code
      const hasNamedFiles = codeBlocks.some(b => b.named);
      const codeDir = hasNamedFiles
        ? path.join(targetDir, `${ts}-${safeTitle}-code`)
        : targetDir;

      if (hasNamedFiles) {
        await fs.mkdir(codeDir, { recursive: true });
      }

      let unnamedIdx = 0;
      for (const block of codeBlocks) {
        if (!block.content.trim()) continue;

        let fileDest;
        if (block.named) {
          // Named file: preserve its path structure inside the code sub-dir
          fileDest = path.join(codeDir, block.filePath);
        } else {
          // Unnamed file: generate a name from the language
          unnamedIdx++;
          const ext = block.ext || 'txt';
          const codeFileName = `code-${unnamedIdx}.${ext}`;
          fileDest = path.join(targetDir, `${ts}-${codeFileName}`);
        }

        try {
          await fs.mkdir(path.dirname(fileDest), { recursive: true });
          await fs.writeFile(fileDest, block.content, 'utf8');
          artifacts.push({
            type: 'code',
            path: fileDest,
            name: path.basename(fileDest),
            language: block.language,
            named: block.named,
          });
        } catch (err) {
          console.error(`[DocManager] Failed to write code artifact ${fileDest}:`, err.message);
        }
      }
    }

    // ── 4. SVG extraction ────────────────────────────────────────────
    if (responseContent.includes('<svg') && responseContent.includes('</svg>')) {
      const svgRegex = /<svg[\s\S]*?<\/svg>/g;
      let svgMatch;
      let svgIndex = 0;
      while ((svgMatch = svgRegex.exec(responseContent)) !== null) {
        svgIndex++;
        const svgFileName = `${ts}-${docType}-${safeTitle}-${svgIndex}.svg`;
        const svgPath = path.join(targetDir, svgFileName);
        await fs.writeFile(svgPath, svgMatch[0], 'utf8');
        artifacts.push({ type: 'svg', path: svgPath, name: svgFileName });
      }
    }

    // ── 5. Mermaid extraction → .mmd ─────────────────────────────────
    const mermaidRegex = /```mermaid\s*\n([\s\S]*?)```/g;
    let mmdMatch;
    let mmdIndex = 0;
    while ((mmdMatch = mermaidRegex.exec(responseContent)) !== null) {
      mmdIndex++;
      const mmdFileName = `${ts}-${docType}-${safeTitle}-${mmdIndex}.mmd`;
      const mmdPath = path.join(targetDir, mmdFileName);
      await fs.writeFile(mmdPath, mmdMatch[1].trim(), 'utf8');
      artifacts.push({ type: 'mermaid', path: mmdPath, name: mmdFileName });
    }

    // ── 6. JSON extraction → .json ───────────────────────────────────
    const jsonRegex = /```json\s*\n([\s\S]*?)```/g;
    let jsonMatch;
    let jsonIndex = 0;
    while ((jsonMatch = jsonRegex.exec(responseContent)) !== null) {
      try {
        JSON.parse(jsonMatch[1]); // validate
        jsonIndex++;
        const jsonFileName = `${ts}-${docType}-${safeTitle}-${jsonIndex}.json`;
        const jsonPath = path.join(targetDir, jsonFileName);
        await fs.writeFile(jsonPath, jsonMatch[1].trim(), 'utf8');
        artifacts.push({ type: 'json', path: jsonPath, name: jsonFileName });
      } catch { /* not valid JSON, skip */ }
    }

    // ── 7. YAML extraction → .yaml ──────────────────────────────────
    const yamlRegex = /```ya?ml\s*\n([\s\S]*?)```/g;
    let yamlMatch;
    let yamlIndex = 0;
    while ((yamlMatch = yamlRegex.exec(responseContent)) !== null) {
      yamlIndex++;
      const yamlFileName = `${ts}-${docType}-${safeTitle}-${yamlIndex}.yaml`;
      const yamlPath = path.join(targetDir, yamlFileName);
      await fs.writeFile(yamlPath, yamlMatch[1].trim(), 'utf8');
      artifacts.push({ type: 'yaml', path: yamlPath, name: yamlFileName });
    }

    // ── 8. HTML extraction → .html (standalone HTML blocks) ─────────
    const htmlRegex = /```html\s*\n([\s\S]*?)```/g;
    let htmlMatch;
    let htmlIndex = 0;
    while ((htmlMatch = htmlRegex.exec(responseContent)) !== null) {
      const htmlContent = htmlMatch[1].trim();
      // Only save as standalone HTML if it looks like a full document or significant fragment
      if (htmlContent.includes('<!DOCTYPE') || htmlContent.includes('<html') || htmlContent.length > 200) {
        htmlIndex++;
        const htmlFileName = `${ts}-${docType}-${safeTitle}-${htmlIndex}.html`;
        const htmlPath = path.join(targetDir, htmlFileName);
        await fs.writeFile(htmlPath, htmlContent, 'utf8');
        artifacts.push({ type: 'html', path: htmlPath, name: htmlFileName });
      }
    }

    // ── Update project stats ─────────────────────────────────────────
    project.documentCount += 1 + artifacts.length;
    if (!project.agents[agentKey]) {
      project.agents[agentKey] = { docCount: 0, lastActivity: 0 };
    }
    project.agents[agentKey].docCount += 1 + artifacts.length;
    project.agents[agentKey].lastActivity = Date.now();
    project.updatedAt = Date.now();
    await this._saveMeta(project);

    return {
      filePath: logFilePath,
      relativePath: path.relative(project.path, logFilePath).replace(/\\/g, '/'),
      fileName: logFileName,
      docType,
      title,
      agentKey,
      folder: folderInfo.dir,
      artifacts,
      artifactCount: artifacts.length,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  CONVERSATION HISTORY EXPORT
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Save a full conversation as a history file.
   */
  async saveConversationHistory(agentName, agentTitle, messages, options = {}) {
    const projectId = options.projectId || this.activeProjectId;
    if (!projectId) return null;

    const project = this.projects.get(projectId);
    if (!project) return null;

    const histDir = path.join(project.path, HISTORY_DIR);
    await fs.mkdir(histDir, { recursive: true });

    const ts = timestamp();
    const safeName = sanitize(agentName);
    const fileName = `${ts}-conversation-${safeName}.md`;
    const filePath = path.join(histDir, fileName);

    let content = `---
title: "Conversation avec ${agentTitle}"
agent: ${agentTitle}
date: ${new Date().toISOString()}
messages: ${messages.length}
---

# Conversation avec ${agentTitle}

> Exportée le ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')}

`;

    for (const msg of messages) {
      const role = msg.role === 'user' ? '👤 Utilisateur' : `🤖 ${agentTitle}`;
      const time = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString('fr-FR') : '';
      content += `## ${role}${time ? ` (${time})` : ''}\n\n${msg.content}\n\n---\n\n`;
    }

    await fs.writeFile(filePath, content, 'utf8');
    return { filePath, fileName };
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  PROJECT BROWSING
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Get the documentation tree for a project.
   */
  async getProjectTree(projectId) {
    const project = this.projects.get(projectId || this.activeProjectId);
    if (!project) return [];

    const tree = [];
    for (const [agentKey, { dir, label }] of Object.entries(AGENT_FOLDERS)) {
      const folderPath = path.join(project.path, dir);
      try {
        const files = await fs.readdir(folderPath);
        const docs = files
          .filter(f => !f.startsWith('.'))
          .map(f => ({
            name: f,
            path: `${dir}/${f}`,
            ext: path.extname(f).slice(1),
            agent: agentKey,
          }))
          .sort((a, b) => b.name.localeCompare(a.name)); // newest first

        tree.push({
          agent: agentKey,
          label,
          dir,
          documents: docs,
          count: docs.length
        });
      } catch {
        tree.push({ agent: agentKey, label, dir, documents: [], count: 0 });
      }
    }

    // History folder
    try {
      const histPath = path.join(project.path, HISTORY_DIR);
      const files = await fs.readdir(histPath);
      tree.push({
        agent: '_history',
        label: 'Historique',
        dir: HISTORY_DIR,
        documents: files.filter(f => !f.startsWith('.')).map(f => ({
          name: f,
          path: `${HISTORY_DIR}/${f}`,
          ext: path.extname(f).slice(1),
          agent: '_history',
        })),
        count: files.length
      });
    } catch {
      tree.push({ agent: '_history', label: 'Historique', dir: HISTORY_DIR, documents: [], count: 0 });
    }

    return tree;
  }

  /**
   * Read a document file from a project.
   */
  async readDocument(projectId, relativePath) {
    const project = this.projects.get(projectId || this.activeProjectId);
    if (!project) throw new Error('PROJECT_NOT_FOUND');

    const fullPath = path.join(project.path, relativePath);
    // Security: ensure the path is within the project dir
    if (!fullPath.startsWith(project.path)) throw new Error('INVALID_PATH');

    const content = await fs.readFile(fullPath, 'utf8');
    const stat = await fs.stat(fullPath);
    return {
      content,
      size: stat.size,
      path: relativePath,
      modifiedAt: stat.mtimeMs
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  INTERNAL
  // ═══════════════════════════════════════════════════════════════════════

  _normalizeAgentName(name) {
    if (!name) return 'unknown';
    const lower = name.toLowerCase().trim();
    // Handle display names → keys
    if (lower.includes('analyst') || lower.includes('analyse')) return 'analyst';
    if (lower.includes('architect') || lower.includes('architecte')) return 'architect';
    if (lower.includes('product owner') || lower === 'po') return 'po';
    if (lower.includes('project manager') || lower.includes('chef de projet') || lower === 'pm') return 'pm';
    if (lower.includes('ux') || lower.includes('design')) return 'ux-expert';
    if (lower.includes('dev') || lower.includes('développeur') || lower.includes('developer')) return 'dev';
    if (lower.includes('qa') || lower.includes('qualit') || lower.includes('test')) return 'qa';
    if (lower.includes('scrum') || lower === 'sm') return 'sm';
    if (lower.includes('master') || lower.includes('bmad-master')) return 'bmad-master';
    if (lower.includes('orchestrat')) return 'bmad-orchestrator';
    // Direct key match
    if (AGENT_FOLDERS[lower]) return lower;
    return lower;
  }

  /**
   * Export a project folder as a ZIP archive.
   * Uses PowerShell on Windows, zip on macOS/Linux.
   */
  async exportProjectZip(projectId, destPath) {
    const project = this.projects.get(projectId || this.activeProjectId);
    if (!project) throw new Error('PROJECT_NOT_FOUND');

    const { exec } = require('child_process');
    const util = require('util');
    const execP = util.promisify(exec);

    if (process.platform === 'win32') {
      const src = project.path.replace(/\\/g, '\\\\');
      const dst = destPath.replace(/\\/g, '\\\\');
      await execP(`powershell -NoProfile -Command "Compress-Archive -Path '${src}' -DestinationPath '${dst}' -Force"`);
    } else {
      const srcDir = path.dirname(project.path);
      const srcBase = path.basename(project.path);
      await execP(`cd "${srcDir}" && zip -r "${destPath}" "${srcBase}"`);
    }
    return { success: true, path: destPath };
  }

  /**
   * Write (create or overwrite) a document file in a project.
   * Used by the inline Markdown editor.
   */
  async writeDocument(projectId, relativePath, content) {
    const project = this.projects.get(projectId || this.activeProjectId);
    if (!project) throw new Error('PROJECT_NOT_FOUND');

    const fullPath = path.join(project.path, relativePath);
    if (!fullPath.startsWith(project.path)) throw new Error('INVALID_PATH');

    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content, 'utf8');

    // Update project metadata
    project.documentCount = await this._countDocuments(project.path);
    project.updatedAt = Date.now();
    await this._saveMeta(project);

    return { success: true, path: relativePath, size: Buffer.byteLength(content, 'utf8') };
  }

  async _countDocuments(dir) {
    try {
      let count = 0;
      const scan = async (d) => {
        const entries = await fs.readdir(d, { withFileTypes: true });
        for (const e of entries) {
          if (e.isDirectory() && !e.name.startsWith('.')) await scan(path.join(d, e.name));
          else if (e.isFile() && e.name.endsWith('.md')) count++;
        }
      };
      await scan(dir);
      return count;
    } catch { return 0; }
  }

  async _saveMeta(project) {
    const meta = { ...project };
    await fs.writeFile(
      path.join(project.path, '.bmad-project.json'),
      JSON.stringify(meta, null, 2),
      'utf8'
    );
  }
}

module.exports = DocumentationManager;
