import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  const [aiConfigured, setAiConfigured] = useState(null);
  const [activeChats, setActiveChats] = useState([]);
  const [streamingText, setStreamingText] = useState('');
  const [useStreaming, setUseStreaming] = useState(true);
  const [providerStatus, setProviderStatus] = useState(null); // { ready, provider, error, models }
  
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const textareaRef = useRef(null);

  // Load agents and check AI config + provider readiness
  useEffect(() => {
    const load = async () => {
      const [agentList, configured, chats, aiConfig] = await Promise.all([
        api.agents.list(),
        api.ai.isConfigured(),
        api.chat.list(),
        api.ai.getConfig()
      ]);
      setAgents(agentList);
      setAiConfigured(configured);
      setActiveChats(chats);

      // Check provider readiness
      const currentProvider = aiConfig.provider || 'ollama';
      if (currentProvider === 'ollama') {
        try {
          const ollamaStatus = await api.ai.ollamaStatus();
          if (ollamaStatus.available) {
            setProviderStatus({
              ready: true,
              provider: 'ollama',
              models: ollamaStatus.models || []
            });
          } else {
            setProviderStatus({
              ready: false,
              provider: 'ollama',
              error: 'not_running'
            });
          }
        } catch {
          setProviderStatus({
            ready: false,
            provider: 'ollama',
            error: 'not_running'
          });
        }
      } else if (currentProvider === 'anthropic') {
        setProviderStatus({
          ready: configured,
          provider: 'anthropic',
          error: configured ? null : 'no_api_key'
        });
      }
    };
    load();
  }, []);

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

  // Auto-start if agent specified in URL and provider is ready
  useEffect(() => {
    if (agentName && providerStatus?.ready && !session && !starting) {
      handleStartChat(agentName);
    }
  }, [agentName, providerStatus]);

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
      // Focus input
      setTimeout(() => textareaRef.current?.focus(), 100);
    } catch (err) {
      const errMsg = err.message || String(err) || 'Erreur inconnue';
      if (errMsg.includes('API_KEY_MISSING')) {
        setError('Clé API non configurée. Allez dans Paramètres IA pour ajouter votre clé Anthropic.');
      } else if (errMsg.includes('OLLAMA_CONNECTION_ERROR') || errMsg.includes('ECONNREFUSED') || errMsg.includes('connexion')) {
        setError('Impossible de se connecter à Ollama. Lancez \"ollama serve\" dans un terminal, puis réessayez.');
      } else {
        setError(errMsg);
      }
    } finally {
      setStarting(false);
    }
  };

  const handleSend = async () => {
    const msg = input.trim();
    if (!msg || loading || !session) return;

    setInput('');
    setError(null);
    
    // Add user message
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

  // ─── Render: Provider not ready ───────────────────────────────────
  if (providerStatus && !providerStatus.ready) {
    return (
      <div className="page-container">
        <div className="page-header">
          <h2>💬 Chat avec un Agent</h2>
        </div>
        <div className="chat-setup-card">
          {providerStatus.provider === 'ollama' ? (
            <>
              <div className="chat-setup-icon">🦙</div>
              <h3>Ollama n'est pas lancé</h3>
              <p style={{ marginBottom: 12 }}>
                Pour discuter avec les agents, Ollama doit être en cours d'exécution sur votre machine.
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
                <strong>📋 Étapes à suivre :</strong><br />
                1. <strong>Installer Ollama</strong> : téléchargez sur <span style={{ color: 'var(--accent-purple-light)' }}>https://ollama.com</span><br />
                2. <strong>Lancer Ollama</strong> : ouvrez un terminal et tapez <code style={{ background: 'rgba(255,255,255,0.1)', padding: '2px 6px', borderRadius: 4 }}>ollama serve</code><br />
                3. <strong>Télécharger un modèle</strong> : <code style={{ background: 'rgba(255,255,255,0.1)', padding: '2px 6px', borderRadius: 4 }}>ollama pull llama3.1</code><br />
                4. Revenez ici et cliquez sur <em>Réessayer</em>
              </div>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                <button className="btn btn-primary" onClick={() => window.location.reload()}>
                  🔄 Réessayer
                </button>
                <button className="btn btn-secondary" onClick={() => navigate('/ai-settings')}>
                  ⚙️ Changer de provider
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="chat-setup-icon">🔑</div>
              <h3>Configuration requise</h3>
              <p>Pour discuter avec les agents BMAD via Anthropic, configurez votre clé API.</p>
              <button className="btn btn-primary" onClick={() => navigate('/ai-settings')}>
                Configurer la clé API
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  // ─── Render: Loading provider status ────────────────────────────────
  if (!providerStatus) {
    return (
      <div className="page-container">
        <div className="chat-loading">
          <div className="chat-loading-spinner"></div>
          <p>Vérification de la connexion...</p>
        </div>
      </div>
    );
  }

  // ─── Render: Agent selection ────────────────────────────────────────
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
      </div>
    );
  }

  // ─── Render: Starting ───────────────────────────────────────────────
  if (starting) {
    return (
      <div className="page-container">
        <div className="chat-loading">
          <div className="chat-loading-spinner"></div>
          <p>Connexion à l'agent {agents.find(a => a.name === selectedAgent)?.title || selectedAgent}...</p>
        </div>
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
          Entrée pour envoyer · Shift+Entrée pour un retour à la ligne · Utilisez *help pour voir les commandes
        </div>
      </div>
    </div>
  );
}
