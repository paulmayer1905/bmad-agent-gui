/**
 * Project Context - Shared memory for inter-agent communication
 * Stores artifacts, decisions, and agent contributions that are
 * automatically injected into agent system prompts.
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

class ProjectContext {
  constructor(options = {}) {
    this.basePath = options.basePath || path.join(process.env.HOME || process.env.USERPROFILE, '.bmad');
    this.contextPath = path.join(this.basePath, 'project-context');
    this.artifacts = [];
    this.decisions = [];
    this.loaded = false;
  }

  async initialize() {
    await fs.mkdir(this.contextPath, { recursive: true });
    await this.load();
  }

  // ─── Artifacts ────────────────────────────────────────────────────────

  async addArtifact(artifact) {
    const entry = {
      id: `art-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
      type: artifact.type || 'document',
      title: artifact.title,
      content: artifact.content,
      summary: artifact.summary || null,
      agent: artifact.agent || 'unknown',
      tags: artifact.tags || [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      version: 1
    };
    this.artifacts.push(entry);
    await this.save();
    return entry;
  }

  async updateArtifact(id, updates) {
    const idx = this.artifacts.findIndex(a => a.id === id);
    if (idx === -1) throw new Error(`Artefact ${id} introuvable`);

    this.artifacts[idx] = {
      ...this.artifacts[idx],
      ...updates,
      id: this.artifacts[idx].id,
      createdAt: this.artifacts[idx].createdAt,
      updatedAt: Date.now(),
      version: this.artifacts[idx].version + 1
    };
    await this.save();
    return this.artifacts[idx];
  }

  async removeArtifact(id) {
    const idx = this.artifacts.findIndex(a => a.id === id);
    if (idx === -1) throw new Error(`Artefact ${id} introuvable`);
    const removed = this.artifacts.splice(idx, 1)[0];
    await this.save();
    return removed;
  }

  getArtifact(id) {
    return this.artifacts.find(a => a.id === id) || null;
  }

  listArtifacts(filter = {}) {
    let results = [...this.artifacts];
    if (filter.type) results = results.filter(a => a.type === filter.type);
    if (filter.agent) results = results.filter(a => a.agent === filter.agent);
    if (filter.tags) results = results.filter(a => filter.tags.some(t => a.tags.includes(t)));
    return results.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  // ─── Decisions ────────────────────────────────────────────────────────

  async addDecision(decision) {
    const entry = {
      id: `dec-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
      title: decision.title,
      description: decision.description,
      rationale: decision.rationale || null,
      agent: decision.agent || 'unknown',
      impact: decision.impact || 'normal',
      tags: decision.tags || [],
      createdAt: Date.now()
    };
    this.decisions.push(entry);
    await this.save();
    return entry;
  }

  listDecisions() {
    return [...this.decisions].sort((a, b) => b.createdAt - a.createdAt);
  }

  // ─── Context Injection ─────────────────────────────────────────────────

  /**
   * Build a context summary suitable for injection into an agent's system prompt.
   * Tailored per agent type to include the most relevant information.
   */
  buildContextForAgent(agentName) {
    if (this.artifacts.length === 0 && this.decisions.length === 0) {
      return '';
    }

    const lines = ['\n--- PROJET : CONTEXTE PARTAGÉ ---'];

    // Recent decisions (last 10)
    if (this.decisions.length > 0) {
      lines.push('\n📋 Décisions récentes :');
      const recent = this.decisions.slice(-10);
      for (const d of recent) {
        lines.push(`- [${d.impact.toUpperCase()}] ${d.title} (par ${d.agent}) : ${d.description}`);
      }
    }

    // Relevant artifacts
    if (this.artifacts.length > 0) {
      lines.push('\n📦 Artefacts du projet :');

      // Group by type
      const byType = {};
      for (const a of this.artifacts) {
        if (!byType[a.type]) byType[a.type] = [];
        byType[a.type].push(a);
      }

      const relevanceMap = this._getRelevanceMap(agentName);

      for (const [type, items] of Object.entries(byType)) {
        const relevance = relevanceMap[type] || 'summary';

        for (const item of items) {
          if (relevance === 'full') {
            lines.push(`\n### ${item.title} (${item.type}, par ${item.agent})`);
            lines.push(item.content);
          } else if (relevance === 'summary') {
            const summary = item.summary || item.content.slice(0, 300) + (item.content.length > 300 ? '...' : '');
            lines.push(`- ${item.title} (${item.type}, par ${item.agent}) : ${summary}`);
          }
          // 'none' = skip
        }
      }
    }

    lines.push('\n--- FIN CONTEXTE PARTAGÉ ---');
    return lines.join('\n');
  }

  /**
   * Returns relevance level for each artifact type based on agent role.
   * 'full' = inject complete content, 'summary' = inject summary only, 'none' = skip
   */
  _getRelevanceMap(agentName) {
    const name = (agentName || '').toLowerCase();

    const maps = {
      'analyst': { analysis: 'full', prd: 'full', architecture: 'summary', story: 'summary', design: 'none', code: 'none', test: 'none' },
      'architect': { analysis: 'full', prd: 'full', architecture: 'full', story: 'summary', design: 'summary', code: 'summary', test: 'none' },
      'pm': { analysis: 'full', prd: 'full', architecture: 'summary', story: 'full', design: 'summary', code: 'none', test: 'summary' },
      'po': { analysis: 'full', prd: 'full', architecture: 'summary', story: 'full', design: 'summary', code: 'none', test: 'summary' },
      'dev': { analysis: 'summary', prd: 'summary', architecture: 'full', story: 'full', design: 'full', code: 'full', test: 'full' },
      'qa': { analysis: 'summary', prd: 'summary', architecture: 'summary', story: 'full', design: 'summary', code: 'full', test: 'full' },
      'ux': { analysis: 'summary', prd: 'full', architecture: 'summary', story: 'summary', design: 'full', code: 'none', test: 'none' },
      'sm': { analysis: 'summary', prd: 'summary', architecture: 'summary', story: 'full', design: 'none', code: 'none', test: 'summary' },
    };

    // Find best matching map
    for (const [key, map] of Object.entries(maps)) {
      if (name.includes(key)) return { document: 'summary', decision: 'full', ...map };
    }

    // Default: everything as summary
    return { document: 'summary', decision: 'full', analysis: 'summary', prd: 'summary', architecture: 'summary', story: 'summary', design: 'summary', code: 'summary', test: 'summary' };
  }

  // ─── Stats ───────────────────────────────────────────────────────────

  getStats() {
    const byType = {};
    const byAgent = {};
    for (const a of this.artifacts) {
      byType[a.type] = (byType[a.type] || 0) + 1;
      byAgent[a.agent] = (byAgent[a.agent] || 0) + 1;
    }
    return {
      totalArtifacts: this.artifacts.length,
      totalDecisions: this.decisions.length,
      byType,
      byAgent,
      lastUpdate: this.artifacts.length > 0
        ? Math.max(...this.artifacts.map(a => a.updatedAt))
        : null
    };
  }

  // ─── Clear ───────────────────────────────────────────────────────────

  async clear() {
    this.artifacts = [];
    this.decisions = [];
    await this.save();
  }

  // ─── Persistence ────────────────────────────────────────────────────────

  async save() {
    const data = {
      version: 1,
      savedAt: Date.now(),
      artifacts: this.artifacts,
      decisions: this.decisions
    };
    await fs.writeFile(
      path.join(this.contextPath, 'context.json'),
      JSON.stringify(data, null, 2)
    );
  }

  async load() {
    try {
      const raw = await fs.readFile(path.join(this.contextPath, 'context.json'), 'utf8');
      const data = JSON.parse(raw);
      this.artifacts = data.artifacts || [];
      this.decisions = data.decisions || [];
      this.loaded = true;
    } catch {
      // Fresh start
      this.artifacts = [];
      this.decisions = [];
      this.loaded = true;
    }
  }
}

module.exports = ProjectContext;
