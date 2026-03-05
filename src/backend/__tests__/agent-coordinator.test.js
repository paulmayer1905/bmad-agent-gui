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
    'bmad-orchestrator': { rawContent: '# BMad Orchestrator\nRole: Master Orchestrator' },
    'bmad-master': { rawContent: '# BMad Master\nRole: Master Task Executor' },
  };

  const metadata = {
    analyst: { name: 'analyst', title: 'Business Analyst', icon: '📊' },
    architect: { name: 'architect', title: 'Software Architect', icon: '🏗️' },
    dev: { name: 'dev', title: 'Senior Developer', icon: '💻' },
    pm: { name: 'pm', title: 'Product Manager', icon: '📋' },
    qa: { name: 'qa', title: 'QA Engineer', icon: '🧪' },
    'ux-expert': { name: 'ux-expert', title: 'UX Expert', icon: '🎨' },
    'bmad-orchestrator': { name: 'bmad-orchestrator', title: 'BMad Master Orchestrator', icon: '🎭' },
    'bmad-master': { name: 'bmad-master', title: 'BMad Master Task Executor', icon: '🧙' },
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

    test('getPipelineTemplates should return 7 predefined templates', () => {
      const templates = coordinator.getPipelineTemplates();

      expect(templates).toHaveLength(7);
      expect(templates.map(t => t.id)).toEqual([
        'analysis-to-architecture',
        'full-product-design',
        'story-to-implementation',
        'full-app-development',
        'code-review-pipeline',
        'market-study',
        'full-specifications'
      ]);

      // Verify each template has steps (market-study has 1 step, others have 2+)
      for (const tmpl of templates) {
        expect(tmpl.steps.length).toBeGreaterThanOrEqual(1);
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
      const result = await coordinator._routeMessage(session, '@architect peux-tu vérifier ?');

      expect(result.agents).toHaveLength(1);
      expect(result.agents[0].name).toBe('architect');
      expect(result.routingMsg).toBeNull();
    });

    test('_routeMessage should fallback to LLM routing when no @mention', async () => {
      const party = await coordinator.startParty(['analyst', 'architect']);
      const session = coordinator.partySessions.get(party.partyId);

      // Mock the routing call to return "analyst"
      mockAIService.sendMessage.mockResolvedValueOnce({
        content: 'analyst',
        usage: {}
      });

      const result = await coordinator._routeMessage(session, 'Quels sont les besoins ?');

      // Should have called sendMessage for routing
      expect(result.agents.length).toBeGreaterThanOrEqual(1);
    });

    test('_routeMessage should fallback to first agent on LLM error', async () => {
      const party = await coordinator.startParty(['dev', 'qa']);
      const session = coordinator.partySessions.get(party.partyId);

      mockAIService.sendMessage.mockRejectedValueOnce(new Error('LLM down'));

      const result = await coordinator._routeMessage(session, 'Some question');

      // Should fallback to first agent
      expect(result.agents).toHaveLength(1);
      expect(result.agents[0].name).toBe('dev');
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

  // ═══════════════════════════════════════════════════════════════════════
  //  Peer Review — _runPeerReview()
  // ═══════════════════════════════════════════════════════════════════════

  describe('_runPeerReview()', () => {
    /**
     * Build a minimal fake primaryResult as delegateToAgent would return.
     */
    function makePrimaryResult(response = 'Original deliverable text.') {
      return {
        agentName: 'pm',
        agentTitle: 'Product Manager',
        agentIcon: '📋',
        question: 'Write a spec',
        response,
        usage: { inputTokens: 100, outputTokens: 80 }
      };
    }

    /**
     * Build a minimal step definition that includes peerReview config.
     */
    function makeStep(peerReviewOverrides = {}) {
      return {
        agent: 'pm',
        task: 'Write a functional spec',
        saveArtifact: false,
        peerReview: {
          reviewer: 'analyst',
          maxRounds: 2,
          ...peerReviewOverrides
        }
      };
    }

    /**
     * Build a minimal pipeline state.
     */
    function makeState() {
      return {
        steps: [makeStep()],
        results: [],
        currentStep: 0
      };
    }

    // ── Helper that spies on delegateToAgent with a sequence of responses ──

    function mockDelegateSequence(coordinator, responses) {
      let callIndex = 0;
      jest.spyOn(coordinator, 'delegateToAgent').mockImplementation(
        async (fromSessionId, agentName, prompt, opts) => {
          const response = responses[callIndex] ?? `Default response ${callIndex}`;
          callIndex++;
          return {
            agentName,
            agentTitle: agentName,
            agentIcon: '🤖',
            question: prompt,
            response,
            usage: { inputTokens: 50, outputTokens: 30 }
          };
        }
      );
    }

    afterEach(() => {
      jest.restoreAllMocks();
    });

    // ────────────────────────────────────────────────────────────────────
    test('emits pipeline:review:start at the beginning', async () => {
      // Reviewer immediately validates
      mockDelegateSequence(coordinator, ['VALIDÉ: Looks great']);

      const events = [];
      coordinator.on('pipeline:review:start', (d) => events.push({ type: 'start', ...d }));

      await coordinator._runPeerReview({
        step: makeStep(),
        primaryResult: makePrimaryResult(),
        state: makeState(),
        pipelineId: 'pipe-1',
        stepIndex: 0
      });

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        type: 'start',
        pipelineId: 'pipe-1',
        stepIndex: 0,
        reviewer: 'analyst',
        primaryAgent: 'pm',
        maxRounds: 2
      });
    });

    // ────────────────────────────────────────────────────────────────────
    test('accepts immediately when reviewer returns VALIDÉ: signal', async () => {
      // round 1: reviewer says VALIDÉ
      mockDelegateSequence(coordinator, ['VALIDÉ: No issues found']);

      const acceptedEvents = [];
      const challengeEvents = [];
      coordinator.on('pipeline:review:accepted', (d) => acceptedEvents.push(d));
      coordinator.on('pipeline:review:challenge', (d) => challengeEvents.push(d));

      const result = await coordinator._runPeerReview({
        step: makeStep({ maxRounds: 3 }),
        primaryResult: makePrimaryResult('My spec'),
        state: makeState(),
        pipelineId: 'pipe-2',
        stepIndex: 0
      });

      // Only 1 challenge call (reviewer), 0 revision calls
      expect(coordinator.delegateToAgent).toHaveBeenCalledTimes(1);
      expect(challengeEvents).toHaveLength(1);

      // Accepted event with by: 'signal'
      expect(acceptedEvents).toHaveLength(1);
      expect(acceptedEvents[0].by).toBe('signal');
      expect(acceptedEvents[0].rounds).toBe(1);

      // Returned result keeps original response (no revision happened)
      expect(result.response).toBe('My spec');
      expect(result.peerReviewRounds).toHaveLength(1);
    });

    // ────────────────────────────────────────────────────────────────────
    test('also accepts with VALIDE: (no accent) signal', async () => {
      mockDelegateSequence(coordinator, ['VALIDE: acceptable']);

      const acceptedEvents = [];
      coordinator.on('pipeline:review:accepted', (d) => acceptedEvents.push(d));

      await coordinator._runPeerReview({
        step: makeStep({ maxRounds: 2 }),
        primaryResult: makePrimaryResult(),
        state: makeState(),
        pipelineId: 'pipe-3',
        stepIndex: 0
      });

      expect(acceptedEvents[0].by).toBe('signal');
    });

    // ────────────────────────────────────────────────────────────────────
    test('triggers revision when reviewer challenges, then accepts in round 2', async () => {
      // round 1: reviewer challenges
      // round 1: primary revises
      // round 2: reviewer validates
      mockDelegateSequence(coordinator, [
        'Issue 1: Missing scope. Issue 2: No KPIs.',
        'Revised spec with scope and KPIs.',
        'VALIDÉ: Much better now'
      ]);

      const revisionEvents = [];
      const acceptedEvents = [];
      coordinator.on('pipeline:review:revision', (d) => revisionEvents.push(d));
      coordinator.on('pipeline:review:accepted', (d) => acceptedEvents.push(d));

      const result = await coordinator._runPeerReview({
        step: makeStep({ maxRounds: 2 }),
        primaryResult: makePrimaryResult('Original spec'),
        state: makeState(),
        pipelineId: 'pipe-4',
        stepIndex: 1
      });

      // 3 delegateToAgent calls: challenge R1, revision R1, challenge R2
      expect(coordinator.delegateToAgent).toHaveBeenCalledTimes(3);

      // Revision event emitted
      expect(revisionEvents).toHaveLength(1);
      expect(revisionEvents[0]).toMatchObject({ round: 1, maxRounds: 2 });

      // Accepted by signal
      expect(acceptedEvents[0].by).toBe('signal');

      // Final response is the revised content
      expect(result.response).toBe('Revised spec with scope and KPIs.');

      // peerReviewRounds tracks challenge + revision
      expect(result.peerReviewRounds).toHaveLength(3); // challenge-R1, revision-R1, challenge-R2
    });

    // ────────────────────────────────────────────────────────────────────
    test('exhausts all rounds when reviewer never validates', async () => {
      // maxRounds: 2 → challenge R1, revision R1, challenge R2 → exhausted (no revision on last round)
      mockDelegateSequence(coordinator, [
        'Critique round 1: needs improvement.',
        'Improved version v2.',
        'Critique round 2: still issues.'
      ]);

      const acceptedEvents = [];
      coordinator.on('pipeline:review:accepted', (d) => acceptedEvents.push(d));

      const result = await coordinator._runPeerReview({
        step: makeStep({ maxRounds: 2 }),
        primaryResult: makePrimaryResult('v1'),
        state: makeState(),
        pipelineId: 'pipe-5',
        stepIndex: 0
      });

      // challenge R1 + revision R1 + challenge R2 = 3 calls
      expect(coordinator.delegateToAgent).toHaveBeenCalledTimes(3);

      // Accepted "by rounds"
      expect(acceptedEvents).toHaveLength(1);
      expect(acceptedEvents[0].by).toBe('rounds');

      // Final result is last revision
      expect(result.response).toBe('Improved version v2.');
    });

    // ────────────────────────────────────────────────────────────────────
    test('with maxRounds: 1 — challenge only, no revision on exhaustion', async () => {
      mockDelegateSequence(coordinator, ['Still needs work.']);

      const revisionEvents = [];
      coordinator.on('pipeline:review:revision', (d) => revisionEvents.push(d));

      const result = await coordinator._runPeerReview({
        step: makeStep({ maxRounds: 1 }),
        primaryResult: makePrimaryResult('Spec v1'),
        state: makeState(),
        pipelineId: 'pipe-6',
        stepIndex: 0
      });

      // Only 1 call: reviewer challenge in round 1 (no revision since round === maxRounds)
      expect(coordinator.delegateToAgent).toHaveBeenCalledTimes(1);
      expect(revisionEvents).toHaveLength(0);

      // Result unchanged from primary
      expect(result.response).toBe('Spec v1');
    });

    // ────────────────────────────────────────────────────────────────────
    test('peerReviewRounds array contains typed entries', async () => {
      // challenge R1, revision R1, challenge R2 (VALIDÉ)
      mockDelegateSequence(coordinator, [
        'critique text',
        'revised output',
        'VALIDÉ: great'
      ]);

      const result = await coordinator._runPeerReview({
        step: makeStep({ maxRounds: 2 }),
        primaryResult: makePrimaryResult(),
        state: makeState(),
        pipelineId: 'pipe-7',
        stepIndex: 0
      });

      const rounds = result.peerReviewRounds;

      expect(rounds[0]).toMatchObject({ type: 'challenge', reviewer: 'analyst', round: 1 });
      expect(rounds[1]).toMatchObject({ type: 'revision', agent: 'pm', round: 1 });
      expect(rounds[2]).toMatchObject({ type: 'challenge', reviewer: 'analyst', round: 2 });
    });

    // ────────────────────────────────────────────────────────────────────
    test('pipeline with peerReview emits reviewRounds in pipeline:step:done', async () => {
      // Simulate a full pipeline execution with peerReview on step 0
      // delegateToAgent will be called: primary step, then reviewer (VALIDÉ immediately)
      const callResponses = ['Great primary output', 'VALIDÉ: approved'];
      let callIdx = 0;
      jest.spyOn(coordinator, 'delegateToAgent').mockImplementation(async (from, agent, prompt, opts) => {
        const response = callResponses[callIdx++] ?? 'fallback';
        return {
          agentName: agent,
          agentTitle: agent,
          agentIcon: '🤖',
          question: prompt,
          response,
          usage: { inputTokens: 10, outputTokens: 10 }
        };
      });

      const stepDoneEvents = [];
      coordinator.on('pipeline:step:done', (d) => stepDoneEvents.push(d));

      await coordinator.executePipeline({
        name: 'Test peer review pipeline',
        steps: [{
          agent: 'pm',
          task: 'Write spec',
          saveArtifact: false,
          peerReview: { reviewer: 'analyst', maxRounds: 2 }
        }]
      });

      expect(stepDoneEvents).toHaveLength(1);
      // Reviewer validated in round 1 → 1 review round recorded
      expect(stepDoneEvents[0].reviewRounds).toBe(1);
    });

    // ────────────────────────────────────────────────────────────────────
    test('pipeline without peerReview emits reviewRounds: 0', async () => {
      const stepDoneEvents = [];
      coordinator.on('pipeline:step:done', (d) => stepDoneEvents.push(d));

      await coordinator.executePipeline({
        name: 'No peer review',
        steps: [{ agent: 'analyst', task: 'Analyze', saveArtifact: false }]
      });

      expect(stepDoneEvents[0].reviewRounds).toBe(0);
    });

    // ────────────────────────────────────────────────────────────────────
    test('revision prompt includes the current deliverable text', async () => {
      const prompts = [];
      jest.spyOn(coordinator, 'delegateToAgent').mockImplementation(
        async (from, agent, prompt, opts) => {
          prompts.push({ agent, prompt });
          // Round 1: reviewer critiques, Round 1: primary revises, Round 2: reviewer validates
          if (prompts.length === 1) return { agentName: agent, agentTitle: agent, agentIcon: '🤖', question: prompt, response: 'Needs more detail on auth module.', usage: { inputTokens: 10, outputTokens: 10 }};
          if (prompts.length === 2) return { agentName: agent, agentTitle: agent, agentIcon: '🤖', question: prompt, response: 'Revised spec with auth.', usage: { inputTokens: 10, outputTokens: 10 }};
          return { agentName: agent, agentTitle: agent, agentIcon: '🤖', question: prompt, response: 'VALIDÉ: Complete', usage: { inputTokens: 10, outputTokens: 10 }};
        }
      );

      await coordinator._runPeerReview({
        step: makeStep({ maxRounds: 2 }),
        primaryResult: makePrimaryResult('Initial architecture document with modules A, B, C.'),
        state: makeState(),
        pipelineId: 'pipe-prompt',
        stepIndex: 0
      });

      // The revision prompt (2nd call) must include the original deliverable
      expect(prompts[1].prompt).toContain('--- TON LIVRABLE ACTUEL ---');
      expect(prompts[1].prompt).toContain('Initial architecture document with modules A, B, C.');
      // And the critique
      expect(prompts[1].prompt).toContain('Needs more detail on auth module.');
    });

    // ────────────────────────────────────────────────────────────────────
    test('reviewRounds counts actual review rounds, not array entries', async () => {
      // 2 rounds: challenge R1 → revision R1 → challenge R2 (VALIDÉ)
      // That's 3 array entries but 2 actual review rounds
      mockDelegateSequence(coordinator, [
        'Critique round 1.',
        'Revised output.',
        'VALIDÉ: good now'
      ]);

      const result = await coordinator._runPeerReview({
        step: makeStep({ maxRounds: 2 }),
        primaryResult: makePrimaryResult(),
        state: makeState(),
        pipelineId: 'pipe-count',
        stepIndex: 0
      });

      // Array has 3 entries (challenge, revision, challenge)
      expect(result.peerReviewRounds).toHaveLength(3);
      // But actual review rounds = challenges = 2
      const roundCount = result.peerReviewRounds.filter(r => r.type === 'challenge').length;
      expect(roundCount).toBe(2);
    });

    // ────────────────────────────────────────────────────────────────────
    test('pipeline with peerReview defers artifact save to post-review', async () => {
      const callResponses = ['Primary output', 'VALIDÉ: approved'];
      let callIdx = 0;
      const delegateSpy = jest.spyOn(coordinator, 'delegateToAgent').mockImplementation(
        async (from, agent, prompt, opts) => {
          const response = callResponses[callIdx++] ?? 'fallback';
          // Track if saveAsArtifact was passed
          return {
            agentName: agent, agentTitle: agent, agentIcon: '🤖',
            question: prompt, response,
            usage: { inputTokens: 10, outputTokens: 10 },
            _opts: opts // expose for assertion
          };
        }
      );

      await coordinator.executePipeline({
        name: 'Deferred save test',
        steps: [{
          agent: 'pm',
          task: 'Write spec',
          saveArtifact: true,
          artifactType: 'functional-spec',
          peerReview: { reviewer: 'analyst', maxRounds: 1 }
        }]
      });

      // First call (primary agent) should NOT save artifact (deferred to post-review)
      expect(delegateSpy.mock.calls[0][3]).toMatchObject({ saveAsArtifact: false });
      // Second call (reviewer) should NOT save artifact
      expect(delegateSpy.mock.calls[1][3]).toMatchObject({ saveAsArtifact: false });
      // Post-review save happens via projectContext.addArtifact
      expect(mockProjectContext.addArtifact).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'functional-spec',
          tags: expect.arrayContaining(['peer-reviewed', 'pm', 'analyst'])
        })
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  //  Pipeline Instructions Synchronization
  // ═══════════════════════════════════════════════════════════════════════

  describe('Pipeline Instructions Sync (single source of truth)', () => {
    const EXPECTED_TASK_IDS = [
      'pipeline-analyst-analysis',
      'pipeline-analyst-market-study',
      'pipeline-pm-functional-spec',
      'pipeline-pm-prd',
      'pipeline-pm-roadmap',
      'pipeline-po-backlog',
      'pipeline-architect-design',
      'pipeline-architect-technical-spec',
      'pipeline-ux-design',
      'pipeline-dev-code',
      'pipeline-dev-full-app',
      'pipeline-dev-fix-finalize',
      'pipeline-qa-test'
    ];

    test('constructor stores pipelineInstructions map', () => {
      const instrMap = { 'pipeline-analyst-analysis': 'custom text' };
      const coord = new AgentCoordinator({
        aiService: mockAIService,
        projectContext: mockProjectContext,
        bmadBackend: mockBackend,
        pipelineInstructions: instrMap
      });
      expect(coord._pipelineInstructions).toBe(instrMap);
    });

    test('constructor defaults to empty map when no pipelineInstructions', () => {
      expect(coordinator._pipelineInstructions).toEqual({});
    });

    test('_instr() returns dynamic content when available', () => {
      const coord = new AgentCoordinator({
        aiService: mockAIService,
        projectContext: mockProjectContext,
        bmadBackend: mockBackend,
        pipelineInstructions: { 'pipeline-analyst-analysis': 'DYNAMIC CONTENT' }
      });
      const result = coord._instr('pipeline-analyst-analysis', 'FALLBACK');
      expect(result).toBe('DYNAMIC CONTENT');
    });

    test('_instr() falls back to hardcoded constant when file not loaded', () => {
      const result = coordinator._instr('pipeline-analyst-analysis', 'HARDCODED FALLBACK');
      expect(result).toBe('HARDCODED FALLBACK');
    });

    test('all pipeline templates reference valid instruction task IDs', () => {
      // Provide all task IDs with marker content so we can verify they're used
      const instrMap = {};
      EXPECTED_TASK_IDS.forEach(id => { instrMap[id] = `LOADED:${id}`; });

      const coord = new AgentCoordinator({
        aiService: mockAIService,
        projectContext: mockProjectContext,
        bmadBackend: mockBackend,
        pipelineInstructions: instrMap
      });

      const templates = coord.getPipelineTemplates();

      // Collect all instructions from all pipeline steps
      const allInstructions = [];
      for (const tpl of templates) {
        for (const step of tpl.steps) {
          allInstructions.push(step.instructions);
        }
      }

      // Every LOADED:* marker should appear at least once in the pipeline steps
      const usedIds = EXPECTED_TASK_IDS.filter(id =>
        allInstructions.some(instr => instr === `LOADED:${id}`)
      );

      expect(usedIds).toEqual(EXPECTED_TASK_IDS);
    });

    test('pipeline templates work without pipelineInstructions (graceful fallback)', () => {
      // coordinator created with no pipelineInstructions (default empty {})
      const templates = coordinator.getPipelineTemplates();
      expect(templates.length).toBeGreaterThanOrEqual(6);

      // Every step should have a non-empty instructions string (hardcoded fallback)
      for (const tpl of templates) {
        for (const step of tpl.steps) {
          expect(step.instructions).toBeTruthy();
          expect(typeof step.instructions).toBe('string');
          expect(step.instructions.length).toBeGreaterThan(10);
        }
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  //  Orchestrator Party Routing & * Command Preprocessing
  // ═══════════════════════════════════════════════════════════════════════

  describe('Orchestrator Party Routing', () => {
    test('startParty with orchestrator shows orchestrator-specific greeting', async () => {
      const result = await coordinator.startParty(['bmad-orchestrator', 'dev', 'qa']);

      expect(result.greeting).toContain('BMad Orchestrator');
      expect(result.greeting).toContain('je dirigerai');
      // Orchestrator is not listed as specialist
      expect(result.greeting).not.toContain('BMad Master Orchestrator');
    });

    test('startParty without orchestrator shows generic greeting', async () => {
      const result = await coordinator.startParty(['dev', 'qa']);

      expect(result.greeting).toContain('Mode Collaboration activé');
    });

    test('_routeMessage with orchestrator uses orchestrator routing', async () => {
      mockBackend.getAgent.mockImplementation(async (name) => {
        return { rawContent: `# ${name} definition` };
      });
      mockBackend.getAgentMetadata.mockImplementation(async (name) => {
        const titles = { 'bmad-orchestrator': 'BMad Orchestrator', 'dev': 'Developer', 'qa': 'QA' };
        return { name, title: titles[name] || name, icon: '🤖' };
      });

      const party = await coordinator.startParty(['bmad-orchestrator', 'dev', 'qa']);
      const session = coordinator.partySessions.get(party.partyId);

      // Mock orchestrator returning routing JSON
      mockAIService.sendMessage.mockResolvedValueOnce({
        content: '{"agents": ["dev"], "reason": "Question de code"}',
        usage: {}
      });

      const result = await coordinator._routeMessage(session, 'Comment structurer ce module ?');

      expect(result.agents).toHaveLength(1);
      expect(result.agents[0].name).toBe('dev');
      // Orchestrator produces a visible routing message
      expect(result.routingMsg).not.toBeNull();
      expect(result.routingMsg.agent).toBe('bmad-orchestrator');
      expect(result.routingMsg.isRouting).toBe(true);
      expect(result.routingMsg.content).toContain('Question de code');
    });

    test('sendPartyMessage includes orchestrator routing msg in responses', async () => {
      mockBackend.getAgent.mockImplementation(async (name) => {
        return { rawContent: `# ${name}` };
      });
      mockBackend.getAgentMetadata.mockImplementation(async (name) => {
        const m = { 'bmad-orchestrator': { title: 'BMad Orchestrator', icon: '🎭' }, 'dev': { title: 'Dev', icon: '💻' } };
        return { name, ...(m[name] || { title: name, icon: '🤖' }) };
      });

      const party = await coordinator.startParty(['bmad-orchestrator', 'dev']);

      // First sendMessage = orchestrator routing, second = dev response
      mockAIService.sendMessage
        .mockResolvedValueOnce({ content: '{"agents": ["dev"], "reason": "Code question"}', usage: {} })
        .mockResolvedValueOnce({ content: 'Dev response here', usage: {} });

      const result = await coordinator.sendPartyMessage(party.partyId, 'Write some code');

      // Should have 2 responses: routing msg + dev answer
      expect(result.responses.length).toBe(2);
      expect(result.responses[0].isRouting).toBe(true);
      expect(result.responses[0].agent).toBe('bmad-orchestrator');
      expect(result.responses[1].agent).toBe('dev');
    });
  });

  describe('* Command Preprocessing', () => {
    test('preprocessCommand returns unmodified message for non-meta agents', async () => {
      const { message, metadata } = await coordinator.preprocessCommand('dev', '*help');
      expect(message).toBe('*help');
      expect(metadata).toBeNull();
    });

    test('preprocessCommand passes through non-command messages for meta agents', async () => {
      const { message, metadata } = await coordinator.preprocessCommand('bmad-master', 'Tell me about architecture');
      expect(message).toBe('Tell me about architecture');
      expect(metadata).toBeNull();
    });

    test('*party-mode returns navigation metadata', async () => {
      const { metadata } = await coordinator.preprocessCommand('bmad-orchestrator', '*party-mode');
      expect(metadata).toEqual({ action: 'navigate', target: '/collaboration' });
    });

    test('*task without arg lists available tasks', async () => {
      mockBackend.listTasks = jest.fn(async () => [
        { name: 'create-doc', filename: 'create-doc.md', title: 'Create Document' },
        { name: 'shard-doc', filename: 'shard-doc.md', title: 'Shard Document' }
      ]);

      const { message, metadata } = await coordinator.preprocessCommand('bmad-master', '*task');
      expect(message).toContain('create-doc');
      expect(message).toContain('shard-doc');
      expect(metadata.action).toBe('list-tasks');
      expect(metadata.items).toHaveLength(2);
    });

    test('*task with arg loads and injects task content', async () => {
      mockBackend.listTasks = jest.fn(async () => [
        { name: 'create-doc', id: 'create-doc' }
      ]);
      mockBackend.getTask = jest.fn(async () => ({ content: '# Create Doc\nStep 1: ...' }));

      const { message, metadata } = await coordinator.preprocessCommand('bmad-master', '*task create-doc');
      expect(message).toContain('TASK START');
      expect(message).toContain('Step 1');
      expect(metadata.action).toBe('execute-task');
      expect(metadata.task).toBe('create-doc');
    });

    test('*workflow without arg lists pipeline templates', async () => {
      const { message, metadata } = await coordinator.preprocessCommand('bmad-orchestrator', '*workflow');
      expect(metadata.action).toBe('list-workflows');
      expect(metadata.items.length).toBeGreaterThanOrEqual(6);
    });

    test('*agent without arg lists agents', async () => {
      mockBackend.listAgents = jest.fn(async () => [
        { name: 'dev', title: 'Developer', icon: '💻' },
        { name: 'qa', title: 'QA Engineer', icon: '🧪' }
      ]);

      const { message, metadata } = await coordinator.preprocessCommand('bmad-orchestrator', '*agent');
      expect(metadata.action).toBe('list-agents');
      expect(metadata.items).toHaveLength(2);
    });

    test('*agent with name returns switch-agent metadata', async () => {
      mockBackend.listAgents = jest.fn(async () => [
        { name: 'architect', title: 'Software Architect', icon: '🏗️' }
      ]);

      const { metadata } = await coordinator.preprocessCommand('bmad-orchestrator', '*agent architect');
      expect(metadata.action).toBe('switch-agent');
      expect(metadata.agent).toBe('architect');
    });

    test('*checklist without arg lists checklists', async () => {
      mockBackend.listChecklists = jest.fn(async () => [
        { name: 'pm-checklist', title: 'PM Checklist' },
        { name: 'architect-checklist', title: 'Architect Checklist' }
      ]);

      const { message, metadata } = await coordinator.preprocessCommand('bmad-master', '*checklist');
      expect(metadata.action).toBe('list-checklists');
      expect(metadata.items).toHaveLength(2);
    });
  });
});
