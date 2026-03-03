import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import api from '../api';

// ─── Code block detection & export ────────────────────────────────────────
const CODE_BLOCK_REGEX = /```(\w*)\n([\s\S]*?)```/g;

const EXPORT_CONFIG = {
  svg: { icon: '🎨', label: 'Exporter SVG (Figma)', ext: 'svg', mime: 'image/svg+xml' },
  html: { icon: '🌐', label: 'Exporter HTML', ext: 'html', mime: 'text/html' },
  css: { icon: '🎨', label: 'Exporter CSS', ext: 'css', mime: 'text/css' },
  json: { icon: '📋', label: 'Exporter JSON', ext: 'json', mime: 'application/json' },
  yaml: { icon: '📋', label: 'Exporter YAML', ext: 'yaml', mime: 'text/yaml' },
  yml: { icon: '📋', label: 'Exporter YAML', ext: 'yaml', mime: 'text/yaml' },
  javascript: { icon: '📜', label: 'Exporter JS', ext: 'js', mime: 'text/javascript' },
  js: { icon: '📜', label: 'Exporter JS', ext: 'js', mime: 'text/javascript' },
  typescript: { icon: '📜', label: 'Exporter TS', ext: 'ts', mime: 'text/typescript' },
  ts: { icon: '📜', label: 'Exporter TS', ext: 'ts', mime: 'text/typescript' },
  python: { icon: '🐍', label: 'Exporter Python', ext: 'py', mime: 'text/x-python' },
  py: { icon: '🐍', label: 'Exporter Python', ext: 'py', mime: 'text/x-python' },
  xml: { icon: '📄', label: 'Exporter XML', ext: 'xml', mime: 'text/xml' },
  markdown: { icon: '📝', label: 'Exporter Markdown', ext: 'md', mime: 'text/markdown' },
  md: { icon: '📝', label: 'Exporter Markdown', ext: 'md', mime: 'text/markdown' },
  sql: { icon: '🗃️', label: 'Exporter SQL', ext: 'sql', mime: 'text/sql' },
};

function parseMessageContent(content) {
  const parts = [];
  let lastIndex = 0;
  let match;

  const regex = new RegExp(CODE_BLOCK_REGEX.source, 'g');
  while ((match = regex.exec(content)) !== null) {
    // Text before the code block
    if (match.index > lastIndex) {
      parts.push({ type: 'text', content: content.slice(lastIndex, match.index) });
    }
    parts.push({
      type: 'code',
      lang: match[1].toLowerCase() || 'text',
      content: match[2],
    });
    lastIndex = regex.lastIndex;
  }
  // Remaining text
  if (lastIndex < content.length) {
    parts.push({ type: 'text', content: content.slice(lastIndex) });
  }
  return parts;
}

function CodeBlockWithExport({ lang, content }) {
  const [copied, setCopied] = useState(false);
  const exportCfg = EXPORT_CONFIG[lang];
  const isSvg = lang === 'svg';

  // Sanitize SVG for safe inline preview (prevent XSS from LLM output)
  const sanitizeSvg = (svgStr) => {
    // Remove script tags, event handlers, foreignObject, and dangerous URI schemes
    return svgStr
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '')
      .replace(/on\w+\s*=\s*"[^"]*"/gi, '')
      .replace(/on\w+\s*=\s*'[^']*'/gi, '')
      .replace(/javascript\s*:/gi, 'blocked:')
      .replace(/data\s*:\s*text\/html/gi, 'blocked:text/html');
  };

  const handleExport = async () => {
    const defaultName = `wireframe-${Date.now()}.${exportCfg?.ext || 'txt'}`;
    const filters = exportCfg
      ? [{ name: exportCfg.label, extensions: [exportCfg.ext] }, { name: 'Tous', extensions: ['*'] }]
      : [{ name: 'Texte', extensions: ['txt'] }, { name: 'Tous', extensions: ['*'] }];
    await api.chat.saveFile(content, defaultName, filters);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="chat-code-block">
      <div className="chat-code-header">
        <span className="chat-code-lang">{lang || 'code'}</span>
        <div className="chat-code-actions">
          <button className="btn btn-ghost btn-xs" onClick={handleCopy} title="Copier">
            {copied ? '✅' : '📋'} {copied ? 'Copié' : 'Copier'}
          </button>
          {exportCfg && (
            <button className="btn btn-ghost btn-xs chat-export-btn" onClick={handleExport} title={exportCfg.label}>
              {exportCfg.icon} {exportCfg.label}
            </button>
          )}
        </div>
      </div>
      {isSvg && (
        <div className="chat-svg-preview" dangerouslySetInnerHTML={{ __html: sanitizeSvg(content) }} />
      )}
      <pre className="chat-code-content"><code>{content}</code></pre>
    </div>
  );
}

function RichMessageContent({ content }) {
  const parts = parseMessageContent(content);

  if (parts.length === 1 && parts[0].type === 'text') {
    // Simple text, render as before
    return parts[0].content.split('\n').map((line, j) => (
      <React.Fragment key={j}>
        {line}
        {j < parts[0].content.split('\n').length - 1 && <br />}
      </React.Fragment>
    ));
  }

  return parts.map((part, i) => {
    if (part.type === 'code') {
      return <CodeBlockWithExport key={i} lang={part.lang} content={part.content} />;
    }
    return part.content.split('\n').map((line, j) => (
      <React.Fragment key={`${i}-${j}`}>
        {line}
        {j < part.content.split('\n').length - 1 && <br />}
      </React.Fragment>
    ));
  });
}

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
  const [uploading, setUploading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [showDelegation, setShowDelegation] = useState(false);
  const [delegating, setDelegating] = useState(false);
  const [delegationTarget, setDelegationTarget] = useState(null);
  const [delegationQuestion, setDelegationQuestion] = useState('');

  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  const autoStarted = useRef(false);
  const streamingTimeout = useRef(null);

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
        // Reset timeout on each chunk received
        if (streamingTimeout.current) clearTimeout(streamingTimeout.current);
        streamingTimeout.current = setTimeout(() => {
          // No chunk received for 2 minutes — assume stream is dead
          setStreamingText(prev => {
            if (prev) {
              setMessages(msgs => [...msgs, {
                role: 'assistant',
                content: prev + '\n\n⚠️ *Streaming interrompu (timeout)*',
                timestamp: Date.now()
              }]);
            }
            return '';
          });
          setLoading(false);
        }, 120000);
      }
    });
    const cleanupDone = api.chat.onStreamDone((sid, result) => {
      if (session && sid === session.sessionId) {
        if (streamingTimeout.current) clearTimeout(streamingTimeout.current);
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
        if (streamingTimeout.current) clearTimeout(streamingTimeout.current);
        setStreamingText('');
        setError(err);
        setLoading(false);
      }
    });
    return () => {
      if (streamingTimeout.current) clearTimeout(streamingTimeout.current);
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
      } else if (errMsg.includes('OPENAI_ERROR') || errMsg.includes('OPENAI_CONNECTION_ERROR') || errMsg.includes('OPENAI_RATE_LIMITED')) {
        setError('openai_error:' + errMsg.replace(/OPENAI_(CONNECTION_ERROR|RATE_LIMITED|ERROR):\s*/, ''));
      } else if (errMsg.includes('GEMINI_QUOTA_EXHAUSTED')) {
        setError('gemini_quota:' + errMsg.replace(/GEMINI_QUOTA_EXHAUSTED:\s*/, ''));
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
    setUploadedFiles([]);
    autoStarted.current = false;
  };

  // ─── Delegation handler ───────────────────────────────────────────────
  const handleDelegate = async () => {
    if (!delegationTarget || !delegationQuestion.trim() || delegating) return;
    setDelegating(true);
    setError(null);

    // Show delegation request in chat
    const targetMeta = agents.find(a => a.name === delegationTarget);
    setMessages(prev => [...prev, {
      role: 'system',
      content: `🤝 Consultation de ${targetMeta?.icon || '🤖'} ${targetMeta?.title || delegationTarget}...`,
      timestamp: Date.now()
    }]);

    try {
      const result = await api.coord.delegate(
        session?.sessionId || null,
        delegationTarget,
        delegationQuestion.trim(),
        { saveAsArtifact: true }
      );

      // Show delegation response in current chat
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `🤝 **Réponse de ${result.agentIcon} ${result.agentTitle}** :\n\n${result.response}`,
        timestamp: Date.now(),
        usage: result.usage,
        isDelegation: true
      }]);

      setShowDelegation(false);
      setDelegationTarget(null);
      setDelegationQuestion('');
    } catch (err) {
      setError(`Erreur de délégation : ${err.message}`);
    } finally {
      setDelegating(false);
    }
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

  // ─── File Upload Handler ─────────────────────────────────────────
  const handleUploadFile = async () => {
    if (!session || uploading) return;
    try {
      const pickResult = await api.chat.pickFile();
      if (pickResult.canceled || !pickResult.filePaths?.length) return;

      setUploading(true);
      const results = [];

      for (const filePath of pickResult.filePaths) {
        try {
          const result = await api.chat.uploadFile(session.sessionId, filePath);
          results.push(result);

          if (result.success) {
            // Add a visual message in the chat showing the upload
            const icon = result.fileType === 'figma' ? '🎨'
              : result.fileType === 'image' ? '🖼️'
              : result.fileType === 'pdf' ? '📄'
              : result.fileType === 'docx' ? '📝'
              : result.fileType === 'office' ? '📊'
              : '📎';

            const figmaNote = result.fileType === 'figma'
              ? '\n💡 SVG chargé dans le contexte — demandez à l\'agent de l\'analyser ou le modifier'
              : '';

            setMessages(prev => [...prev, {
              role: 'user',
              content: `${icon} Fichier uploadé : **${result.fileName}** (${result.fileType}, ${(result.size / 1024).toFixed(0)} KB)${result.note ? '\n⚠️ ' + result.note : ''}${figmaNote}`,
              timestamp: Date.now(),
              isFile: true,
              fileInfo: result,
            }]);

            setUploadedFiles(prev => [...prev, {
              name: result.fileName,
              type: result.fileType,
              size: result.size,
            }]);
          } else {
            setMessages(prev => [...prev, {
              role: 'system',
              content: `⚠️ Erreur upload ${result.fileName || 'fichier'} : ${result.error}`,
              timestamp: Date.now(),
              isError: true,
            }]);
          }
        } catch (err) {
          setMessages(prev => [...prev, {
            role: 'system',
            content: `⚠️ Erreur : ${err.message || 'Upload échoué'}`,
            timestamp: Date.now(),
            isError: true,
          }]);
        }
      }

      setUploading(false);
    } catch (err) {
      setUploading(false);
      console.error('Upload error:', err);
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
          ) : error.startsWith && error.startsWith('gemini_quota:') ? (
            <>
              <div className="chat-setup-icon">⏳</div>
              <h3>Quota Gemini épuisé</h3>
              <p style={{ marginBottom: 12 }}>
                {error.replace('gemini_quota:', '')}
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
                <strong>💡 Solutions :</strong><br />
                1. <strong>Attendez 1-2 minutes</strong> puis cliquez « Réessayer » (l'app teste automatiquement d'autres modèles)<br />
                2. <strong>Utilisez Ollama</strong> (gratuit, illimité, local) dans Paramètres IA<br />
                3. Ou changez de modèle dans les paramètres Gemini
              </div>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                <button className="btn btn-primary" onClick={handleRetry}>
                  🔄 Réessayer (avec fallback auto)
                </button>
                <button className="btn btn-secondary" onClick={() => navigate('/ai-settings')}>
                  ⚙️ Paramètres IA
                </button>
              </div>
            </>
          ) : error.startsWith && error.startsWith('openai_error:') ? (
            <>
              <div className="chat-setup-icon">💬</div>
              <h3>Erreur OpenAI</h3>
              <p style={{ marginBottom: 16, color: 'var(--accent-red)' }}>
                {error.replace('openai_error:', '')}
              </p>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                <button className="btn btn-primary" onClick={handleRetry}>
                  🔄 Réessayer
                </button>
                <button className="btn btn-secondary" onClick={() => navigate('/ai-settings')}>
                  ⚙️ Paramètres IA
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
          <button className="btn btn-ghost btn-sm" onClick={() => setShowDelegation(!showDelegation)} title="Consulter un autre agent">
            🤝 Consulter
          </button>
          <label className="chat-stream-toggle" title="Streaming en temps réel">
            <input
              type="checkbox"
              checked={useStreaming}
              onChange={(e) => setUseStreaming(e.target.checked)}
            />
            <span>Stream</span>
          </label>
          <button className="btn btn-ghost" onClick={handleClearChat} title="Supprimer la conversation">
            🗑️ Supprimer
          </button>
        </div>
      </div>

      {/* Delegation panel */}
      {showDelegation && (
        <div className="delegation-panel">
          <div className="delegation-header">
            <span>🤝 Consulter un autre agent</span>
            <button className="btn btn-ghost btn-xs" onClick={() => setShowDelegation(false)}>✕</button>
          </div>
          <div className="delegation-agents">
            {agents.filter(a => a.name !== selectedAgent).map(a => (
              <button
                key={a.name}
                className={`delegation-agent-btn ${delegationTarget === a.name ? 'active' : ''}`}
                onClick={() => setDelegationTarget(a.name)}
              >
                {a.icon || '🤖'} {a.title || a.name}
              </button>
            ))}
          </div>
          {delegationTarget && (
            <div className="delegation-input">
              <input
                type="text"
                placeholder="Quelle question poser à cet agent ?"
                value={delegationQuestion}
                onChange={e => setDelegationQuestion(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleDelegate(); }}
                disabled={delegating}
              />
              <button
                className="btn btn-primary btn-sm"
                disabled={!delegationQuestion.trim() || delegating}
                onClick={handleDelegate}
              >
                {delegating ? '⏳' : '➤'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Messages area */}
      <div className="chat-messages">
        {messages.map((msg, i) => (
          <div key={i} className={`chat-message chat-message-${msg.role}${msg.isFile ? ' chat-message-file' : ''}${msg.isError ? ' chat-message-error' : ''}`}>
            {msg.role !== 'system' && (
              <div className="chat-message-avatar">
                {msg.role === 'assistant' ? session.agentIcon : msg.isFile ? '📎' : '👤'}
              </div>
            )}
            <div className="chat-message-content">
              <div className="chat-message-text">
                <RichMessageContent content={msg.content} />
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
        {/* Uploaded files indicator */}
        {uploadedFiles.length > 0 && (
          <div className="chat-upload-indicator">
            📋 {uploadedFiles.length} fichier{uploadedFiles.length > 1 ? 's' : ''} chargé{uploadedFiles.length > 1 ? 's' : ''} dans le contexte
          </div>
        )}
        <div className="chat-input-wrapper">
          <button
            className="chat-upload-btn"
            onClick={handleUploadFile}
            disabled={loading || uploading}
            title="Ajouter un fichier (SVG Figma, PDF, image, texte, code, Word...)"
          >
            {uploading ? '⏳' : '📎'}
          </button>
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
          Entrée pour envoyer · Shift+Entrée pour un retour à la ligne · 📎 pour joindre un fichier (SVG Figma, PDF, code...)
        </div>
      </div>
    </div>
  );
}
