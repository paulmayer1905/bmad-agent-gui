import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';

const agentColors = {
  'bmad-master': 'linear-gradient(135deg, #7c3aed, #6d28d9)',
  'bmad-orchestrator': 'linear-gradient(135deg, #3b82f6, #2563eb)',
  'pm': 'linear-gradient(135deg, #10b981, #059669)',
  'architect': 'linear-gradient(135deg, #f97316, #ea580c)',
  'dev': 'linear-gradient(135deg, #06b6d4, #0891b2)',
  'qa': 'linear-gradient(135deg, #ef4444, #dc2626)',
  'ux-expert': 'linear-gradient(135deg, #ec4899, #db2777)',
  'sm': 'linear-gradient(135deg, #f59e0b, #d97706)',
  'analyst': 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
  'po': 'linear-gradient(135deg, #14b8a6, #0d9488)',
};

export default function Dashboard() {
  const navigate = useNavigate();
  const [agents, setAgents] = useState([]);
  const [activeChats, setActiveChats] = useState([]);
  const [providerStatus, setProviderStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [agentList, chats, aiConfig] = await Promise.all([
          api.agents.list(),
          api.chat.list(),
          api.ai.getConfig(),
        ]);
        setAgents(agentList);
        setActiveChats(chats);

        // Check provider readiness
        const provider = aiConfig.provider || 'ollama';
        if (provider === 'ollama') {
          try {
            const status = await api.ai.ollamaStatus();
            setProviderStatus({ ready: status.available, provider: 'ollama', models: status.models || [], error: status.available ? null : 'not_running' });
          } catch {
            setProviderStatus({ ready: false, provider: 'ollama', error: 'not_running' });
          }
        } else {
          const configured = await api.ai.isConfigured();
          setProviderStatus({ ready: configured, provider, error: configured ? null : 'no_api_key' });
        }
      } catch (err) {
        console.error('Dashboard load error:', err);
      }
      setLoading(false);
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="page-content">
        <div className="empty-state">
          <div className="empty-state-icon pulse">🧠</div>
          <h3>Chargement...</h3>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="page-header">
        <h2>🧠 BMAD — Vos agents IA</h2>
        <p>Choisissez un agent et commencez à discuter</p>
      </div>
      <div className="page-content animate-in">

        {/* Provider Status Banner */}
        {providerStatus && !providerStatus.ready && (
          <div style={{
            padding: '16px 20px',
            marginBottom: 24,
            borderRadius: 'var(--radius-md)',
            background: 'rgba(251, 191, 36, 0.1)',
            border: '1px solid rgba(251, 191, 36, 0.3)',
            display: 'flex',
            alignItems: 'center',
            gap: 12
          }}>
            <span style={{ fontSize: 24 }}>⚠️</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Fournisseur IA non configuré</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                {providerStatus.provider === 'ollama'
                  ? 'Ollama n\'est pas démarré. Lancez Ollama ou choisissez un autre fournisseur.'
                  : `Clé API ${providerStatus.provider} manquante. Configurez-la dans les paramètres.`}
              </div>
            </div>
            <button className="btn btn-primary" onClick={() => navigate('/ai-settings')}>
              ⚙️ Configurer
            </button>
          </div>
        )}

        {providerStatus && providerStatus.ready && (
          <div style={{
            padding: '12px 20px',
            marginBottom: 24,
            borderRadius: 'var(--radius-md)',
            background: 'rgba(16, 185, 129, 0.1)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            fontSize: 14
          }}>
            <span style={{ fontSize: 16 }}>✅</span>
            <span>
              Fournisseur <strong>{providerStatus.provider}</strong> prêt
              {providerStatus.models?.length > 0 && ` — ${providerStatus.models.length} modèle(s) disponible(s)`}
            </span>
          </div>
        )}

        {/* Active Chats */}
        {activeChats.length > 0 && (
          <div style={{ marginBottom: 28 }}>
            <h3 style={{ marginBottom: 12, fontSize: 16 }}>💬 Conversations en cours</h3>
            <div style={{ display: 'grid', gap: 8 }}>
              {activeChats.map(chat => (
                <div
                  key={chat.sessionId || chat.agent}
                  className="card card-clickable"
                  onClick={() => navigate(`/chat/${chat.agent}`)}
                  style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14 }}
                >
                  <div style={{
                    width: 40, height: 40, borderRadius: '50%',
                    background: agentColors[chat.agent] || 'var(--bg-tertiary)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20
                  }}>
                    {chat.icon || '🤖'}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{chat.title || chat.agent}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {chat.messageCount ? `${chat.messageCount} messages` : 'Conversation active'}
                    </div>
                  </div>
                  <span style={{ fontSize: 13, color: 'var(--accent-purple)' }}>Reprendre →</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Main Agent Grid - Action oriented */}
        <div style={{ marginBottom: 28 }}>
          <h3 style={{ marginBottom: 14, fontSize: 16 }}>
            🤖 {activeChats.length > 0 ? 'Démarrer une nouvelle conversation' : 'Choisissez un agent pour démarrer'}
          </h3>
          <div className="grid-3">
            {agents.map(agent => (
              <div
                key={agent.name}
                className="card card-clickable"
                onClick={() => navigate(`/chat/${agent.name}`)}
                style={{ position: 'relative', overflow: 'hidden', cursor: 'pointer' }}
              >
                {/* Color accent bar */}
                <div style={{
                  position: 'absolute', top: 0, left: 0, right: 0, height: 3,
                  background: agentColors[agent.name] || 'var(--accent-purple)'
                }} />

                <div className="card-header" style={{ marginTop: 4 }}>
                  <div className="card-icon" style={{
                    background: agentColors[agent.name] || 'var(--bg-tertiary)',
                    fontSize: 24
                  }}>
                    {agent.icon || '🤖'}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div className="card-title">{agent.title || agent.name}</div>
                    <div className="card-subtitle" style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{agent.name}</div>
                  </div>
                </div>

                {agent.whenToUse && (
                  <div className="card-body" style={{ fontSize: 13, marginBottom: 12, lineHeight: 1.5 }}>
                    {agent.whenToUse.length > 120 ? agent.whenToUse.slice(0, 120) + '...' : agent.whenToUse}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    className="btn btn-sm btn-primary"
                    style={{ flex: 1 }}
                    onClick={e => { e.stopPropagation(); navigate(`/chat/${agent.name}`); }}
                  >
                    💬 Discuter
                  </button>
                  <button
                    className="btn btn-sm btn-ghost"
                    onClick={e => { e.stopPropagation(); navigate(`/agents/${agent.name}`); }}
                  >
                    Détails
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Quick links row */}
        <div style={{
          display: 'flex', gap: 12, flexWrap: 'wrap',
          padding: '16px 0', borderTop: '1px solid var(--border)'
        }}>
          <button className="btn btn-ghost" onClick={() => navigate('/tasks')}>
            📝 Voir les tâches
          </button>
          <button className="btn btn-ghost" onClick={() => navigate('/checklists')}>
            ✅ Checklists
          </button>
          <button className="btn btn-ghost" onClick={() => navigate('/workflows')}>
            🔀 Workflows
          </button>
          <button className="btn btn-ghost" onClick={() => navigate('/ai-settings')}>
            ⚙️ Paramètres IA
          </button>
        </div>
      </div>
    </>
  );
}
