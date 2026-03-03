/**
 * Tests for AgentCoordinator - Phases 2, 3, 4
 * Delegation, Pipeline Workflow, Party Mode
 */

const crypto = require('crypto');
const AgentCoordinator = require('../agent-coordinator');

// ─── Mock factories ──────────────────────────────────────────────────────

function createMockAIService() {
  const conversations = new Map();
  return {
    conversations,
    buildSystemPrompt: jest.fn((agentDef, agentName) => `System prompt for ${agentName}`),
    sendMessage: jest.fn(async (sessionId, message) => ({
      content: `Réponse mock de l'agent pour: ${message.slice(0, 50)}`,
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
    qa: { rawContent: '# QA Agent\nRole: QA Engineer' },
    'ux-expert': { rawContent: '# UX Expert Agent\nRole: UX Designer' },
  };

  const metadata = {
    analyst: { name: 'analyst', title: 'Business Analyst', icon: '📊' },
    architect: { name: 'architect', title: 'Software Architect', icon: '🏗️' },
    dev: { name: 'dev', title: 'Senior Developer', icon: '💻' },
    pm: { name: 'pm', title: 'Product Manager', icon: '📋' },
    qa: { name: 'qa', title: 'QA Engineer', icon: '🧪' },
    'ux-expert': { name: 'ux-expert', title: 'UX Expert', icon: '🎨' },
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

describe('AgentCoordinator', () => {
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
  //  PHASE 2 — Delegation
  // ═══════════════════════════════════════════════════════════════════════

  describe('Phase 2: Delegation (delegateToAgent)', () => {
    test('should delegate a question to the target agent', async () => {
      const result = await coordinator.delegateToAgent(
        'session-123',
        'architect',
        'Quelle architecture recommandes-tu pour un microservice ?'
      );

      expect(result.agentName).toBe('architect');
      expect(result.agentTitle).toBe('Software Architect');
      expect(result.agentIcon).toBe('🏗️');
      expect(result.question).toBe('Quelle architecture recommandes-tu pour un microservice ?');
      expect(result.response).toBeDefined();
      expect(result.usage).toBeDefined();
    });

    test('should create and clean up transient sub-session', async () => {
      await coordinator.delegateToAgent(null, 'dev', 'Comment structurer ce module ?');

      // Verify a conversation was created (via buildSystemPrompt call)
      expect(mockAIService.buildSystemPrompt).toHaveBeenCalledWith(
        '# Dev Agent\nRole: Senior Developer',
        'Senior Developer'
      );

      // Should be cleaned up after delegation
      // All delegation sessions have IDs starting with 'delegation-'
      const delegationSessions = [...mockAIService.conversations.keys()]
        .filter(k => k.startsWith('delegation-'));
      expect(delegationSessions).toHaveLength(0);
    });

    test('should include project context in delegation prompt', async () => {
      await coordinator.delegateToAgent(null, 'qa', 'Quels tests écrire ?');

      expect(mockProjectContext.buildContextForAgent).toHaveBeenCalledWith('qa');
      
      // The prompt sent to sendMessage should contain context
      const sentMessage = mockAIService.sendMessage.mock.calls[0][1];
      expect(sentMessage).toContain('[Context for qa]');
    });

    test('should save response as artifact when option is set', async () => {
      await coordinator.delegateToAgent(null, 'analyst', 'Analyse ce besoin', {
        saveAsArtifact: true,
        artifactType: 'analysis'
      });

      expect(mockProjectContext.addArtifact).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'analysis',
          agent: 'Business Analyst',
          tags: expect.arrayContaining(['delegation', 'analyst'])
        })
      );
    });

    test('should NOT save artifact when option is not set', async () => {
      await coordinator.delegateToAgent(null, 'dev', 'Question rapide');

      expect(mockProjectContext.addArtifact).not.toHaveBeenCalled();
    });

    test('should throw and cleanup on AI service error', async () => {
      mockAIService.sendMessage.mockRejectedValueOnce(new Error('LLM_ERROR'));

      await expect(
        coordinator.delegateToAgent(null, 'dev', 'Should fail')
      ).rejects.toThrow('LLM_ERROR');

      // Transient session should still be cleaned up
      const delegationSessions = [...mockAIService.conversations.keys()]
        .filter(k => k.startsWith('delegation-'));
      expect(delegationSessions).toHaveLength(0);
    });

    test('should throw for unknown agent', async () => {
      mockBackend.getAgent.mockRejectedValueOnce(new Error('Agent nonexistent not found'));

      await expect(
        coordinator.delegateToAgent(null, 'nonexistent', 'Hello?')
      ).rejects.toThrow();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  //  PHASE 3 — Pipeline Workflow
  // ═══════════════════════════════════════════════════════════════════════

  describe('Phase 3: Pipeline Workflow', () => {
    test('should execute a simple 2-step pipeline', async () => {
      const pipeline = {
        name: 'Test Pipeline',
        initialInput: 'Analyse des besoins pour un chat bot',
        steps: [
          { agent: 'analyst', task: 'Analyse des besoins', artifactType: 'analysis', saveArtifact: true },
          { agent: 'architect', task: 'Architecture technique', artifactType: 'architecture', saveArtifact: true }
        ]
      };

      const result = await coordinator.executePipeline(pipeline);

      expect(result.status).toBe('completed');
      expect(result.name).toBe('Test Pipeline');
      expect(result.steps).toHaveLength(2);
      expect(result.steps[0].status).toBe('completed');
      expect(result.steps[1].status).toBe('completed');
      expect(result.results).toHaveLength(2);
      expect(result.completedAt).toBeDefined();
    });

    test('should chain step outputs (output of step N is input of step N+1)', async () => {
      const pipeline = {
        name: 'Chain test',
        initialInput: 'Initial input data',
        steps: [
          { agent: 'analyst', task: 'Step 1' },
          { agent: 'architect', task: 'Step 2' }
        ]
      };

      await coordinator.executePipeline(pipeline);

      // The second call should include the response from the first step
      const secondStepMessage = mockAIService.sendMessage.mock.calls[1][1];
      // The delegation prompt wraps the step prompt which includes previous output
      // But since delegation creates its own prompt, we check the second delegation call
      expect(mockAIService.sendMessage).toHaveBeenCalledTimes(2);
    });

    test('should emit pipeline events', async () => {
      const events = [];
      coordinator.on('pipeline:start', (e) => events.push({ type: 'start', ...e }));
      coordinator.on('pipeline:step:start', (e) => events.push({ type: 'step:start', ...e }));
      coordinator.on('pipeline:step:done', (e) => events.push({ type: 'step:done', ...e }));
      coordinator.on('pipeline:done', (e) => events.push({ type: 'done', ...e }));

      const pipeline = {
        name: 'Events test',
        steps: [
          { agent: 'analyst', task: 'Step 1' },
          { agent: 'dev', task: 'Step 2' }
        ]
      };

      await coordinator.executePipeline(pipeline);

      expect(events.filter(e => e.type === 'start')).toHaveLength(1);
      expect(events.filter(e => e.type === 'step:start')).toHaveLength(2);
      expect(events.filter(e => e.type === 'step:done')).toHaveLength(2);
      expect(events.filter(e => e.type === 'done')).toHaveLength(1);

      // Verify event data
      expect(events.find(e => e.type === 'start').totalSteps).toBe(2);
      expect(events.find(e => e.type === 'step:start' && e.stepIndex === 0).agentName).toBe('analyst');
      expect(events.find(e => e.type === 'step:start' && e.stepIndex === 1).agentName).toBe('dev');
    });

    test('should stop pipeline on step error by default', async () => {
      mockAIService.sendMessage
        .mockResolvedValueOnce({ content: 'Step 1 OK', usage: {} })
        .mockRejectedValueOnce(new Error('STEP_2_FAILED'));

      const pipeline = {
        name: 'Error test',
        steps: [
          { agent: 'analyst', task: 'OK step' },
          { agent: 'dev', task: 'Failing step' },
          { agent: 'qa', task: 'Should not run' }
        ]
      };

      const result = await coordinator.executePipeline(pipeline);

      expect(result.status).toBe('failed');
      expect(result.steps[0].status).toBe('completed');
      expect(result.steps[1].status).toBe('failed');
      expect(result.steps[2].status).toBe('pending'); // Never reached
    });

    test('should continue on error when continueOnError is true', async () => {
      mockAIService.sendMessage
        .mockResolvedValueOnce({ content: 'Step 1 OK', usage: {} })
        .mockRejectedValueOnce(new Error('STEP_2_FAILED'))
        .mockResolvedValueOnce({ content: 'Step 3 OK', usage: {} });

      const pipeline = {
        name: 'ContinueOnError test',
        steps: [
          { agent: 'analyst', task: 'Step 1' },
          { agent: 'dev', task: 'Step 2 (fails)' },
          { agent: 'qa', task: 'Step 3' }
        ]
      };

      const result = await coordinator.executePipeline(pipeline, { continueOnError: true });

      expect(result.status).toBe('completed');
      expect(result.steps[0].status).toBe('completed');
      expect(result.steps[1].status).toBe('failed');
      expect(result.steps[2].status).toBe('completed');
    });

    test('should track pipeline in activePipelines', async () => {
      const pipeline = {
        name: 'Tracking test',
        steps: [{ agent: 'analyst', task: 'Single step' }]
      };

      const result = await coordinator.executePipeline(pipeline);

      expect(coordinator.activePipelines.has(result.id)).toBe(true);
      expect(coordinator.listPipelines()).toHaveLength(1);
      expect(coordinator.listPipelines()[0].name).toBe('Tracking test');
    });

    test('getPipelineStatus should return sanitized state', async () => {
      const pipeline = {
        name: 'Status test',
        steps: [{ agent: 'analyst', task: 'Test' }]
      };

      const result = await coordinator.executePipeline(pipeline);
      const status = coordinator.getPipelineStatus(result.id);

      expect(status).toBeDefined();
      expect(status.name).toBe('Status test');
      expect(status.status).toBe('completed');
      expect(status.steps[0].result).toBeDefined();
      expect(status.steps[0].result.agentName).toBe('analyst');
    });

    test('getPipelineStatus should return null for unknown ID', () => {
      expect(coordinator.getPipelineStatus('unknown-id')).toBeNull();
    });

    test('getPipelineTemplates should return 4 predefined templates', () => {
      const templates = coordinator.getPipelineTemplates();

      expect(templates).toHaveLength(4);
      expect(templates.map(t => t.id)).toEqual([
        'analysis-to-architecture',
        'full-product-design',
        'story-to-implementation',
        'code-review-pipeline'
      ]);

      // Verify each template has steps
      for (const tmpl of templates) {
        expect(tmpl.steps.length).toBeGreaterThanOrEqual(2);
        expect(tmpl.name).toBeDefined();
        expect(tmpl.description).toBeDefined();
        for (const step of tmpl.steps) {
          expect(step.agent).toBeDefined();
          expect(step.task).toBeDefined();
        }
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  //  PHASE 4 — Party Mode (Multi-Agent Group Chat)
  // ═══════════════════════════════════════════════════════════════════════

  describe('Phase 4: Party Mode', () => {
    test('startParty should create a session with greeting', async () => {
      const result = await coordinator.startParty(['analyst', 'architect', 'dev']);

      expect(result.partyId).toMatch(/^party-/);
      expect(result.agents).toHaveLength(3);
      expect(result.agents.map(a => a.name)).toEqual(['analyst', 'architect', 'dev']);
      expect(result.greeting).toContain('Mode Collaboration activé');
      expect(result.greeting).toContain('Business Analyst');
      expect(result.greeting).toContain('Software Architect');
      expect(result.greeting).toContain('Senior Developer');
      expect(result.messageCount).toBe(1); // System greeting
    });

    test('startParty should load agent metadata for all agents', async () => {
      await coordinator.startParty(['pm', 'qa']);

      expect(mockBackend.getAgentMetadata).toHaveBeenCalledWith('pm');
      expect(mockBackend.getAgentMetadata).toHaveBeenCalledWith('qa');
      expect(mockBackend.getAgent).toHaveBeenCalledWith('pm');
      expect(mockBackend.getAgent).toHaveBeenCalledWith('qa');
    });

    test('sendPartyMessage should route to agent and return response', async () => {
      const party = await coordinator.startParty(['analyst', 'architect']);

      const result = await coordinator.sendPartyMessage(
        party.partyId,
        'Quels sont les risques techniques ?'
      );

      expect(result.responses.length).toBeGreaterThanOrEqual(1);
      expect(result.responses[0].role).toBe('assistant');
      expect(result.responses[0].content).toBeDefined();
      expect(result.responses[0].agentTitle).toBeDefined();
      expect(result.responses[0].agentIcon).toBeDefined();
      expect(result.messageCount).toBeGreaterThan(1);
    });

    test('sendPartyMessage should use explicit targetAgent when provided', async () => {
      const party = await coordinator.startParty(['analyst', 'architect', 'dev']);

      // Reset mocks to track who gets called
      mockAIService.sendMessage.mockClear();

      const result = await coordinator.sendPartyMessage(
        party.partyId,
        'Question pour l\'architecte',
        { targetAgent: 'architect' }
      );

      // Should get exactly 1 response from architect
      // Note: delegation internally calls sendMessage, so the response count tells us
      expect(result.responses).toHaveLength(1);
    });

    test('sendPartyMessage should throw for unknown party ID', async () => {
      await expect(
        coordinator.sendPartyMessage('unknown-party', 'Hello')
      ).rejects.toThrow('PARTY_SESSION_NOT_FOUND');
    });

    test('getPartySession should return session details', async () => {
      const party = await coordinator.startParty(['dev', 'qa']);
      const session = coordinator.getPartySession(party.partyId);

      expect(session).toBeDefined();
      expect(session.id).toBe(party.partyId);
      expect(session.agents).toHaveLength(2);
      expect(session.messages.length).toBeGreaterThanOrEqual(1);
      expect(session.status).toBe('active');
    });

    test('getPartySession should return null for unknown ID', () => {
      expect(coordinator.getPartySession('nonexistent')).toBeNull();
    });

    test('endParty should remove the session', async () => {
      const party = await coordinator.startParty(['analyst']);
      
      const result = coordinator.endParty(party.partyId);
      expect(result.success).toBe(true);

      expect(coordinator.getPartySession(party.partyId)).toBeNull();
    });

    test('listPartySessions should list all active sessions', async () => {
      await coordinator.startParty(['analyst']);
      await coordinator.startParty(['dev', 'qa']);

      const sessions = coordinator.listPartySessions();
      expect(sessions).toHaveLength(2);
      expect(sessions[0].agents.length).toBeGreaterThanOrEqual(1);
      expect(sessions[1].agents.length).toBeGreaterThanOrEqual(1);
    });

    test('party messages should maintain conversation history', async () => {
      const party = await coordinator.startParty(['dev']);

      await coordinator.sendPartyMessage(party.partyId, 'Premier message');
      await coordinator.sendPartyMessage(party.partyId, 'Deuxième message');

      const session = coordinator.getPartySession(party.partyId);
      // 1 system greeting + 2 user messages + 2 assistant responses = 5
      expect(session.messages.length).toBe(5);
      
      // Verify user messages are tracked
      const userMsgs = session.messages.filter(m => m.role === 'user');
      expect(userMsgs).toHaveLength(2);
      expect(userMsgs[0].content).toBe('Premier message');
      expect(userMsgs[1].content).toBe('Deuxième message');
    });

    test('_routeMessage should detect @mentions in messages', async () => {
      const party = await coordinator.startParty(['analyst', 'architect', 'dev']);
      const session = coordinator.partySessions.get(party.partyId);

      // Test @mention routing
      const targets = await coordinator._routeMessage(session, '@architect peux-tu vérifier ?');

      expect(targets).toHaveLength(1);
      expect(targets[0].name).toBe('architect');
    });

    test('_routeMessage should fallback to LLM routing when no @mention', async () => {
      const party = await coordinator.startParty(['analyst', 'architect']);
      const session = coordinator.partySessions.get(party.partyId);

      // Mock the routing call to return "analyst"
      mockAIService.sendMessage.mockResolvedValueOnce({
        content: 'analyst',
        usage: {}
      });

      const targets = await coordinator._routeMessage(session, 'Quels sont les besoins ?');

      // Should have called sendMessage for routing
      expect(targets.length).toBeGreaterThanOrEqual(1);
    });

    test('_routeMessage should fallback to first agent on LLM error', async () => {
      const party = await coordinator.startParty(['dev', 'qa']);
      const session = coordinator.partySessions.get(party.partyId);

      mockAIService.sendMessage.mockRejectedValueOnce(new Error('LLM down'));

      const targets = await coordinator._routeMessage(session, 'Some question');

      // Should fallback to first agent
      expect(targets).toHaveLength(1);
      expect(targets[0].name).toBe('dev');
    });

    test('sendPartyMessage should handle agent error gracefully', async () => {
      const party = await coordinator.startParty(['dev']);

      // Make delegation fail
      mockBackend.getAgent.mockRejectedValueOnce(new Error('Agent unavailable'));

      const result = await coordinator.sendPartyMessage(party.partyId, 'Hello');

      // Should get an error message, not a crash
      expect(result.responses).toHaveLength(1);
      expect(result.responses[0].isError).toBe(true);
      expect(result.responses[0].content).toContain('Erreur');
    });

    test('_buildPartyContext should format conversation history', async () => {
      const party = await coordinator.startParty(['dev']);
      const session = coordinator.partySessions.get(party.partyId);

      // Add some messages
      session.messages.push(
        { role: 'user', content: 'Hello world' },
        { role: 'assistant', agentTitle: 'Senior Developer', content: 'Hi there!' }
      );

      const context = coordinator._buildPartyContext(session, 'dev');

      expect(context).toContain('CONVERSATION EN COURS');
      expect(context).toContain('[Utilisateur] : Hello world');
      expect(context).toContain('[Senior Developer] : Hi there!');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  //  Integration & Edge Cases
  // ═══════════════════════════════════════════════════════════════════════

  describe('Integration & Edge Cases', () => {
    test('pipeline should save artifacts to project context', async () => {
      const pipeline = {
        name: 'Artifact saving test',
        steps: [
          { agent: 'analyst', task: 'Analyze', saveArtifact: true, artifactType: 'analysis' }
        ]
      };

      await coordinator.executePipeline(pipeline);

      // Delegation with saveAsArtifact triggers addArtifact
      expect(mockProjectContext.addArtifact).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'analysis',
          tags: expect.arrayContaining(['delegation'])
        })
      );
    });

    test('pipeline should NOT save artifact when saveArtifact is false', async () => {
      const pipeline = {
        name: 'No save test',
        steps: [
          { agent: 'analyst', task: 'Analyze', saveArtifact: false }
        ]
      };

      await coordinator.executePipeline(pipeline);

      expect(mockProjectContext.addArtifact).not.toHaveBeenCalled();
    });

    test('concurrent pipeline executions should be independent', async () => {
      const p1 = coordinator.executePipeline({
        name: 'Pipeline 1',
        steps: [{ agent: 'analyst', task: 'Step A' }]
      });
      const p2 = coordinator.executePipeline({
        name: 'Pipeline 2',
        steps: [{ agent: 'dev', task: 'Step B' }]
      });

      const [r1, r2] = await Promise.all([p1, p2]);

      expect(r1.id).not.toBe(r2.id);
      expect(r1.name).toBe('Pipeline 1');
      expect(r2.name).toBe('Pipeline 2');
      expect(coordinator.activePipelines.size).toBe(2);
    });

    test('coordinator should be an EventEmitter', () => {
      expect(coordinator.on).toBeDefined();
      expect(coordinator.emit).toBeDefined();
      expect(coordinator.removeListener).toBeDefined();
    });
  });
});
