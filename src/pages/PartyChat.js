import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';

// ─── Agent color palette ──────────────────────────────────────────────────
const AGENT_COLORS = {
  'bmad-master': '#a855f7',
  'bmad-orchestrator': '#8b5cf6',
  'pm': '#22c55e',
  'architect': '#f97316',
  'dev': '#3b82f6',
  'qa': '#ef4444',
  'ux-expert': '#ec4899',
  'sm': '#14b8a6',
  'analyst': '#6366f1',
  'po': '#eab308',
};

function getAgentColor(name) {
  return AGENT_COLORS[name] || '#7c3aed';
}

// ─── Tabs ─────────────────────────────────────────────────────────────────
const TABS = {
  PARTY: 'party',
  PIPELINES: 'pipelines',
  CONTEXT: 'context',
};

export default function PartyChat() {
  const navigate = useNavigate();

  // ─── State: tabs ─────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState(TABS.PARTY);

  // ─── State: party mode ───────────────────────────────────────────────
  const [agents, setAgents] = useState([]);
  const [selectedAgents, setSelectedAgents] = useState([]);
  const [partyId, setPartyId] = useState(null);
  const [partyAgents, setPartyAgents] = useState([]);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  // ─── State: pipelines ────────────────────────────────────────────────
  const [pipelineTemplates, setPipelineTemplates] = useState([]);
  const [activePipeline, setActivePipeline] = useState(null);
  const [pipelineInput, setPipelineInput] = useState('');
  const [pipelineRunning, setPipelineRunning] = useState(false);
  const [pipelineSteps, setPipelineSteps] = useState([]);

  // ─── State: context ──────────────────────────────────────────────────
  const [contextStats, setContextStats] = useState(null);
  const [artifacts, setArtifacts] = useState([]);
  const [decisions, setDecisions] = useState([]);
  const [expandedArtifact, setExpandedArtifact] = useState(null);

  // ─── Load agents + templates ─────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      try {
        const [agentList, templates] = await Promise.all([
          api.agents.list(),
          api.coord.pipelineTemplates(),
        ]);
        setAgents(agentList);
        setPipelineTemplates(templates);
      } catch (err) {
        console.error('Load error:', err);
      }
    };
    load();
  }, []);

  // Refresh context when tab changes to context
  useEffect(() => {
    if (activeTab === TABS.CONTEXT) {
      refreshContext();
    }
  }, [activeTab]);

  // Auto-scroll in party chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Pipeline event listeners
  useEffect(() => {
    const cleanupStart = api.coord.onPipelineStepStart((data) => {
      setPipelineSteps(prev => prev.map((s, i) =>
        i === data.stepIndex ? { ...s, status: 'running' } : s
      ));
    });
    const cleanupDone = api.coord.onPipelineStepDone((data) => {
      setPipelineSteps(prev => prev.map((s, i) =>
        i === data.stepIndex ? { ...s, status: 'completed', response: data.response, usage: data.usage } : s
      ));
    });
    const cleanupError = api.coord.onPipelineStepError((data) => {
      setPipelineSteps(prev => prev.map((s, i) =>
        i === data.stepIndex ? { ...s, status: 'failed', error: data.error } : s
      ));
    });
    return () => {
      if (cleanupStart) cleanupStart();
      if (cleanupDone) cleanupDone();
      if (cleanupError) cleanupError();
    };
  }, []);

  // ─── Party mode handlers ─────────────────────────────────────────────

  const toggleAgentSelection = (agentName) => {
    setSelectedAgents(prev =>
      prev.includes(agentName)
        ? prev.filter(n => n !== agentName)
        : [...prev, agentName]
    );
  };

  const handleStartParty = async () => {
    if (selectedAgents.length < 2) {
      setError('Sélectionnez au moins 2 agents');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const result = await api.coord.startParty(selectedAgents);
      setPartyId(result.partyId);
      setPartyAgents(result.agents);
      setMessages([{
        id: 'greeting',
        role: 'system',
        agent: 'coordinator',
        agentIcon: '🎭',
        agentTitle: 'Coordinateur',
        content: result.greeting,
        timestamp: Date.now()
      }]);
      setTimeout(() => textareaRef.current?.focus(), 100);
    } catch (err) {
      setError(err.message || 'Erreur lors du démarrage');
    } finally {
      setLoading(false);
    }
  };

  const handleEndParty = () => {
    if (partyId) {
      api.coord.endParty(partyId);
    }
    setPartyId(null);
    setPartyAgents([]);
    setMessages([]);
    setSelectedAgents([]);
  };

  const handleSendPartyMessage = async () => {
    const msg = input.trim();
    if (!msg || loading || !partyId) return;

    setInput('');
    setError(null);

    // Add user message immediately
    setMessages(prev => [...prev, {
      id: `user-${Date.now()}`,
      role: 'user',
      content: msg,
      timestamp: Date.now()
    }]);

    setLoading(true);

    try {
      // Check for @mention
      const mentionMatch = msg.match(/@(\w[\w-]*)/);
      const options = mentionMatch ? { targetAgent: mentionMatch[1] } : {};

      const result = await api.coord.sendPartyMessage(partyId, msg, options);

      // Add agent responses
      setMessages(prev => [...prev, ...result.responses]);
    } catch (err) {
      setError(err.message || 'Erreur d\'envoi');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendPartyMessage();
    }
  };

  // ─── Pipeline handlers ───────────────────────────────────────────────

  const handleStartPipeline = async (template) => {
    if (!pipelineInput.trim()) {
      setError('Décrivez votre besoin pour lancer le pipeline');
      return;
    }
    setError(null);
    setPipelineRunning(true);
    setActivePipeline(template);
    setPipelineSteps(template.steps.map((s, i) => ({
      ...s,
      index: i,
      status: 'pending',
      response: null,
      error: null
    })));

    try {
      const pipeline = {
        name: template.name,
        steps: template.steps,
        initialInput: pipelineInput.trim()
      };
      const result = await api.coord.executePipeline(pipeline, { continueOnError: true });

      // Update final statuses
      setPipelineSteps(result.steps.map(s => ({
        ...s,
        response: s.result?.response?.slice(0, 500) || null
      })));
      setActivePipeline(prev => ({ ...prev, status: result.status }));
    } catch (err) {
      setError(err.message || 'Erreur pipeline');
    } finally {
      setPipelineRunning(false);
    }
  };

  const handleResetPipeline = () => {
    setActivePipeline(null);
    setPipelineSteps([]);
    setPipelineInput('');
  };

  // ─── Context handlers ────────────────────────────────────────────────

  const refreshContext = async () => {
    try {
      const [stats, artList, decList] = await Promise.all([
        api.context.stats(),
        api.context.listArtifacts(),
        api.context.listDecisions(),
      ]);
      setContextStats(stats);
      setArtifacts(artList);
      setDecisions(decList);
    } catch (err) {
      console.error('Context refresh error:', err);
    }
  };

  const handleClearContext = async () => {
    await api.context.clear();
    refreshContext();
  };

  const handleRemoveArtifact = async (id) => {
    await api.context.removeArtifact(id);
    refreshContext();
  };

  // ─── Render: Tab Header ──────────────────────────────────────────────

  return (
    <div className="party-container">
      <div className="party-tabs">
        <button
          className={`party-tab ${activeTab === TABS.PARTY ? 'active' : ''}`}
          onClick={() => setActiveTab(TABS.PARTY)}
        >
          🎉 Collaboration
        </button>
        <button
          className={`party-tab ${activeTab === TABS.PIPELINES ? 'active' : ''}`}
          onClick={() => setActiveTab(TABS.PIPELINES)}
        >
          🔗 Pipelines
        </button>
        <button
          className={`party-tab ${activeTab === TABS.CONTEXT ? 'active' : ''}`}
          onClick={() => setActiveTab(TABS.CONTEXT)}
        >
          📦 Contexte partagé
        </button>
      </div>

      {error && <div className="chat-error" style={{ margin: '8px 16px' }}>⚠️ {error}</div>}

      {/* ═══ TAB: Party Mode ═══ */}
      {activeTab === TABS.PARTY && (
        <div className="party-content">
          {!partyId ? (
            /* Agent selection */
            <div className="party-setup">
              <div className="page-header" style={{ padding: '24px 24px 0' }}>
                <h2>🎉 Mode Collaboration</h2>
                <p className="page-subtitle">Sélectionnez les agents qui collaboreront ensemble</p>
              </div>

              <div className="party-agent-grid">
                {agents.map(agent => (
                  <div
                    key={agent.name}
                    className={`party-agent-card ${selectedAgents.includes(agent.name) ? 'selected' : ''}`}
                    onClick={() => toggleAgentSelection(agent.name)}
                    style={selectedAgents.includes(agent.name) ? { borderColor: getAgentColor(agent.name), boxShadow: `0 0 12px ${getAgentColor(agent.name)}33` } : {}}
                  >
                    <span className="party-agent-icon">{agent.icon || '🤖'}</span>
                    <div>
                      <div className="party-agent-name">{agent.title || agent.name}</div>
                      <div className="party-agent-role">{agent.whenToUse || ''}</div>
                    </div>
                    {selectedAgents.includes(agent.name) && <span className="party-agent-check">✓</span>}
                  </div>
                ))}
              </div>

              <div className="party-start-bar">
                <span className="party-count">{selectedAgents.length} agent{selectedAgents.length !== 1 ? 's' : ''} sélectionné{selectedAgents.length !== 1 ? 's' : ''}</span>
                <button
                  className="btn btn-primary"
                  disabled={selectedAgents.length < 2 || loading}
                  onClick={handleStartParty}
                >
                  {loading ? '⏳ Démarrage...' : '🚀 Lancer la collaboration'}
                </button>
              </div>
            </div>
          ) : (
            /* Active party chat */
            <div className="party-chat-area">
              {/* Party header */}
              <div className="party-header">
                <div className="party-header-agents">
                  {partyAgents.map(a => (
                    <span key={a.name} className="party-header-agent" title={a.title}
                      style={{ borderColor: getAgentColor(a.name) }}>
                      {a.icon}
                    </span>
                  ))}
                  <span className="party-header-title">
                    {partyAgents.length} agents en collaboration
                  </span>
                </div>
                <button className="btn btn-ghost btn-sm" onClick={handleEndParty}>
                  ✕ Terminer
                </button>
              </div>

              {/* Messages */}
              <div className="chat-messages">
                {messages.map(msg => (
                  <div key={msg.id} className={`chat-message ${msg.role === 'user' ? 'chat-message-user' : 'chat-message-assistant'} ${msg.role === 'system' ? 'chat-message-system' : ''}`}>
                    {msg.role !== 'user' && (
                      <div className="chat-message-avatar" style={msg.agent !== 'coordinator' ? { borderColor: getAgentColor(msg.agent) } : {}}>
                        {msg.agentIcon || '🤖'}
                      </div>
                    )}
                    <div className="chat-message-content">
                      {msg.role === 'assistant' && (
                        <div className="party-msg-agent" style={{ color: getAgentColor(msg.agent) }}>
                          {msg.agentTitle}
                        </div>
                      )}
                      <div className={`chat-message-text ${msg.isError ? 'party-msg-error' : ''}`}>
                        {msg.content.split('\n').map((line, j) => (
                          <React.Fragment key={j}>
                            {line}
                            {j < msg.content.split('\n').length - 1 && <br />}
                          </React.Fragment>
                        ))}
                      </div>
                      {msg.usage && msg.usage.input_tokens > 0 && (
                        <div className="chat-message-meta">
                          {msg.usage.input_tokens + msg.usage.output_tokens} tokens
                        </div>
                      )}
                    </div>
                    {msg.role === 'user' && (
                      <div className="chat-message-avatar" style={{ background: 'var(--accent-purple)', borderColor: 'var(--accent-purple)' }}>👤</div>
                    )}
                  </div>
                ))}
                {loading && (
                  <div className="chat-message chat-message-assistant">
                    <div className="chat-message-avatar">🎭</div>
                    <div className="chat-message-content">
                      <div className="chat-typing-indicator"><span></span><span></span><span></span></div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div className="chat-input-area">
                <div className="chat-input-wrapper">
                  <textarea
                    ref={textareaRef}
                    className="chat-textarea"
                    placeholder="Message... (utilisez @agent pour cibler, ex: @architect)"
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    rows={1}
                    disabled={loading}
                  />
                  <button
                    className="chat-send-btn"
                    disabled={!input.trim() || loading}
                    onClick={handleSendPartyMessage}
                    title="Envoyer"
                  >
                    ➤
                  </button>
                </div>
                <div className="chat-input-hint">
                  Entrée pour envoyer · Shift+Entrée pour un saut de ligne · @nom pour cibler un agent
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══ TAB: Pipelines ═══ */}
      {activeTab === TABS.PIPELINES && (
        <div className="party-content" style={{ padding: '24px', overflowY: 'auto' }}>
          {!activePipeline ? (
            <>
              <div className="page-header">
                <h2>🔗 Pipelines d'agents</h2>
                <p className="page-subtitle">Chaînez automatiquement plusieurs agents sur une même tâche</p>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <textarea
                  className="chat-textarea"
                  style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px', minHeight: '80px' }}
                  placeholder="Décrivez votre besoin ou collez du contenu à traiter par le pipeline..."
                  value={pipelineInput}
                  onChange={e => setPipelineInput(e.target.value)}
                />
              </div>

              <div className="pipeline-grid">
                {pipelineTemplates.map(t => (
                  <div key={t.id} className="pipeline-card">
                    <div className="pipeline-card-header">
                      <h3>{t.name}</h3>
                      <p>{t.description}</p>
                    </div>
                    <div className="pipeline-card-steps">
                      {t.steps.map((s, i) => {
                        const agentMeta = agents.find(a => a.name === s.agent);
                        return (
                          <React.Fragment key={i}>
                            <span className="pipeline-step-badge" style={{ borderColor: getAgentColor(s.agent) }}>
                              {agentMeta?.icon || '🤖'} {agentMeta?.title || s.agent}
                            </span>
                            {i < t.steps.length - 1 && <span className="pipeline-arrow">→</span>}
                          </React.Fragment>
                        );
                      })}
                    </div>
                    <button
                      className="btn btn-primary btn-sm"
                      disabled={!pipelineInput.trim() || pipelineRunning}
                      onClick={() => handleStartPipeline(t)}
                    >
                      ▶ Exécuter
                    </button>
                  </div>
                ))}
              </div>
            </>
          ) : (
            /* Pipeline execution view */
            <div>
              <div className="pipeline-exec-header">
                <h2>🔗 {activePipeline.name}</h2>
                <button className="btn btn-ghost btn-sm" onClick={handleResetPipeline}>
                  ← Retour
                </button>
              </div>

              <div className="pipeline-exec-steps">
                {pipelineSteps.map((step, i) => {
                  const agentMeta = agents.find(a => a.name === step.agent);
                  return (
                    <div key={i} className={`pipeline-exec-step pipeline-step-${step.status}`}>
                      <div className="pipeline-exec-step-header">
                        <span className="pipeline-step-num">{i + 1}</span>
                        <span className="pipeline-step-icon" style={{ borderColor: getAgentColor(step.agent) }}>
                          {agentMeta?.icon || '🤖'}
                        </span>
                        <div>
                          <strong>{agentMeta?.title || step.agent}</strong>
                          <div className="pipeline-step-task">{step.task}</div>
                        </div>
                        <span className={`pipeline-step-status status-${step.status}`}>
                          {step.status === 'pending' ? '⏳ En attente' :
                           step.status === 'running' ? '🔄 En cours...' :
                           step.status === 'completed' ? '✅ Terminé' :
                           '❌ Échoué'}
                        </span>
                      </div>
                      {step.response && (
                        <div className="pipeline-step-result">
                          {step.response}
                          {step.response.length >= 500 && '...'}
                        </div>
                      )}
                      {step.error && <div className="pipeline-step-error">❌ {step.error}</div>}
                    </div>
                  );
                })}
              </div>

              {pipelineSteps.every(s => s.status === 'completed' || s.status === 'failed') && (
                <div style={{ marginTop: '16px', textAlign: 'center' }}>
                  <p style={{ color: 'var(--text-secondary)', marginBottom: '12px' }}>
                    Pipeline terminé — les résultats sont sauvegardés dans le contexte partagé
                  </p>
                  <button className="btn btn-primary" onClick={() => { setActiveTab(TABS.CONTEXT); refreshContext(); }}>
                    📦 Voir le contexte partagé
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ═══ TAB: Context ═══ */}
      {activeTab === TABS.CONTEXT && (
        <div className="party-content" style={{ padding: '24px', overflowY: 'auto' }}>
          <div className="page-header">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2>📦 Contexte partagé</h2>
                <p className="page-subtitle">
                  Mémoire commune accessible à tous les agents
                </p>
              </div>
              {contextStats && contextStats.totalArtifacts > 0 && (
                <button className="btn btn-ghost btn-sm" onClick={handleClearContext}>
                  🗑️ Tout effacer
                </button>
              )}
            </div>
          </div>

          {/* Stats */}
          {contextStats && (
            <div className="context-stats">
              <div className="stat-card-mini">
                <div className="stat-mini-value">{contextStats.totalArtifacts}</div>
                <div className="stat-mini-label">Artefacts</div>
              </div>
              <div className="stat-card-mini">
                <div className="stat-mini-value">{contextStats.totalDecisions}</div>
                <div className="stat-mini-label">Décisions</div>
              </div>
              {Object.entries(contextStats.byType || {}).map(([type, count]) => (
                <div className="stat-card-mini" key={type}>
                  <div className="stat-mini-value">{count}</div>
                  <div className="stat-mini-label">{type}</div>
                </div>
              ))}
            </div>
          )}

          {/* Artifacts list */}
          {artifacts.length > 0 ? (
            <div className="context-list">
              <h3 style={{ color: 'var(--text-primary)', marginBottom: '12px' }}>📦 Artefacts</h3>
              {artifacts.map(art => (
                <div key={art.id} className="context-item">
                  <div className="context-item-header" onClick={() => setExpandedArtifact(expandedArtifact === art.id ? null : art.id)}>
                    <span className="context-item-type">{art.type}</span>
                    <strong>{art.title}</strong>
                    <span className="context-item-agent" style={{ color: getAgentColor(art.agent.toLowerCase?.() || '') }}>
                      par {art.agent}
                    </span>
                    <span className="context-item-date">
                      {new Date(art.updatedAt).toLocaleString()}
                    </span>
                    <button className="btn btn-ghost btn-xs" onClick={(e) => { e.stopPropagation(); handleRemoveArtifact(art.id); }}>🗑️</button>
                  </div>
                  {expandedArtifact === art.id && (
                    <div className="context-item-content">
                      {art.content}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state" style={{ marginTop: '32px' }}>
              <div className="empty-icon">📦</div>
              <h3>Aucun artefact</h3>
              <p>Les artefacts apparaîtront ici quand les agents produiront du contenu via les pipelines ou la collaboration.</p>
            </div>
          )}

          {/* Decisions list */}
          {decisions.length > 0 && (
            <div className="context-list" style={{ marginTop: '24px' }}>
              <h3 style={{ color: 'var(--text-primary)', marginBottom: '12px' }}>📋 Décisions</h3>
              {decisions.map(dec => (
                <div key={dec.id} className="context-item">
                  <div className="context-item-header">
                    <span className={`context-impact context-impact-${dec.impact}`}>{dec.impact}</span>
                    <strong>{dec.title}</strong>
                    <span className="context-item-agent">{dec.agent}</span>
                    <span className="context-item-date">{new Date(dec.createdAt).toLocaleString()}</span>
                  </div>
                  <div className="context-item-desc">{dec.description}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
