import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import api from '../api';

export default function AgentChat() {
  const { agentName } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [agents, setAgents] = useState([]);
  const [selectedAgent, setSelectedAgent] = useState(agentName || null);
  const [session, setSession] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState(null);
  const [activeChats, setActiveChats] = useState([]);
  const [streamingText, setStreamingText] = useState('');
  const [useStreaming, setUseStreaming] = useState(true);
  const [agentsLoaded, setAgentsLoaded] = useState(false);

  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  const autoStarted = useRef(false);

  // Load agents list (no blocking provider check)
  useEffect(() => {
    const load = async () => {
      try {
        const [agentList, chats] = await Promise.all([
          api.agents.list(),
          api.chat.list(),
        ]);
        setAgents(agentList);
        setActiveChats(chats);
      } catch (err) {
        console.error('AgentChat load error:', err);
      }
      setAgentsLoaded(true);
    };
    load();
  }, []);

  // Auto-start chat immediately when navigating with an agent name
  useEffect(() => {
    if (agentName && agentsLoaded && !session && !starting && !autoStarted.current) {
      autoStarted.current = true;
      handleStartChat(agentName);
    }
  }, [agentName, agentsLoaded]); // eslint-disable-line

  // Setup streaming listeners
  useEffect(() => {
    const cleanupChunk = api.chat.onStreamChunk((sid, chunk) => {
      if (session && sid === session.sessionId) {
        setStreamingText(prev => prev + chunk.text);
      }
    });
    const cleanupDone = api.chat.onStreamDone((sid, result) => {
      if (session && sid === session.sessionId) {
        setStreamingText('');
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: result.content,
          timestamp: Date.now(),
          usage: result.usage
        }]);
        setLoading(false);
      }
    });
    const cleanupError = api.chat.onStreamError((sid, err) => {
      if (session && sid === session.sessionId) {
        setStreamingText('');
        setError(err);
        setLoading(false);
      }
    });
    return () => {
      if (cleanupChunk) cleanupChunk();
      if (cleanupDone) cleanupDone();
      if (cleanupError) cleanupError();
    };
  }, [session]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText]);

  const handleStartChat = async (agent) => {
    setStarting(true);
    setError(null);
    setMessages([]);
    setStreamingText('');
    try {
      const result = await api.chat.start(agent);
      setSession(result);
      setSelectedAgent(agent);
      setMessages([{
        role: 'assistant',
        content: result.greeting,
        timestamp: Date.now(),
        usage: result.usage
      }]);
      setTimeout(() => textareaRef.current?.focus(), 100);
    } catch (err) {
      const errMsg = err.message || String(err) || 'Erreur inconnue';
      if (errMsg.includes('API_KEY_MISSING')) {
        setError('no_api_key');
      } else if (errMsg.includes('OLLAMA_CONNECTION_ERROR') || errMsg.includes('ECONNREFUSED') || errMsg.includes('connexion') || errMsg.includes('fetch failed')) {
        setError('ollama_not_running');
      } else if (errMsg.includes('GEMINI_ERROR') || errMsg.includes('GEMINI_CONNECTION_ERROR')) {
        setError('gemini_error:' + errMsg.replace(/GEMINI_(CONNECTION_)?ERROR:\s*/, ''));
      } else {
        setError(errMsg);
      }
      setSelectedAgent(agent);
    } finally {
      setStarting(false);
    }
  };

  const handleSend = async () => {
    const msg = input.trim();
    if (!msg || loading || !session) return;

    setInput('');
    setError(null);

    setMessages(prev => [...prev, {
      role: 'user',
      content: msg,
      timestamp: Date.now()
    }]);

    setLoading(true);

    if (useStreaming) {
      setStreamingText('');
      api.chat.stream(session.sessionId, msg);
    } else {
      try {
        const result = await api.chat.send(session.sessionId, msg);
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: result.content,
          timestamp: Date.now(),
          usage: result.usage
        }]);
      } catch (err) {
        setError(err.message || 'Erreur lors de l\'envoi');
      } finally {
        setLoading(false);
      }
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleClearChat = async () => {
    if (session) {
      await api.chat.clear(session.sessionId);
    }
    setSession(null);
    setMessages([]);
    setStreamingText('');
    setSelectedAgent(null);
    setError(null);
    autoStarted.current = false;
  };

  const handleResumeChat = async (chat) => {
    const history = await api.chat.history(chat.sessionId);
    const agentMeta = agents.find(a => a.name === chat.agentName);
    setSession({
      sessionId: chat.sessionId,
      agentName: chat.agentName,
      agentTitle: agentMeta?.title || chat.agentName,
      agentIcon: agentMeta?.icon || '🤖'
    });
    setSelectedAgent(chat.agentName);
    setMessages(history.map(m => ({
      ...m,
      timestamp: m.timestamp || Date.now()
    })));
    setTimeout(() => textareaRef.current?.focus(), 100);
  };

  const handleRetry = () => {
    setError(null);
    autoStarted.current = false;
    if (selectedAgent) {
      handleStartChat(selectedAgent);
    }
  };

  // ─── Render: Error page (connection/config issues) ────────────────
  if (error && !session) {
    const agentMeta = agents.find(a => a.name === selectedAgent);
    return (
      <div className="page-container">
        <div className="page-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button className="btn btn-ghost" onClick={() => { setError(null); setSelectedAgent(null); autoStarted.current = false; }}>
              ← Retour
            </button>
            <h2>💬 {agentMeta?.icon || '🤖'} {agentMeta?.title || selectedAgent}</h2>
          </div>
        </div>
        <div className="chat-setup-card">
          {error === 'ollama_not_running' ? (
            <>
              <div className="chat-setup-icon">🦙</div>
              <h3>Impossible de se connecter à Ollama</h3>
              <p style={{ marginBottom: 12 }}>
                Le fournisseur IA sélectionné (Ollama) n'est pas en cours d'exécution.
              </p>
              <div style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                padding: '16px 20px',
                marginBottom: 20,
                textAlign: 'left',
                fontSize: 14,
                lineHeight: 1.8
              }}>
                <strong>📋 Options :</strong><br />
                1. <strong>Installer et lancer Ollama</strong> : <span style={{ color: 'var(--accent-purple-light)' }}>https://ollama.com</span> puis <code style={{ background: 'rgba(255,255,255,0.1)', padding: '2px 6px', borderRadius: 4 }}>ollama serve</code><br />
                2. Ou <strong>utilisez Gemini</strong> (gratuit) : cliquez sur "Paramètres IA" ci-dessous
              </div>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                <button className="btn btn-primary" onClick={handleRetry}>
                  🔄 Réessayer
                </button>
                <button className="btn btn-secondary" onClick={() => navigate('/ai-settings')}>
                  ⚙️ Paramètres IA
                </button>
              </div>
            </>
          ) : error === 'no_api_key' ? (
            <>
              <div className="chat-setup-icon">🔑</div>
              <h3>Clé API non configurée</h3>
              <p style={{ marginBottom: 16 }}>
                Configurez votre clé API pour discuter avec les agents.
              </p>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                <button className="btn btn-primary" onClick={() => navigate('/ai-settings')}>
                  ⚙️ Configurer la clé API
                </button>
                <button className="btn btn-ghost" onClick={handleRetry}>
                  🔄 Réessayer
                </button>
              </div>
            </>
          ) : error.startsWith && error.startsWith('gemini_error:') ? (
            <>
              <div className="chat-setup-icon">✨</div>
              <h3>Erreur Gemini</h3>
              <p style={{ marginBottom: 16, color: 'var(--accent-red)' }}>
                {error.replace('gemini_error:', '')}
              </p>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                <button className="btn btn-primary" onClick={() => navigate('/ai-settings')}>
                  ⚙️ Paramètres IA
                </button>
                <button className="btn btn-ghost" onClick={handleRetry}>
                  🔄 Réessayer
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="chat-setup-icon">⚠️</div>
              <h3>Erreur de connexion</h3>
              <p style={{ marginBottom: 16, color: 'var(--accent-red)' }}>
                {error}
              </p>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                <button className="btn btn-primary" onClick={handleRetry}>
                  🔄 Réessayer
                </button>
                <button className="btn btn-secondary" onClick={() => navigate('/ai-settings')}>
                  ⚙️ Paramètres IA
                </button>
                <button className="btn btn-ghost" onClick={() => navigate('/')}>
                  🏠 Accueil
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // ─── Render: Starting chat ──────────────────────────────────────────
  if (starting) {
    const agentMeta = agents.find(a => a.name === (selectedAgent || agentName));
    return (
      <div className="page-container">
        <div className="chat-loading">
          <div className="chat-loading-spinner"></div>
          <p>Connexion à {agentMeta?.icon || '🤖'} {agentMeta?.title || selectedAgent || agentName}...</p>
        </div>
      </div>
    );
  }

  // ─── Render: Agent selection (no agent specified) ───────────────────
  if (!session && !starting) {
    return (
      <div className="page-container">
        <div className="page-header">
          <h2>💬 Chat avec un Agent</h2>
          <p className="page-subtitle">Sélectionnez un agent pour démarrer une conversation</p>
        </div>

        {/* Active chats */}
        {activeChats.length > 0 && (
          <div className="chat-active-sessions">
            <h3>Conversations en cours</h3>
            <div className="chat-sessions-grid">
              {activeChats.map(chat => {
                const agentMeta = agents.find(a => a.name === chat.agentName);
                return (
                  <div
                    key={chat.sessionId}
                    className="chat-session-card"
                    onClick={() => handleResumeChat(chat)}
                  >
                    <span className="chat-session-icon">{agentMeta?.icon || '🤖'}</span>
                    <div className="chat-session-info">
                      <strong>{agentMeta?.title || chat.agentName}</strong>
                      <span className="chat-session-meta">
                        {chat.messageCount} messages
                      </span>
                      {chat.lastMessage && (
                        <span className="chat-session-preview">{chat.lastMessage}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Agent selection grid */}
        {!agentsLoaded ? (
          <div className="chat-loading">
            <div className="chat-loading-spinner"></div>
            <p>Chargement des agents...</p>
          </div>
        ) : (
          <div className="chat-agents-grid">
            {agents.map(agent => (
              <div
                key={agent.name}
                className="chat-agent-card"
                onClick={() => handleStartChat(agent.name)}
              >
                <div className="chat-agent-icon">{agent.icon || '🤖'}</div>
                <div className="chat-agent-info">
                  <h4>{agent.title || agent.name}</h4>
                  <p>{agent.whenToUse || ''}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ─── Render: Chat interface ─────────────────────────────────────────
  return (
    <div className="chat-container">
      {/* Chat header */}
      <div className="chat-header">
        <div className="chat-header-agent">
          <span className="chat-header-icon">{session.agentIcon}</span>
          <div>
            <h3>{session.agentTitle}</h3>
            <span className="chat-header-status">
              {loading ? '⏳ Réflexion en cours...' : '🟢 En ligne'}
            </span>
          </div>
        </div>
        <div className="chat-header-actions">
          <label className="chat-stream-toggle" title="Streaming en temps réel">
            <input
              type="checkbox"
              checked={useStreaming}
              onChange={(e) => setUseStreaming(e.target.checked)}
            />
            <span>Stream</span>
          </label>
          <button className="btn btn-ghost" onClick={handleClearChat} title="Nouvelle conversation">
            🗑️ Nouveau
          </button>
        </div>
      </div>

      {/* Messages area */}
      <div className="chat-messages">
        {messages.map((msg, i) => (
          <div key={i} className={`chat-message chat-message-${msg.role}`}>
            <div className="chat-message-avatar">
              {msg.role === 'assistant' ? session.agentIcon : '👤'}
            </div>
            <div className="chat-message-content">
              <div className="chat-message-text">
                {msg.content.split('\n').map((line, j) => (
                  <React.Fragment key={j}>
                    {line}
                    {j < msg.content.split('\n').length - 1 && <br />}
                  </React.Fragment>
                ))}
              </div>
              {msg.usage && (
                <div className="chat-message-meta">
                  {msg.usage.input_tokens + msg.usage.output_tokens} tokens
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Streaming indicator */}
        {streamingText && (
          <div className="chat-message chat-message-assistant">
            <div className="chat-message-avatar">{session.agentIcon}</div>
            <div className="chat-message-content">
              <div className="chat-message-text streaming">
                {streamingText.split('\n').map((line, j) => (
                  <React.Fragment key={j}>
                    {line}
                    {j < streamingText.split('\n').length - 1 && <br />}
                  </React.Fragment>
                ))}
                <span className="typing-cursor">▊</span>
              </div>
            </div>
          </div>
        )}

        {/* Loading indicator (non-streaming) */}
        {loading && !streamingText && !useStreaming && (
          <div className="chat-message chat-message-assistant">
            <div className="chat-message-avatar">{session.agentIcon}</div>
            <div className="chat-message-content">
              <div className="chat-typing-indicator">
                <span></span><span></span><span></span>
              </div>
            </div>
          </div>
        )}

        {/* Error display */}
        {error && (
          <div className="chat-error">
            ⚠️ {error}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="chat-input-area">
        <div className="chat-input-wrapper">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Envoyer un message à ${session.agentTitle}...`}
            disabled={loading}
            rows={1}
            className="chat-textarea"
          />
          <button
            className="chat-send-btn"
            onClick={handleSend}
            disabled={!input.trim() || loading}
            title="Envoyer (Entrée)"
          >
            ➤
          </button>
        </div>
        <div className="chat-input-hint">
          Entrée pour envoyer · Shift+Entrée pour un retour à la ligne
        </div>
      </div>
    </div>
  );
}
