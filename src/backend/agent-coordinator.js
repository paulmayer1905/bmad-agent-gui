/**
 * Agent Coordinator - Orchestration layer for multi-agent collaboration
 * Handles: delegation, pipeline workflows, and party mode (multi-agent chat)
 */

const crypto = require('crypto');
const EventEmitter = require('events');

class AgentCoordinator extends EventEmitter {
  constructor(options = {}) {
    super();
    this.aiService = options.aiService;
    this.projectContext = options.projectContext;
    this.bmadBackend = options.bmadBackend;

    // Active party sessions
    this.partySessions = new Map();

    // Active pipelines
    this.activePipelines = new Map();
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  PHASE 2 — Delegation (consult another agent)
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Delegate a question from one agent to another.
   * Creates a transient sub-session, asks the question, returns the response.
   * @param {string|null} fromSessionId - The calling session (for context, can be null)
   * @param {string} targetAgentName - Which agent to consult
   * @param {string} question - The question or task to send
   * @param {Object} options - { saveAsArtifact, artifactType }
   */
  async delegateToAgent(fromSessionId, targetAgentName, question, options = {}) {
    const agent = await this.bmadBackend.getAgent(targetAgentName);
    const metadata = await this.bmadBackend.getAgentMetadata(targetAgentName);
    const displayName = metadata.title || metadata.name || targetAgentName;

    // Build context-aware prompt
    const contextSummary = this.projectContext.buildContextForAgent(targetAgentName);

    const delegationPrompt = `Tu es consulté par un autre agent qui a besoin de ton expertise.
${contextSummary}

--- QUESTION ---
${question}
--- FIN DE LA QUESTION ---

Réponds de manière concise et actionnable. Concentre-toi sur ton domaine d'expertise.`;

    // Create transient sub-session
    const subSessionId = `delegation-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

    const systemPrompt = this.aiService.buildSystemPrompt(agent.rawContent, displayName);
    this.aiService.conversations.set(subSessionId, {
      systemPrompt,
      agentName: displayName,
      messages: [],
      createdAt: Date.now(),
      isDelegation: true
    });

    try {
      const result = await this.aiService.sendMessage(subSessionId, delegationPrompt);

      // Optionally store the result in project context
      if (options.saveAsArtifact) {
        await this.projectContext.addArtifact({
          type: options.artifactType || 'document',
          title: `Consultation ${displayName}: ${question.slice(0, 80)}`,
          content: result.content,
          summary: result.content.slice(0, 200),
          agent: displayName,
          tags: ['delegation', targetAgentName]
        });
      }

      return {
        agentName: targetAgentName,
        agentTitle: displayName,
        agentIcon: metadata.icon || '🤖',
        question,
        response: result.content,
        usage: result.usage
      };
    } finally {
      // Clean up transient session
      this.aiService.conversations.delete(subSessionId);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  PHASE 3 — Pipeline Workflow (chain agents sequentially)
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Execute a pipeline of agent steps sequentially.
   * Each step's output feeds into the next step's input.
   * @param {Object} pipeline - { name, steps: [{agent, task, instructions, artifactType, saveArtifact}], initialInput }
   * @param {Object} options - { continueOnError }
   * @returns {Object} Pipeline execution state
   */
  async executePipeline(pipeline, options = {}) {
    const pipelineId = `pipeline-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

    const state = {
      id: pipelineId,
      name: pipeline.name || 'Pipeline personnalisé',
      steps: pipeline.steps.map((s, i) => ({
        ...s,
        index: i,
        status: 'pending',
        result: null,
        error: null,
        startedAt: null,
        completedAt: null
      })),
      status: 'running',
      startedAt: Date.now(),
      completedAt: null,
      currentStep: 0,
      results: []
    };

    this.activePipelines.set(pipelineId, state);
    this.emit('pipeline:start', { pipelineId, name: state.name, totalSteps: state.steps.length });

    try {
      let previousOutput = pipeline.initialInput || '';

      for (let i = 0; i < state.steps.length; i++) {
        const step = state.steps[i];
        state.currentStep = i;
        step.status = 'running';
        step.startedAt = Date.now();

        this.emit('pipeline:step:start', {
          pipelineId, stepIndex: i, agentName: step.agent, task: step.task
        });

        try {
          // Build the step prompt
          const contextSummary = this.projectContext.buildContextForAgent(step.agent);
          const stepPrompt = this._buildStepPrompt(step, previousOutput, contextSummary);

          // Delegate to the agent
          const result = await this.delegateToAgent(null, step.agent, stepPrompt, {
            saveAsArtifact: step.saveArtifact !== false,
            artifactType: step.artifactType || 'document'
          });

          step.status = 'completed';
          step.completedAt = Date.now();
          step.result = result;
          state.results.push(result);
          previousOutput = result.response;

          this.emit('pipeline:step:done', {
            pipelineId, stepIndex: i, agentName: step.agent,
            response: result.response.slice(0, 300),
            usage: result.usage
          });

        } catch (err) {
          step.status = 'failed';
          step.completedAt = Date.now();
          step.error = err.message;

          this.emit('pipeline:step:error', {
            pipelineId, stepIndex: i, agentName: step.agent, error: err.message
          });

          if (!options.continueOnError) {
            state.status = 'failed';
            this.emit('pipeline:error', { pipelineId, stepIndex: i, error: err.message });
            return state;
          }
        }
      }

      state.status = 'completed';
      state.completedAt = Date.now();
      this.emit('pipeline:done', { pipelineId, results: state.results.length });

    } catch (err) {
      state.status = 'failed';
      state.completedAt = Date.now();
      this.emit('pipeline:error', { pipelineId, error: err.message });
    }

    return state;
  }

  _buildStepPrompt(step, previousOutput, contextSummary) {
    let prompt = '';

    if (step.task) {
      prompt += `TÂCHE : ${step.task}\n\n`;
    }
    if (step.instructions) {
      prompt += `INSTRUCTIONS : ${step.instructions}\n\n`;
    }
    if (previousOutput) {
      prompt += `--- RÉSULTAT DE L'ÉTAPE PRÉCÉDENTE ---\n${previousOutput}\n--- FIN ---\n\n`;
    }
    if (contextSummary) {
      prompt += contextSummary;
    }

    prompt += '\n\nProduis un résultat détaillé et structuré pour cette étape.';
    return prompt;
  }

  getPipelineStatus(pipelineId) {
    const state = this.activePipelines.get(pipelineId);
    if (!state) return null;
    return {
      ...state,
      // Sanitize results for IPC transfer (avoid huge payloads)
      steps: state.steps.map(s => ({
        ...s,
        result: s.result ? {
          agentName: s.result.agentName,
          agentTitle: s.result.agentTitle,
          agentIcon: s.result.agentIcon,
          response: s.result.response,
          usage: s.result.usage
        } : null
      }))
    };
  }

  listPipelines() {
    const pipelines = [];
    for (const [id, state] of this.activePipelines) {
      pipelines.push({
        id,
        name: state.name,
        status: state.status,
        currentStep: state.currentStep,
        totalSteps: state.steps.length,
        startedAt: state.startedAt,
        completedAt: state.completedAt
      });
    }
    return pipelines;
  }

  /**
   * Get predefined pipeline templates based on BMAD team definitions.
   */
  getPipelineTemplates() {
    return [
      {
        id: 'analysis-to-architecture',
        name: 'Analyse → Architecture',
        description: 'L\'Analyste étudie le besoin, l\'Architecte conçoit la solution',
        steps: [
          { agent: 'analyst', task: 'Analyse des besoins', instructions: 'Analyse le besoin décrit et produis un document de spécifications.', artifactType: 'analysis', saveArtifact: true },
          { agent: 'architect', task: 'Conception architecture', instructions: 'Conçois l\'architecture technique basée sur l\'analyse précédente.', artifactType: 'architecture', saveArtifact: true }
        ]
      },
      {
        id: 'full-product-design',
        name: 'Conception produit complète',
        description: 'Analyste → PM (PRD) → Architecte → UX',
        steps: [
          { agent: 'analyst', task: 'Étude de marché et besoins', instructions: 'Analyse le marché et les besoins utilisateurs.', artifactType: 'analysis', saveArtifact: true },
          { agent: 'pm', task: 'Rédaction PRD', instructions: 'Rédige un Product Requirements Document basé sur l\'analyse.', artifactType: 'prd', saveArtifact: true },
          { agent: 'architect', task: 'Architecture technique', instructions: 'Définis l\'architecture technique adaptée aux exigences du PRD.', artifactType: 'architecture', saveArtifact: true },
          { agent: 'ux-expert', task: 'Design UX/UI', instructions: 'Propose le design UX en wireframes SVG basé sur le PRD et l\'architecture.', artifactType: 'design', saveArtifact: true }
        ]
      },
      {
        id: 'story-to-implementation',
        name: 'Story → Dev → QA',
        description: 'Le PM écrit la story, le Dev implémente, le QA valide',
        steps: [
          { agent: 'pm', task: 'Rédaction user story', instructions: 'Rédige une user story détaillée avec critères d\'acceptation.', artifactType: 'story', saveArtifact: true },
          { agent: 'dev', task: 'Plan d\'implémentation', instructions: 'Décris le plan d\'implémentation technique avec le code nécessaire.', artifactType: 'code', saveArtifact: true },
          { agent: 'qa', task: 'Plan de test', instructions: 'Rédige le plan de test complet incluant cas limites et scénarios d\'erreur.', artifactType: 'test', saveArtifact: true }
        ]
      },
      {
        id: 'code-review-pipeline',
        name: 'Revue de code',
        description: 'Architecture review → QA review → Recommandations',
        steps: [
          { agent: 'architect', task: 'Revue architecture', instructions: 'Évalue l\'architecture et la conception du code soumis. Identifie les problèmes structurels.', artifactType: 'analysis', saveArtifact: true },
          { agent: 'qa', task: 'Revue qualité', instructions: 'Analyse la qualité du code : tests manquants, bugs potentiels, bonnes pratiques.', artifactType: 'test', saveArtifact: true },
          { agent: 'dev', task: 'Synthèse et corrections', instructions: 'Synthétise les retours d\'architecture et QA. Propose les corrections concrètes.', artifactType: 'code', saveArtifact: true }
        ]
      }
    ];
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  PHASE 4 — Party Mode (multi-agent group chat)
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Start a multi-agent chat session (party mode).
   * @param {string[]} agentNames - List of agent names to include
   * @returns {Object} { partyId, agents, greeting }
   */
  async startParty(agentNames) {
    const partyId = `party-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

    // Load agent metadata for all participants
    const agents = [];
    for (const name of agentNames) {
      const meta = await this.bmadBackend.getAgentMetadata(name);
      const full = await this.bmadBackend.getAgent(name);
      agents.push({
        name,
        title: meta.title || meta.name || name,
        icon: meta.icon || '🤖',
        definition: full.rawContent
      });
    }

    const session = {
      id: partyId,
      agents,
      messages: [],
      createdAt: Date.now(),
      status: 'active'
    };

    // Greeting message
    const greeting = `🎉 **Mode Collaboration activé !**\n\nAgents présents :\n${agents.map(a => `${a.icon} **${a.title}**`).join('\n')}\n\nPosez votre question ou décrivez votre besoin. L'agent le plus pertinent répondra.\nUtilisez @nom pour cibler un agent spécifique (ex: @architect, @qa).`;

    session.messages.push({
      id: `msg-${Date.now()}`,
      role: 'system',
      agent: 'coordinator',
      agentIcon: '🎭',
      agentTitle: 'Coordinateur',
      content: greeting,
      timestamp: Date.now()
    });

    this.partySessions.set(partyId, session);

    return {
      partyId,
      agents: agents.map(a => ({ name: a.name, title: a.title, icon: a.icon })),
      greeting,
      messageCount: 1
    };
  }

  /**
   * Send a message in party mode. The coordinator routes it to the best agent(s).
   * @param {string} partyId - Party session ID
   * @param {string} userMessage - User's message
   * @param {Object} options - { targetAgent } for explicit @mention routing
   */
  async sendPartyMessage(partyId, userMessage, options = {}) {
    const session = this.partySessions.get(partyId);
    if (!session) throw new Error('PARTY_SESSION_NOT_FOUND');

    // Add user message
    session.messages.push({
      id: `msg-${Date.now()}`,
      role: 'user',
      content: userMessage,
      timestamp: Date.now()
    });

    // Determine which agent(s) should respond
    let targetAgents;

    if (options.targetAgent) {
      // User explicitly mentioned an agent
      const found = session.agents.find(a =>
        a.name === options.targetAgent ||
        a.title.toLowerCase().includes(options.targetAgent.toLowerCase())
      );
      if (found) targetAgents = [found];
    }

    if (!targetAgents || targetAgents.length === 0) {
      targetAgents = await this._routeMessage(session, userMessage);
    }

    const responses = [];

    for (const agent of targetAgents) {
      try {
        // Build conversation context for this agent
        const contextSummary = this.projectContext.buildContextForAgent(agent.name);
        const conversationContext = this._buildPartyContext(session, agent.name);

        const prompt = `${conversationContext}\n\n${contextSummary}\n\nMessage le plus récent de l'utilisateur : ${userMessage}\n\nRéponds en tant que ${agent.title}. Sois concis et pertinent. Concentre-toi sur ton domaine d'expertise.`;

        const result = await this.delegateToAgent(null, agent.name, prompt);

        const msgEntry = {
          id: `msg-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
          role: 'assistant',
          agent: agent.name,
          agentIcon: agent.icon,
          agentTitle: agent.title,
          content: result.response,
          usage: result.usage,
          timestamp: Date.now()
        };

        session.messages.push(msgEntry);
        responses.push(msgEntry);

      } catch (err) {
        const errorMsg = {
          id: `msg-${Date.now()}-err`,
          role: 'assistant',
          agent: agent.name,
          agentIcon: agent.icon,
          agentTitle: agent.title,
          content: `⚠️ Erreur : ${err.message}`,
          isError: true,
          timestamp: Date.now()
        };
        session.messages.push(errorMsg);
        responses.push(errorMsg);
      }
    }

    return { responses, messageCount: session.messages.length };
  }

  /**
   * Route a message to the most relevant agent(s) using LLM-based routing.
   */
  async _routeMessage(session, message) {
    // Fast rule-based routing: check for @mentions
    const mentionMatch = message.match(/@(\w[\w-]*)/);
    if (mentionMatch) {
      const mentioned = mentionMatch[1].toLowerCase();
      const found = session.agents.find(a =>
        a.name.toLowerCase().includes(mentioned) ||
        a.title.toLowerCase().includes(mentioned)
      );
      if (found) return [found];
    }

    // LLM-based routing
    const agentList = session.agents.map(a => `- ${a.name}: ${a.title}`).join('\n');
    const routingPrompt = `Tu es un coordinateur d'équipe. Voici les agents disponibles :
${agentList}

Message de l'utilisateur : "${message}"

Réponds UNIQUEMENT avec le nom (name) de l'agent le plus pertinent. Si 2 agents sont nécessaires, sépare-les par une virgule. Maximum 2 agents. FORMAT : uniquement les noms, rien d'autre.`;

    try {
      const subSessionId = `routing-${Date.now()}`;
      this.aiService.conversations.set(subSessionId, {
        systemPrompt: 'Tu es un routeur de messages. Réponds uniquement avec le nom de l\'agent approprié, rien d\'autre.',
        agentName: 'Router',
        messages: [],
        createdAt: Date.now()
      });

      const result = await this.aiService.sendMessage(subSessionId, routingPrompt);
      this.aiService.conversations.delete(subSessionId);

      // Parse response to find agent names
      const responseText = result.content.toLowerCase().trim();
      const matchedAgents = session.agents.filter(a =>
        responseText.includes(a.name.toLowerCase())
      );

      if (matchedAgents.length > 0) return matchedAgents.slice(0, 2);
    } catch {
      // Fallback on error
    }

    // Fallback: first agent in list
    return [session.agents[0]];
  }

  _buildPartyContext(session, currentAgentName) {
    const recent = session.messages.slice(-20);
    if (recent.length === 0) return '';

    const lines = ['--- CONVERSATION EN COURS (Mode Collaboration) ---'];
    for (const msg of recent) {
      if (msg.role === 'user') {
        lines.push(`[Utilisateur] : ${msg.content}`);
      } else if (msg.role === 'assistant') {
        lines.push(`[${msg.agentTitle}] : ${msg.content}`);
      } else if (msg.role === 'system') {
        // skip system messages
      }
    }
    lines.push('--- FIN CONVERSATION ---');
    return lines.join('\n');
  }

  getPartySession(partyId) {
    const session = this.partySessions.get(partyId);
    if (!session) return null;
    return {
      id: session.id,
      agents: session.agents.map(a => ({ name: a.name, title: a.title, icon: a.icon })),
      messages: session.messages,
      messageCount: session.messages.length,
      status: session.status,
      createdAt: session.createdAt
    };
  }

  endParty(partyId) {
    this.partySessions.delete(partyId);
    return { success: true };
  }

  listPartySessions() {
    const sessions = [];
    for (const [id, session] of this.partySessions) {
      sessions.push({
        id,
        agents: session.agents.map(a => ({ name: a.name, title: a.title, icon: a.icon })),
        messageCount: session.messages.length,
        status: session.status,
        createdAt: session.createdAt
      });
    }
    return sessions;
  }
}

module.exports = AgentCoordinator;
