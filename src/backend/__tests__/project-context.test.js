/**
 * Tests for ProjectContext - Phase 1: Shared Memory
 */

const path = require('path');
const fs = require('fs').promises;
const os = require('os');

// We need to test the module in Node.js context
const ProjectContext = require('../project-context');

describe('ProjectContext - Phase 1: Mémoire partagée', () => {
  let ctx;
  let tempDir;

  beforeEach(async () => {
    // Use a temp dir for each test to avoid conflicts
    tempDir = path.join(os.tmpdir(), `bmad-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    ctx = new ProjectContext({ basePath: tempDir });
    await ctx.initialize();
  });

  afterEach(async () => {
    // Clean up temp dir
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch { /* ignore */ }
  });

  // ─── Initialization ────────────────────────────────────────────────────

  describe('Initialization', () => {
    test('should initialize with empty artifacts and decisions', () => {
      expect(ctx.artifacts).toEqual([]);
      expect(ctx.decisions).toEqual([]);
      expect(ctx.loaded).toBe(true);
    });

    test('should create the context directory', async () => {
      const exists = await fs.stat(ctx.contextPath).then(() => true).catch(() => false);
      expect(exists).toBe(true);
    });

    test('should load existing data on re-initialization', async () => {
      await ctx.addArtifact({ title: 'Test', content: 'Content', type: 'analysis', agent: 'analyst' });
      
      // Create new instance with same path
      const ctx2 = new ProjectContext({ basePath: tempDir });
      await ctx2.initialize();
      
      expect(ctx2.artifacts).toHaveLength(1);
      expect(ctx2.artifacts[0].title).toBe('Test');
    });
  });

  // ─── Artifacts CRUD ────────────────────────────────────────────────────

  describe('Artifacts CRUD', () => {
    test('addArtifact should create artifact with generated ID', async () => {
      const artifact = await ctx.addArtifact({
        title: 'Document PRD',
        content: 'Requirements détaillés...',
        type: 'prd',
        agent: 'pm',
        summary: 'Résumé du PRD',
        tags: ['product', 'requirements']
      });

      expect(artifact.id).toMatch(/^art-/);
      expect(artifact.title).toBe('Document PRD');
      expect(artifact.content).toBe('Requirements détaillés...');
      expect(artifact.type).toBe('prd');
      expect(artifact.agent).toBe('pm');
      expect(artifact.summary).toBe('Résumé du PRD');
      expect(artifact.tags).toEqual(['product', 'requirements']);
      expect(artifact.version).toBe(1);
      expect(artifact.createdAt).toBeDefined();
      expect(artifact.updatedAt).toBeDefined();
    });

    test('addArtifact should use defaults for optional fields', async () => {
      const artifact = await ctx.addArtifact({
        title: 'Simple doc',
        content: 'Some content'
      });

      expect(artifact.type).toBe('document');
      expect(artifact.agent).toBe('unknown');
      expect(artifact.summary).toBeNull();
      expect(artifact.tags).toEqual([]);
    });

    test('getArtifact should return artifact by ID', async () => {
      const added = await ctx.addArtifact({ title: 'TestGet', content: 'Content' });
      const found = ctx.getArtifact(added.id);
      expect(found).toBeDefined();
      expect(found.title).toBe('TestGet');
    });

    test('getArtifact should return null for unknown ID', () => {
      expect(ctx.getArtifact('art-nonexistent')).toBeNull();
    });

    test('updateArtifact should update fields and increment version', async () => {
      const added = await ctx.addArtifact({ title: 'V1', content: 'Initial' });
      const updated = await ctx.updateArtifact(added.id, { 
        title: 'V2', 
        content: 'Updated content' 
      });

      expect(updated.title).toBe('V2');
      expect(updated.content).toBe('Updated content');
      expect(updated.version).toBe(2);
      expect(updated.id).toBe(added.id); // ID should not change
      expect(updated.createdAt).toBe(added.createdAt); // createdAt should not change
      expect(updated.updatedAt).toBeGreaterThanOrEqual(added.updatedAt);
    });

    test('updateArtifact should throw for unknown ID', async () => {
      await expect(ctx.updateArtifact('art-nonexistent', { title: 'X' }))
        .rejects.toThrow('Artefact art-nonexistent introuvable');
    });

    test('removeArtifact should remove and return the artifact', async () => {
      const added = await ctx.addArtifact({ title: 'ToRemove', content: 'Bye' });
      const removed = await ctx.removeArtifact(added.id);

      expect(removed.title).toBe('ToRemove');
      expect(ctx.artifacts).toHaveLength(0);
      expect(ctx.getArtifact(added.id)).toBeNull();
    });

    test('removeArtifact should throw for unknown ID', async () => {
      await expect(ctx.removeArtifact('art-nonexistent'))
        .rejects.toThrow('Artefact art-nonexistent introuvable');
    });

    test('listArtifacts should return all artifacts sorted by updatedAt desc', async () => {
      await ctx.addArtifact({ title: 'First', content: 'A' });
      await new Promise(r => setTimeout(r, 10)); // ensure different timestamps
      await ctx.addArtifact({ title: 'Second', content: 'B' });

      const all = ctx.listArtifacts();
      expect(all).toHaveLength(2);
      expect(all[0].title).toBe('Second'); // Most recent first
      expect(all[1].title).toBe('First');
    });

    test('listArtifacts should filter by type', async () => {
      await ctx.addArtifact({ title: 'PRD', content: 'A', type: 'prd' });
      await ctx.addArtifact({ title: 'Code', content: 'B', type: 'code' });
      await ctx.addArtifact({ title: 'PRD2', content: 'C', type: 'prd' });

      const prds = ctx.listArtifacts({ type: 'prd' });
      expect(prds).toHaveLength(2);
      expect(prds.every(a => a.type === 'prd')).toBe(true);
    });

    test('listArtifacts should filter by agent', async () => {
      await ctx.addArtifact({ title: 'A', content: 'X', agent: 'pm' });
      await ctx.addArtifact({ title: 'B', content: 'Y', agent: 'dev' });

      const devArtifacts = ctx.listArtifacts({ agent: 'dev' });
      expect(devArtifacts).toHaveLength(1);
      expect(devArtifacts[0].title).toBe('B');
    });

    test('listArtifacts should filter by tags', async () => {
      await ctx.addArtifact({ title: 'A', content: 'X', tags: ['frontend', 'react'] });
      await ctx.addArtifact({ title: 'B', content: 'Y', tags: ['backend', 'node'] });
      await ctx.addArtifact({ title: 'C', content: 'Z', tags: ['react', 'testing'] });

      const reactArtifacts = ctx.listArtifacts({ tags: ['react'] });
      expect(reactArtifacts).toHaveLength(2);
    });
  });

  // ─── Decisions ─────────────────────────────────────────────────────────

  describe('Decisions', () => {
    test('addDecision should create decision with generated ID', async () => {
      const decision = await ctx.addDecision({
        title: 'Choix de framework',
        description: 'React choisi pour le frontend',
        rationale: 'Écosystème riche et support communautaire',
        agent: 'architect',
        impact: 'high',
        tags: ['tech', 'frontend']
      });

      expect(decision.id).toMatch(/^dec-/);
      expect(decision.title).toBe('Choix de framework');
      expect(decision.description).toBe('React choisi pour le frontend');
      expect(decision.rationale).toBe('Écosystème riche et support communautaire');
      expect(decision.agent).toBe('architect');
      expect(decision.impact).toBe('high');
      expect(decision.tags).toEqual(['tech', 'frontend']);
      expect(decision.createdAt).toBeDefined();
    });

    test('addDecision should use defaults for optional fields', async () => {
      const decision = await ctx.addDecision({
        title: 'Simple',
        description: 'Desc'
      });

      expect(decision.agent).toBe('unknown');
      expect(decision.impact).toBe('normal');
      expect(decision.rationale).toBeNull();
      expect(decision.tags).toEqual([]);
    });

    test('listDecisions should return all decisions sorted by createdAt desc', async () => {
      await ctx.addDecision({ title: 'First', description: 'A' });
      await new Promise(r => setTimeout(r, 10));
      await ctx.addDecision({ title: 'Second', description: 'B' });

      const all = ctx.listDecisions();
      expect(all).toHaveLength(2);
      expect(all[0].title).toBe('Second'); // Most recent first
    });
  });

  // ─── Context Injection ─────────────────────────────────────────────────

  describe('Context Injection (buildContextForAgent)', () => {
    test('should return empty string when no data', () => {
      const result = ctx.buildContextForAgent('dev');
      expect(result).toBe('');
    });

    test('should include decisions in context', async () => {
      await ctx.addDecision({
        title: 'Choix React',
        description: 'React pour le frontend',
        agent: 'architect',
        impact: 'high'
      });

      const context = ctx.buildContextForAgent('dev');
      expect(context).toContain('CONTEXTE PARTAGÉ');
      expect(context).toContain('Décisions récentes');
      expect(context).toContain('HIGH');
      expect(context).toContain('Choix React');
    });

    test('should include artifacts in context', async () => {
      await ctx.addArtifact({
        title: 'Architecture doc',
        content: 'Architecture technique détaillée avec microservices...',
        type: 'architecture',
        agent: 'architect'
      });

      const context = ctx.buildContextForAgent('dev');
      expect(context).toContain('Artefacts du projet');
      expect(context).toContain('Architecture doc');
    });

    test('should show full content for relevant artifact types', async () => {
      const longContent = 'Contenu très détaillé de l\'architecture technique avec plein de détails';
      await ctx.addArtifact({
        title: 'Architecture',
        content: longContent,
        type: 'architecture',
        agent: 'architect'
      });

      // Dev agent should get full architecture content
      const devContext = ctx.buildContextForAgent('dev');
      expect(devContext).toContain(longContent);
    });

    test('should show summary for less relevant artifact types', async () => {
      const longContent = 'A'.repeat(500); // Long content
      await ctx.addArtifact({
        title: 'Design UX',
        content: longContent,
        summary: 'Résumé du design',
        type: 'design',
        agent: 'ux'
      });

      // QA agent should get summary for design artifacts
      const qaContext = ctx.buildContextForAgent('qa');
      expect(qaContext).toContain('Résumé du design');
      expect(qaContext).not.toContain(longContent);
    });

    test('should auto-generate summary from content if no summary provided', async () => {
      const longContent = 'B'.repeat(500);
      await ctx.addArtifact({
        title: 'Long doc',
        content: longContent,
        type: 'design',
        agent: 'ux'
      });

      // SM sees design as 'none', but analyst sees it as 'none' too.
      // PM sees design as 'summary'
      const pmContext = ctx.buildContextForAgent('pm');
      // Auto-summary = first 300 chars + '...'
      expect(pmContext).toContain('B'.repeat(300));
      expect(pmContext).toContain('...');
    });

    test('should skip artifacts with relevance "none"', async () => {
      await ctx.addArtifact({
        title: 'Code module auth',
        content: 'export function auth() { ... }',
        type: 'code',
        agent: 'dev'
      });

      // Analyst should NOT see code
      const analystContext = ctx.buildContextForAgent('analyst');
      expect(analystContext).not.toContain('Code module auth');
      expect(analystContext).not.toContain('export function auth');
    });
  });

  // ─── Relevance Map ─────────────────────────────────────────────────────

  describe('Relevance Map (_getRelevanceMap)', () => {
    test('should return correct map for "dev"', () => {
      const map = ctx._getRelevanceMap('dev');
      expect(map.architecture).toBe('full');
      expect(map.code).toBe('full');
      expect(map.story).toBe('full');
      expect(map.analysis).toBe('summary');
      expect(map.prd).toBe('summary');
    });

    test('should return correct map for "architect"', () => {
      const map = ctx._getRelevanceMap('architect');
      expect(map.architecture).toBe('full');
      expect(map.analysis).toBe('full');
      expect(map.prd).toBe('full');
      expect(map.code).toBe('summary');
      expect(map.test).toBe('none');
    });

    test('should return correct map for "qa"', () => {
      const map = ctx._getRelevanceMap('qa');
      expect(map.code).toBe('full');
      expect(map.test).toBe('full');
      expect(map.story).toBe('full');
      expect(map.architecture).toBe('summary');
    });

    test('should return default map for unknown agent', () => {
      const map = ctx._getRelevanceMap('unknown-agent');
      expect(map.analysis).toBe('summary');
      expect(map.prd).toBe('summary');
      expect(map.architecture).toBe('summary');
    });

    test('should match agents with partial name (e.g. "ux-expert" contains "ux")', () => {
      const map = ctx._getRelevanceMap('ux-expert');
      expect(map.design).toBe('full');
      expect(map.prd).toBe('full');
      expect(map.code).toBe('none');
    });
  });

  // ─── Stats ─────────────────────────────────────────────────────────────

  describe('Stats', () => {
    test('should return zeroed stats when empty', () => {
      const stats = ctx.getStats();
      expect(stats.totalArtifacts).toBe(0);
      expect(stats.totalDecisions).toBe(0);
      expect(stats.byType).toEqual({});
      expect(stats.byAgent).toEqual({});
      expect(stats.lastUpdate).toBeNull();
    });

    test('should compute correct stats', async () => {
      await ctx.addArtifact({ title: 'A', content: 'X', type: 'prd', agent: 'pm' });
      await ctx.addArtifact({ title: 'B', content: 'Y', type: 'code', agent: 'dev' });
      await ctx.addArtifact({ title: 'C', content: 'Z', type: 'prd', agent: 'pm' });
      await ctx.addDecision({ title: 'D', description: 'D' });

      const stats = ctx.getStats();
      expect(stats.totalArtifacts).toBe(3);
      expect(stats.totalDecisions).toBe(1);
      expect(stats.byType).toEqual({ prd: 2, code: 1 });
      expect(stats.byAgent).toEqual({ pm: 2, dev: 1 });
      expect(stats.lastUpdate).toBeDefined();
    });
  });

  // ─── Clear ──────────────────────────────────────────────────────────────

  describe('Clear', () => {
    test('should clear all artifacts and decisions', async () => {
      await ctx.addArtifact({ title: 'A', content: 'X' });
      await ctx.addDecision({ title: 'D', description: 'D' });
      
      await ctx.clear();

      expect(ctx.artifacts).toHaveLength(0);
      expect(ctx.decisions).toHaveLength(0);
    });

    test('should persist empty state after clear', async () => {
      await ctx.addArtifact({ title: 'A', content: 'X' });
      await ctx.clear();

      // Reload
      const ctx2 = new ProjectContext({ basePath: tempDir });
      await ctx2.initialize();
      expect(ctx2.artifacts).toHaveLength(0);
    });
  });

  // ─── Persistence ───────────────────────────────────────────────────────

  describe('Persistence', () => {
    test('should persist artifacts to disk', async () => {
      await ctx.addArtifact({ title: 'Persisted', content: 'Data', type: 'test' });
      
      const filePath = path.join(ctx.contextPath, 'context.json');
      const raw = await fs.readFile(filePath, 'utf8');
      const data = JSON.parse(raw);
      
      expect(data.version).toBe(1);
      expect(data.artifacts).toHaveLength(1);
      expect(data.artifacts[0].title).toBe('Persisted');
    });

    test('should handle corrupted JSON gracefully', async () => {
      const filePath = path.join(ctx.contextPath, 'context.json');
      await fs.writeFile(filePath, 'NOT VALID JSON!!!');

      const ctx2 = new ProjectContext({ basePath: tempDir });
      await ctx2.initialize();
      
      // Should start fresh without crashing
      expect(ctx2.artifacts).toEqual([]);
      expect(ctx2.decisions).toEqual([]);
      expect(ctx2.loaded).toBe(true);
    });
  });
});
