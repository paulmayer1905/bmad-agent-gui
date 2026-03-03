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
  WORKSPACE: 'workspace',
  CONTEXT: 'context',
};

// ─── FileTreeView component ───────────────────────────────────────────
function FileTreeView({ items, onSelect, selectedPath, depth = 0 }) {
  const [expanded, setExpanded] = React.useState({});

  const toggle = (path) => setExpanded(prev => ({ ...prev, [path]: !prev[path] }));

  return (
    <div className="file-tree-level">
      {items.map(item => (
        <div key={item.path}>
          <div
            className={`file-tree-node ${selectedPath === item.path ? 'file-tree-selected' : ''}`}
            style={{ paddingLeft: `${depth * 16 + 8}px` }}
            onClick={() => {
              if (item.type === 'dir') toggle(item.path);
              else onSelect(item);
            }}
          >
            <span className="file-tree-icon">
              {item.type === 'dir' ? (expanded[item.path] ? '📂' : '📁') : '📄'}
            </span>
            <span className="file-tree-name">{item.name}</span>
          </div>
          {item.type === 'dir' && expanded[item.path] && item.children && (
            <FileTreeView items={item.children} onSelect={onSelect} selectedPath={selectedPath} depth={depth + 1} />
          )}
        </div>
      ))}
    </div>
  );
}

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

  // ─── State: workspace ──────────────────────────────────────────────
  const [workspaces, setWorkspaces] = useState([]);
  const [activeWorkspace, setActiveWorkspace] = useState(null);
  const [fileTree, setFileTree] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileContent, setFileContent] = useState('');
  const [commandOutput, setCommandOutput] = useState(null);
  const [commandRunning, setCommandRunning] = useState(false);
  const [wsCommands, setWsCommands] = useState({ install: null, dev: null, build: null, start: null });

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
    if (activeTab === TABS.WORKSPACE) {
      refreshWorkspaces();
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
    const cleanupFiles = api.workspace.onFilesWritten((data) => {
      setPipelineSteps(prev => prev.map((s, i) =>
        i === data.stepIndex ? { ...s, filesWritten: data.files.length } : s
      ));
    });
    return () => {
      if (cleanupStart) cleanupStart();
      if (cleanupDone) cleanupDone();
      if (cleanupError) cleanupError();
      if (cleanupFiles) cleanupFiles();
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
      error: null,
      filesWritten: 0
    })));

    try {
      // If template requires workspace, create one
      let workspaceId = null;
      if (template.requiresWorkspace || template.steps.some(s => s.extractCode)) {
        const wsName = pipelineInput.trim().slice(0, 40).replace(/[^a-zA-Z0-9 ]/g, '').trim().replace(/\s+/g, '-') || 'new-project';
        const ws = await api.workspace.create({ name: wsName, description: pipelineInput.trim() });
        workspaceId = ws.id;
        setActiveWorkspace(ws);
      }

      const pipeline = {
        name: template.name,
        steps: template.steps,
        initialInput: pipelineInput.trim(),
        workspaceId
      };
      const result = await api.coord.executePipeline(pipeline, { continueOnError: true });

      // Update final statuses
      setPipelineSteps(result.steps.map(s => ({
        ...s,
        response: s.result?.response?.slice(0, 500) || null
      })));
      setActivePipeline(prev => ({ ...prev, status: result.status, workspaceId }));

      // Auto-detect commands if workspace was created
      if (workspaceId) {
        try {
          const cmds = await api.workspace.detectCommands(workspaceId);
          setWsCommands(cmds);
          const ws = await api.workspace.get(workspaceId);
          setActiveWorkspace(ws);
        } catch { /* ignore */ }
      }
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

  // ─── Workspace handlers ──────────────────────────────────────────────

  const refreshWorkspaces = async () => {
    try {
      const list = await api.workspace.list();
      setWorkspaces(list);
    } catch (err) {
      console.error('Workspace refresh error:', err);
    }
  };

  const handleSelectWorkspace = async (ws) => {
    try {
      const full = await api.workspace.get(ws.id);
      setActiveWorkspace(full);
      const tree = await api.workspace.fileTree(ws.id);
      setFileTree(tree);
      setSelectedFile(null);
      setFileContent('');
      const cmds = await api.workspace.detectCommands(ws.id);
      setWsCommands(cmds);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleSelectFile = async (file) => {
    if (file.type === 'dir') return;
    try {
      const result = await api.workspace.readFile(activeWorkspace.id, file.path);
      setSelectedFile(file);
      setFileContent(result.content);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleRunCommand = async (command) => {
    if (!activeWorkspace || commandRunning) return;
    setCommandRunning(true);
    setCommandOutput(null);
    try {
      const result = await api.workspace.runCommand(activeWorkspace.id, command);
      setCommandOutput(result);
      // Refresh file tree after commands (npm install may create files)
      const tree = await api.workspace.fileTree(activeWorkspace.id);
      setFileTree(tree);
      // Re-detect commands
      const cmds = await api.workspace.detectCommands(activeWorkspace.id);
      setWsCommands(cmds);
    } catch (err) {
      setCommandOutput({ stdout: '', stderr: err.message, exitCode: 1 });
    } finally {
      setCommandRunning(false);
    }
  };

  const handleOpenFolder = async () => {
    if (!activeWorkspace) return;
    await api.workspace.openFolder(activeWorkspace.id);
  };

  const handleCreateShortcut = async () => {
    if (!activeWorkspace) return;
    try {
      // Determine shortcut type based on workspace
      const options = {};
      const cmds = wsCommands || {};

      // If there's a dev/start command → likely a web app, detect URL
      if (cmds.dev || cmds.start) {
        const cmd = cmds.dev || cmds.start;
        const isWeb = cmd.includes('npm') || cmd.includes('python') || cmd.includes('php') ||
                      cmd.includes('flask') || cmd.includes('django') || cmd.includes('serve');
        if (isWeb && activeWorkspace.type !== 'desktop') {
          // Guess the URL from common frameworks
          let port = '3000';
          if (cmd.includes('flask') || cmd.includes('django')) port = '8000';
          else if (cmd.includes('php')) port = '8080';
          else if (cmd.includes('vite') || cmd.includes('nuxt')) port = '5173';
          options.url = `http://localhost:${port}`;
        }
      }

      const result = await api.workspace.createShortcut(activeWorkspace.id, options);
      if (result.success) {
        const typeLabel = result.type === 'url' ? 'raccourci web' : result.type === 'lnk' ? 'raccourci' : 'lanceur';
        setCommandOutput({ stdout: `✅ ${typeLabel} créé sur le bureau:\n${result.path}`, stderr: '', exitCode: 0 });
      } else {
        setCommandOutput({ stdout: '', stderr: result.error || 'Échec de la création du raccourci', exitCode: 1 });
      }
    } catch (err) {
      setCommandOutput({ stdout: '', stderr: err.message, exitCode: 1 });
    }
  };

  const handleDeleteWorkspace = async (id) => {
    await api.workspace.delete(id);
    if (activeWorkspace?.id === id) {
      setActiveWorkspace(null);
      setFileTree([]);
      setSelectedFile(null);
    }
    refreshWorkspaces();
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
          className={`party-tab ${activeTab === TABS.WORKSPACE ? 'active' : ''}`}
          onClick={() => setActiveTab(TABS.WORKSPACE)}
        >
          📁 Projets
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
                      {step.filesWritten > 0 && (
                        <div className="pipeline-step-files">
                          📁 {step.filesWritten} fichier{step.filesWritten > 1 ? 's' : ''} généré{step.filesWritten > 1 ? 's' : ''} dans le workspace
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
                    Pipeline terminé — les résultats sont sauvegardés
                    {activePipeline.workspaceId && ' et les fichiers sont dans le workspace'}
                  </p>
                  <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                    {activePipeline.workspaceId && (
                      <button className="btn btn-primary" onClick={() => {
                        setActiveTab(TABS.WORKSPACE);
                        if (activeWorkspace) handleSelectWorkspace(activeWorkspace);
                      }}>
                        📁 Voir le projet
                      </button>
                    )}
                    <button className="btn btn-ghost" onClick={() => { setActiveTab(TABS.CONTEXT); refreshContext(); }}>
                      📦 Voir le contexte
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ═══ TAB: Workspace ═══ */}
      {activeTab === TABS.WORKSPACE && (
        <div className="party-content" style={{ display: 'flex', height: '100%' }}>
          {/* Sidebar: workspace list */}
          <div className="ws-sidebar">
            <div className="ws-sidebar-header">
              <h3>📁 Projets</h3>
            </div>
            {workspaces.length === 0 ? (
              <div className="ws-empty-hint">
                Lancez un pipeline avec génération de code pour créer un projet.
              </div>
            ) : (
              <div className="ws-list">
                {workspaces.map(ws => (
                  <div
                    key={ws.id}
                    className={`ws-item ${activeWorkspace?.id === ws.id ? 'ws-item-active' : ''}`}
                    onClick={() => handleSelectWorkspace(ws)}
                  >
                    <div className="ws-item-name">📂 {ws.name}</div>
                    <div className="ws-item-meta">
                      {ws.fileCount} fichier{ws.fileCount !== 1 ? 's' : ''} · {new Date(ws.updatedAt).toLocaleDateString()}
                    </div>
                    <button className="btn btn-ghost btn-xs ws-delete-btn" onClick={(e) => { e.stopPropagation(); handleDeleteWorkspace(ws.id); }}>🗑️</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Main area */}
          <div className="ws-main">
            {!activeWorkspace ? (
              <div className="empty-state">
                <div className="empty-icon">📁</div>
                <h3>Aucun projet sélectionné</h3>
                <p>Sélectionnez un projet dans la liste ou lancez le pipeline "🚀 Développement complet" pour en créer un.</p>
              </div>
            ) : (
              <>
                {/* Header */}
                <div className="ws-header">
                  <div>
                    <h2 style={{ margin: 0 }}>{activeWorkspace.name}</h2>
                    <div className="ws-path">{activeWorkspace.path}</div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button className="btn btn-ghost btn-sm" onClick={handleOpenFolder}>📂 Ouvrir</button>
                    <button className="btn btn-sm ws-shortcut-btn" onClick={handleCreateShortcut}>🖥️ Raccourci bureau</button>
                  </div>
                </div>

                {/* Commands bar */}
                <div className="ws-commands">
                  {wsCommands.install && (
                    <button
                      className="btn btn-sm ws-cmd-btn"
                      disabled={commandRunning}
                      onClick={() => handleRunCommand(wsCommands.install)}
                    >
                      📦 {wsCommands.install}
                    </button>
                  )}
                  {wsCommands.dev && (
                    <button
                      className="btn btn-sm ws-cmd-btn"
                      disabled={commandRunning}
                      onClick={() => handleRunCommand(wsCommands.dev)}
                    >
                      ▶ {wsCommands.dev}
                    </button>
                  )}
                  {wsCommands.build && (
                    <button
                      className="btn btn-sm ws-cmd-btn"
                      disabled={commandRunning}
                      onClick={() => handleRunCommand(wsCommands.build)}
                    >
                      🔨 {wsCommands.build}
                    </button>
                  )}
                  {wsCommands.start && wsCommands.start !== wsCommands.dev && (
                    <button
                      className="btn btn-sm ws-cmd-btn"
                      disabled={commandRunning}
                      onClick={() => handleRunCommand(wsCommands.start)}
                    >
                      🚀 {wsCommands.start}
                    </button>
                  )}
                  {commandRunning && <span className="ws-cmd-running">⏳ Exécution en cours...</span>}
                </div>

                {/* Command output */}
                {commandOutput && (
                  <div className={`ws-command-output ${commandOutput.exitCode === 0 ? 'ws-cmd-success' : 'ws-cmd-error'}`}>
                    <div className="ws-cmd-header">
                      {commandOutput.exitCode === 0 ? '✅ Succès' : `❌ Erreur (code ${commandOutput.exitCode})`}
                      <button className="btn btn-ghost btn-xs" onClick={() => setCommandOutput(null)}>✕</button>
                    </div>
                    {commandOutput.stdout && <pre className="ws-cmd-output">{commandOutput.stdout.slice(-2000)}</pre>}
                    {commandOutput.stderr && <pre className="ws-cmd-output ws-cmd-stderr">{commandOutput.stderr.slice(-1000)}</pre>}
                  </div>
                )}

                {/* File explorer + viewer */}
                <div className="ws-content">
                  {/* File tree */}
                  <div className="ws-file-tree">
                    <div className="ws-tree-header">Fichiers ({activeWorkspace.files?.length || 0})</div>
                    {fileTree.length === 0 ? (
                      <div className="ws-empty-hint">Aucun fichier</div>
                    ) : (
                      <FileTreeView items={fileTree} onSelect={handleSelectFile} selectedPath={selectedFile?.path} />
                    )}
                  </div>

                  {/* File viewer */}
                  <div className="ws-file-viewer">
                    {selectedFile ? (
                      <>
                        <div className="ws-viewer-header">
                          <span className="ws-viewer-filename">{selectedFile.path}</span>
                          <span className="ws-viewer-size">{(selectedFile.size / 1024).toFixed(1)} KB</span>
                        </div>
                        <pre className="ws-viewer-code"><code>{fileContent}</code></pre>
                      </>
                    ) : (
                      <div className="ws-viewer-empty">Sélectionnez un fichier pour voir son contenu</div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
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
