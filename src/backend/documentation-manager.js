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
   * Save an agent response as a documentation file.
   * Called automatically after each agent response completes.
   *
   * @param {string} agentName - Agent key (e.g. 'architect', 'dev')
   * @param {string} agentTitle - Display name
   * @param {string} userQuestion - The user's question/request
   * @param {string} responseContent - The agent's full response
   * @param {Object} options - { sessionId, usage, projectId }
   * @returns {{ filePath, docType, title }}
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
    const fileName = `${ts}-${docType}-${safeTitle}.md`;
    const filePath = path.join(targetDir, fileName);

    // Build front-matter
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

    // Write file
    const content = `${frontMatter}\n\n${responseContent}`;
    await fs.writeFile(filePath, content, 'utf8');

    // Handle SVG extraction: if content contains <svg>, save a separate .svg
    const svgFiles = [];
    if (responseContent.includes('<svg') && responseContent.includes('</svg>')) {
      const svgRegex = /<svg[\s\S]*?<\/svg>/g;
      let svgMatch;
      let svgIndex = 0;
      while ((svgMatch = svgRegex.exec(responseContent)) !== null) {
        svgIndex++;
        const svgFileName = `${ts}-${docType}-${safeTitle}-${svgIndex}.svg`;
        const svgPath = path.join(targetDir, svgFileName);
        await fs.writeFile(svgPath, svgMatch[0], 'utf8');
        svgFiles.push(svgPath);
      }
    }

    // Handle Mermaid extraction: save as .mmd files
    const mermaidFiles = [];
    const mermaidRegex = /```mermaid\s*\n([\s\S]*?)```/g;
    let mmdMatch;
    let mmdIndex = 0;
    while ((mmdMatch = mermaidRegex.exec(responseContent)) !== null) {
      mmdIndex++;
      const mmdFileName = `${ts}-${docType}-${safeTitle}-${mmdIndex}.mmd`;
      const mmdPath = path.join(targetDir, mmdFileName);
      await fs.writeFile(mmdPath, mmdMatch[1].trim(), 'utf8');
      mermaidFiles.push(mmdPath);
    }

    // Handle JSON extraction: save structured data as .json
    const jsonFiles = [];
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
        jsonFiles.push(jsonPath);
      } catch { /* not valid JSON, skip */ }
    }

    // Update project stats
    project.documentCount++;
    if (!project.agents[agentKey]) {
      project.agents[agentKey] = { docCount: 0, lastActivity: 0 };
    }
    project.agents[agentKey].docCount++;
    project.agents[agentKey].lastActivity = Date.now();
    project.updatedAt = Date.now();
    await this._saveMeta(project);

    const relativePath = path.relative(project.path, filePath).replace(/\\/g, '/');

    return {
      filePath,
      relativePath,
      fileName,
      docType,
      title,
      agentKey,
      folder: folderInfo.dir,
      extraFiles: [...svgFiles, ...mermaidFiles, ...jsonFiles]
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
