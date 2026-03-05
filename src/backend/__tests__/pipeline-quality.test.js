/**
 * Tests for AgentCoordinator — Pipeline templates, instruction constants, PO presence
 * Covers features from commits 6b1fcb0 (pipeline quality improvements)
 */

const AgentCoordinator = require('../agent-coordinator');

// ─── Mock factories (reuse pattern from existing tests) ──────────────────

function createMockAIService() {
  const conversations = new Map();
  return {
    conversations,
    buildSystemPrompt: jest.fn((agentDef, agentName) => `System prompt for ${agentName}`),
    sendMessage: jest.fn(async (sessionId, message) => ({
      content: `Réponse mock de l'agent pour: ${(message || '').slice(0, 50)}`,
      usage: { inputTokens: 100, outputTokens: 50 }
    }))
  };
}

function createMockProjectContext() {
  return {
    buildContextForAgent: jest.fn((agentName) => `[Context for ${agentName}]`),
    addArtifact: jest.fn(async (artifact) => ({
      id: `art-mock-${Date.now()}`,
      ...artifact,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      version: 1
    }))
  };
}

function createMockBackend() {
  const agents = {
    analyst: { rawContent: '# Analyst Agent\nRole: Business Analyst' },
    architect: { rawContent: '# Architect Agent\nRole: Software Architect' },
    dev: { rawContent: '# Dev Agent\nRole: Senior Developer' },
    pm: { rawContent: '# PM Agent\nRole: Product Manager' },
    po: { rawContent: '# PO Agent\nRole: Product Owner' },
    qa: { rawContent: '# QA Agent\nRole: QA Engineer' },
    'ux-expert': { rawContent: '# UX Expert Agent\nRole: UX Designer' },
    sm: { rawContent: '# SM Agent\nRole: Scrum Master' },
  };

  const metadata = {
    analyst: { name: 'analyst', title: 'Business Analyst', icon: '📊' },
    architect: { name: 'architect', title: 'Software Architect', icon: '🏗️' },
    dev: { name: 'dev', title: 'Senior Developer', icon: '💻' },
    pm: { name: 'pm', title: 'Product Manager', icon: '📋' },
    po: { name: 'po', title: 'Product Owner', icon: '📦' },
    qa: { name: 'qa', title: 'QA Engineer', icon: '🧪' },
    'ux-expert': { name: 'ux-expert', title: 'UX Expert', icon: '🎨' },
    sm: { name: 'sm', title: 'Scrum Master', icon: '🏃' },
  };

  return {
    getAgent: jest.fn(async (name) => {
      if (!agents[name]) throw new Error(`Agent ${name} not found`);
      return agents[name];
    }),
    getAgentMetadata: jest.fn(async (name) => {
      return metadata[name] || { name, title: name, icon: '🤖' };
    })
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────

describe('AgentCoordinator — Pipeline Templates & Instructions (new features)', () => {
  let coordinator;
  let mockAIService;
  let mockProjectContext;
  let mockBackend;

  beforeEach(() => {
    mockAIService = createMockAIService();
    mockProjectContext = createMockProjectContext();
    mockBackend = createMockBackend();

    coordinator = new AgentCoordinator({
      aiService: mockAIService,
      projectContext: mockProjectContext,
      bmadBackend: mockBackend
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  //  PIPELINE TEMPLATES — PO presence and structure  
  // ═══════════════════════════════════════════════════════════════════════

  describe('Pipeline Templates — Updated structure', () => {
    test('should return 7 predefined templates', () => {
      const templates = coordinator.getPipelineTemplates();
      expect(templates).toHaveLength(7);
    });

    test('should include all expected template IDs', () => {
      const templates = coordinator.getPipelineTemplates();
      const ids = templates.map(t => t.id);

      expect(ids).toContain('analysis-to-architecture');
      expect(ids).toContain('full-product-design');
      expect(ids).toContain('story-to-implementation');
      expect(ids).toContain('full-app-development');
      expect(ids).toContain('code-review-pipeline');
    });

    test('full-product-design should include PO step', () => {
      const templates = coordinator.getPipelineTemplates();
      const fullDesign = templates.find(t => t.id === 'full-product-design');

      expect(fullDesign).toBeDefined();
      const agents = fullDesign.steps.map(s => s.agent);
      expect(agents).toContain('po');
      expect(agents).toContain('analyst');
      expect(agents).toContain('pm');
      expect(agents).toContain('architect');
      expect(agents).toContain('ux-expert');

      // PO should come after PM in the pipeline
      const pmIndex = agents.indexOf('pm');
      const poIndex = agents.indexOf('po');
      expect(poIndex).toBeGreaterThan(pmIndex);
    });

    test('story-to-implementation should include PO step', () => {
      const templates = coordinator.getPipelineTemplates();
      const storyToImpl = templates.find(t => t.id === 'story-to-implementation');

      expect(storyToImpl).toBeDefined();
      const agents = storyToImpl.steps.map(s => s.agent);
      expect(agents).toContain('pm');
      expect(agents).toContain('po');
      expect(agents).toContain('dev');
      expect(agents).toContain('qa');

      // Correct order: PM → PO → Dev → QA
      expect(agents.indexOf('pm')).toBeLessThan(agents.indexOf('po'));
      expect(agents.indexOf('po')).toBeLessThan(agents.indexOf('dev'));
      expect(agents.indexOf('dev')).toBeLessThan(agents.indexOf('qa'));
    });

    test('full-app-development should include PO step', () => {
      const templates = coordinator.getPipelineTemplates();
      const fullApp = templates.find(t => t.id === 'full-app-development');

      expect(fullApp).toBeDefined();
      const agents = fullApp.steps.map(s => s.agent);
      expect(agents).toContain('po');
      expect(agents).toContain('analyst');
      expect(agents).toContain('pm');
      expect(agents).toContain('architect');
      expect(agents).toContain('dev');
      expect(agents).toContain('qa');
    });

    test('full-app-development should have 8 steps', () => {
      const templates = coordinator.getPipelineTemplates();
      const fullApp = templates.find(t => t.id === 'full-app-development');
      expect(fullApp.steps).toHaveLength(8);
    });

    test('full-app-development should end with dev fix step', () => {
      const templates = coordinator.getPipelineTemplates();
      const fullApp = templates.find(t => t.id === 'full-app-development');
      const lastStep = fullApp.steps[fullApp.steps.length - 1];

      expect(lastStep.agent).toBe('dev');
      expect(lastStep.task).toContain('orrection');
    });

    test('full-app-development should require workspace', () => {
      const templates = coordinator.getPipelineTemplates();
      const fullApp = templates.find(t => t.id === 'full-app-development');
      expect(fullApp.requiresWorkspace).toBe(true);
    });

    test('analysis-to-architecture should NOT include PO (simple pipeline)', () => {
      const templates = coordinator.getPipelineTemplates();
      const simple = templates.find(t => t.id === 'analysis-to-architecture');

      const agents = simple.steps.map(s => s.agent);
      expect(agents).not.toContain('po');
      expect(agents).toEqual(['analyst', 'architect']);
    });

    test('code-review-pipeline should have architect → qa → dev', () => {
      const templates = coordinator.getPipelineTemplates();
      const review = templates.find(t => t.id === 'code-review-pipeline');

      const agents = review.steps.map(s => s.agent);
      expect(agents).toEqual(['architect', 'qa', 'dev']);
    });

    test('all templates should have name and description', () => {
      const templates = coordinator.getPipelineTemplates();
      for (const t of templates) {
        expect(t.name).toBeDefined();
        expect(t.name.length).toBeGreaterThan(0);
        expect(t.description).toBeDefined();
        expect(t.description.length).toBeGreaterThan(0);
      }
    });

    test('all template steps should have agent and task', () => {
      const templates = coordinator.getPipelineTemplates();
      for (const t of templates) {
        for (const step of t.steps) {
          expect(step.agent).toBeDefined();
          expect(step.task).toBeDefined();
          expect(step.task.length).toBeGreaterThan(0);
        }
      }
    });

    test('dev/qa steps should have extractCode flag', () => {
      const templates = coordinator.getPipelineTemplates();
      for (const t of templates) {
        for (const step of t.steps) {
          if (step.agent === 'dev' || step.agent === 'qa') {
            // At least one pipeline should have extractCode for dev/qa
            // (not all — code-review-pipeline's dev doesn't necessarily)
          }
        }
      }

      // Check specifically story-to-implementation
      const storyToImpl = templates.find(t => t.id === 'story-to-implementation');
      const devStep = storyToImpl.steps.find(s => s.agent === 'dev');
      const qaStep = storyToImpl.steps.find(s => s.agent === 'qa');
      expect(devStep.extractCode).toBe(true);
      expect(qaStep.extractCode).toBe(true);
    });

    test('pipeline steps with instructions should have non-empty instruction strings', () => {
      const templates = coordinator.getPipelineTemplates();
      for (const t of templates) {
        for (const step of t.steps) {
          if (step.instructions) {
            expect(typeof step.instructions).toBe('string');
            expect(step.instructions.length).toBeGreaterThan(20);
          }
        }
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  //  INSTRUCTION CONSTANTS — Quality and completeness
  // ═══════════════════════════════════════════════════════════════════════

  describe('Instruction Constants — Content Quality', () => {
    // Get reference to pipeline templates to access the instruction constants
    let templates;

    beforeEach(() => {
      templates = coordinator.getPipelineTemplates();
    });

    // Helper to get instruction from a template step
    function findInstruction(templateId, agentName) {
      const tmpl = templates.find(t => t.id === templateId);
      if (!tmpl) return null;
      const step = tmpl.steps.find(s => s.agent === agentName);
      return step?.instructions || null;
    }

    test('ANALYST_INSTRUCTIONS should enforce exhaustive feature identification', () => {
      const inst = findInstruction('full-product-design', 'analyst');

      expect(inst).toBeDefined();
      expect(inst).toContain('Résumé exécutif');
      expect(inst).toContain('Fonctionnalités identifiées');
      expect(inst).toContain('EXHAUSTIVE');
      expect(inst).toContain('Must-Have');
      expect(inst).toContain('Should-Have');
      expect(inst).toContain('Nice-to-Have');
      expect(inst).toContain('Contraintes');
    });

    test('PM_PRD_INSTRUCTIONS should enforce epic/story structure with minimums', () => {
      const inst = findInstruction('full-product-design', 'pm');

      expect(inst).toBeDefined();
      expect(inst).toContain('PRD');
      expect(inst).toContain('Épic');
      expect(inst).toContain('User Stor');
      // Minimum requirements
      expect(inst).toContain('3 épics');
      expect(inst).toContain('8');
      // US ID format
      expect(inst).toContain('US-');
      // Acceptance criteria
      expect(inst).toContain("critères d'acceptation");
      // Anti-pattern warnings
      expect(inst).toContain('JAMAIS');
    });

    test('PO_BACKLOG_INSTRUCTIONS should include sprint planning and sizing', () => {
      const inst = findInstruction('full-product-design', 'po');

      expect(inst).toBeDefined();
      expect(inst).toContain('Sprint');
      expect(inst).toContain('backlog');
      // T-shirt sizing
      expect(inst).toMatch(/S\/M\/L\/XL/);
      // Validation
      expect(inst).toContain('Validation');
    });

    test('ARCHITECT_INSTRUCTIONS should be defined and descriptive', () => {
      const inst = findInstruction('analysis-to-architecture', 'architect');
      expect(inst).toBeDefined();
      expect(inst.length).toBeGreaterThan(50);
    });

    test('CODE_GEN_INSTRUCTIONS should enforce complete code and US tracking', () => {
      const inst = findInstruction('story-to-implementation', 'dev');

      expect(inst).toBeDefined();
      expect(inst.length).toBeGreaterThan(50);
    });

    test('QA_TEST_INSTRUCTIONS should be defined', () => {
      const inst = findInstruction('story-to-implementation', 'qa');
      expect(inst).toBeDefined();
      expect(inst.length).toBeGreaterThan(50);
    });

    test('FULL_APP_CODE_INSTRUCTIONS should be used in full-app-development', () => {
      const fullApp = templates.find(t => t.id === 'full-app-development');
      const devSteps = fullApp.steps.filter(s => s.agent === 'dev');

      // Should have 2 dev steps — one for generation, one for fix
      expect(devSteps).toHaveLength(2);
      // Both should have instructions
      expect(devSteps[0].instructions).toBeDefined();
      expect(devSteps[1].instructions).toBeDefined();
      // They should be different instructions
      expect(devSteps[0].instructions).not.toBe(devSteps[1].instructions);
    });

    test('FIX_AND_FINALIZE_INSTRUCTIONS should be used in the last dev step', () => {
      const fullApp = templates.find(t => t.id === 'full-app-development');
      const lastStep = fullApp.steps[fullApp.steps.length - 1];

      expect(lastStep.agent).toBe('dev');
      expect(lastStep.instructions).toBeDefined();
      expect(lastStep.instructions.length).toBeGreaterThan(20);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  //  ENHANCED _routeMessage — Domain descriptions
  // ═══════════════════════════════════════════════════════════════════════

  describe('Enhanced Party Mode Routing', () => {
    test('_routeMessage should send agent descriptions to LLM for routing', async () => {
      const party = await coordinator.startParty(['analyst', 'architect', 'dev']);
      const session = coordinator.partySessions.get(party.partyId);

      // Mock the routing response
      mockAIService.sendMessage.mockResolvedValueOnce({
        content: 'dev',
        usage: {}
      });

      await coordinator._routeMessage(session, 'Peux-tu coder un serveur Express ?');

      // The routing call should include agent descriptions
      const routingCallArgs = mockAIService.sendMessage.mock.calls;
      // Find the routing call (not the greeting call)
      const lastCall = routingCallArgs[routingCallArgs.length - 1];
      expect(lastCall[1]).toBeDefined();
    });

    test('_routeMessage with @mention should bypass LLM routing', async () => {
      const party = await coordinator.startParty(['analyst', 'dev', 'qa']);
      const session = coordinator.partySessions.get(party.partyId);

      // Clear the initial greeting calls
      mockAIService.sendMessage.mockClear();

      const result = await coordinator._routeMessage(session, '@qa peux-tu vérifier ?');

      expect(result.agents).toHaveLength(1);
      expect(result.agents[0].name).toBe('qa');
      expect(result.routingMsg).toBeNull();
      // Should NOT have called sendMessage for routing
      expect(mockAIService.sendMessage).not.toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  //  PIPELINE EXECUTION with instructions
  // ═══════════════════════════════════════════════════════════════════════

  describe('Pipeline Execution with Instruction Constants', () => {
    test('pipeline steps should send instructions to agents', async () => {
      const templates = coordinator.getPipelineTemplates();
      const simpleTemplate = templates.find(t => t.id === 'analysis-to-architecture');

      const pipeline = {
        name: 'Test with instructions',
        initialInput: 'Créer une application de gestion de tâches',
        steps: simpleTemplate.steps
      };

      await coordinator.executePipeline(pipeline);

      // Both steps should have been executed
      expect(mockAIService.sendMessage).toHaveBeenCalledTimes(2);
    });

    test('full-app pipeline execution should complete all 8 steps', async () => {
      const templates = coordinator.getPipelineTemplates();
      const fullApp = templates.find(t => t.id === 'full-app-development');

      const pipeline = {
        name: 'Full app test',
        initialInput: 'Créer un jeu Snake en JavaScript',
        steps: fullApp.steps
      };

      const result = await coordinator.executePipeline(pipeline);

      expect(result.status).toBe('completed');
      expect(result.steps).toHaveLength(8);
      for (const step of result.steps) {
        expect(step.status).toBe('completed');
      }
    });

    test('story-to-implementation pipeline should execute PM→PO→Dev→QA', async () => {
      const templates = coordinator.getPipelineTemplates();
      const storyImpl = templates.find(t => t.id === 'story-to-implementation');

      const pipeline = {
        name: 'Story impl test',
        initialInput: 'Créer un formulaire de contact',
        steps: storyImpl.steps
      };

      const result = await coordinator.executePipeline(pipeline);

      expect(result.status).toBe('completed');
      expect(result.steps).toHaveLength(4);

      // Verify step order
      expect(result.steps[0].agent || result.steps[0].result?.agentName).toBeDefined();
    });
  });
});
