/**
 * Tests for AIService.buildSystemPrompt — Agent-specific quality guidelines
 * Covers features from commit 6b1fcb0
 */

const AIService = require('../ai-service');

describe('AIService — buildSystemPrompt Quality Guidelines', () => {
  let service;

  beforeEach(() => {
    service = new AIService();
  });

  const agentDef = '# Test Agent\nRole: Test Role\nActivation: You are a helpful agent.';

  // ═══════════════════════════════════════════════════════════════════════
  //  Basic prompt structure
  // ═══════════════════════════════════════════════════════════════════════

  test('should generate a valid system prompt with agent definition', () => {
    const prompt = service.buildSystemPrompt(agentDef, 'test');

    expect(prompt).toContain('BMAD-METHOD agent');
    expect(prompt).toContain('--- AGENT DEFINITION START ---');
    expect(prompt).toContain(agentDef);
    expect(prompt).toContain('--- AGENT DEFINITION END ---');
    expect(prompt).toContain('You are now test');
  });

  test('should include French language instruction', () => {
    const prompt = service.buildSystemPrompt(agentDef, 'test');
    expect(prompt).toContain('Réponds TOUJOURS en français');
  });

  test('should include completeness instruction', () => {
    const prompt = service.buildSystemPrompt(agentDef, 'test');
    expect(prompt).toContain('Produis des livrables COMPLETS et DÉTAILLÉS');
  });

  // ═══════════════════════════════════════════════════════════════════════
  //  PM-specific quality guidelines  
  // ═══════════════════════════════════════════════════════════════════════

  test('PM agent should get PRD quality guidelines', () => {
    const prompt = service.buildSystemPrompt(agentDef, 'pm');

    expect(prompt).toContain('DIRECTIVES QUALITÉ');
    expect(prompt).toContain('PRODUCT MANAGER');
    expect(prompt).toContain('Épics');
    expect(prompt).toContain('User Stor');
    expect(prompt).toContain('3 Épics');
    expect(prompt).toContain('8 User Stories');
    expect(prompt).toContain("critères d'acceptation");
    expect(prompt).toContain('US-');
    expect(prompt).toContain('JAMAIS');
  });

  test('Product Manager (title) should also get PM guidelines', () => {
    const prompt = service.buildSystemPrompt(agentDef, 'Product Manager');
    expect(prompt).toContain('PRODUCT MANAGER');
  });

  // ═══════════════════════════════════════════════════════════════════════
  //  PO-specific quality guidelines
  // ═══════════════════════════════════════════════════════════════════════

  test('PO agent should get backlog quality guidelines', () => {
    const prompt = service.buildSystemPrompt(agentDef, 'po');

    expect(prompt).toContain('DIRECTIVES QUALITÉ');
    expect(prompt).toContain('PRODUCT OWNER');
    expect(prompt).toContain('backlog');
    expect(prompt).toContain('Sprint');
    expect(prompt).toMatch(/S\/M\/L\/XL/);
    expect(prompt).toContain('dépendances');
  });

  test('Product Owner (title) should also get PO guidelines', () => {
    const prompt = service.buildSystemPrompt(agentDef, 'Product Owner');
    expect(prompt).toContain('PRODUCT OWNER');
  });

  // ═══════════════════════════════════════════════════════════════════════
  //  Analyst-specific quality guidelines
  // ═══════════════════════════════════════════════════════════════════════

  test('Analyst agent should get exhaustive analysis guidelines', () => {
    const prompt = service.buildSystemPrompt(agentDef, 'analyst');

    expect(prompt).toContain('DIRECTIVES QUALITÉ');
    expect(prompt).toContain('ANALYSTE');
    expect(prompt).toContain('EXHAUSTIF');
    expect(prompt).toContain('Must-Have');
    expect(prompt).toContain('Should-Have');
    expect(prompt).toContain('Nice-to-Have');
  });

  test('Business Analyst (title) should get analyst guidelines', () => {
    const prompt = service.buildSystemPrompt(agentDef, 'Business Analyst');

    // The keyword check is on 'analyst' in lowercase
    // 'Business Analyst'.toLowerCase() = 'business analyst' — contains 'analyst'
    expect(prompt).toContain('ANALYSTE');
  });

  // ═══════════════════════════════════════════════════════════════════════
  //  Dev-specific quality guidelines
  // ═══════════════════════════════════════════════════════════════════════

  test('Dev agent should get code quality guidelines', () => {
    const prompt = service.buildSystemPrompt(agentDef, 'dev');

    expect(prompt).toContain('DIRECTIVES QUALITÉ');
    expect(prompt).toContain('DÉVELOPPEUR');
    expect(prompt).toContain('COMPLET');
    expect(prompt).toContain('FONCTIONNEL');
    expect(prompt).toContain('filename:');
    expect(prompt).toContain('User Stories');
  });

  test('Senior Developer (title) should get dev guidelines', () => {
    const prompt = service.buildSystemPrompt(agentDef, 'Senior Developer');
    expect(prompt).toContain('DÉVELOPPEUR');
  });

  // ═══════════════════════════════════════════════════════════════════════
  //  QA-specific quality guidelines
  // ═══════════════════════════════════════════════════════════════════════

  test('QA agent should get testing quality guidelines', () => {
    const prompt = service.buildSystemPrompt(agentDef, 'qa');

    expect(prompt).toContain('DIRECTIVES QUALITÉ');
    expect(prompt).toContain('QA');
    expect(prompt).toContain('couverture');
    expect(prompt).toContain('Critique');
    expect(prompt).toContain('Majeur');
    expect(prompt).toContain('Mineur');
  });

  test('QA Engineer (title) should get qa guidelines', () => {
    const prompt = service.buildSystemPrompt(agentDef, 'QA Engineer');
    // 'QA Engineer'.toLowerCase() = 'qa engineer' — contains 'qa'
    expect(prompt).toContain('QA');
  });

  // ═══════════════════════════════════════════════════════════════════════
  //  Non-matching agents should NOT get specific guidelines
  // ═══════════════════════════════════════════════════════════════════════

  test('Architect should NOT get any specific quality guidelines', () => {
    const prompt = service.buildSystemPrompt(agentDef, 'architect');
    expect(prompt).not.toContain('DIRECTIVES QUALITÉ');
  });

  test('Scrum Master should NOT get any specific quality guidelines', () => {
    const prompt = service.buildSystemPrompt(agentDef, 'sm');
    expect(prompt).not.toContain('DIRECTIVES QUALITÉ');
  });

  // ═══════════════════════════════════════════════════════════════════════
  //  UX Agent — Figma instructions
  // ═══════════════════════════════════════════════════════════════════════

  test('UX agent should get Figma-compatible instructions', () => {
    const uxDef = '# UX Expert Agent\nRole: ux-expert\nDesigns user interfaces.';
    const prompt = service.buildSystemPrompt(uxDef, 'ux-expert');

    expect(prompt).toContain('FIGMA');
    expect(prompt).toContain('SVG');
    expect(prompt).toContain('wireframe');
    expect(prompt).toContain('Figma');
  });

  test('non-UX agents should NOT get Figma instructions', () => {
    const prompt = service.buildSystemPrompt(agentDef, 'dev');
    expect(prompt).not.toContain('FIGMA');
  });

  // ═══════════════════════════════════════════════════════════════════════
  //  Project context integration
  // ═══════════════════════════════════════════════════════════════════════

  test('should include project context when projectContext is set', () => {
    service.projectContext = {
      buildContextForAgent: jest.fn(() => '[SHARED CONTEXT]\nDecision: Use React')
    };

    const prompt = service.buildSystemPrompt(agentDef, 'dev');
    expect(prompt).toContain('[SHARED CONTEXT]');
    expect(prompt).toContain('Use React');
    expect(service.projectContext.buildContextForAgent).toHaveBeenCalledWith('dev');
  });

  test('should work without projectContext', () => {
    service.projectContext = null;
    const prompt = service.buildSystemPrompt(agentDef, 'dev');
    expect(prompt).toBeDefined();
    expect(prompt).toContain('BMAD-METHOD');
  });
});
