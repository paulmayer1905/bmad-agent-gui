import React, { useEffect, useState, useCallback } from 'react';
import api from '../api';

export default function Sessions() {
  const [sessions, setSessions] = useState([]);
  const [agents, setAgents] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState('');
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    const [s, a] = await Promise.all([api.sessions.list(), api.agents.list()]);
    setSessions(s);
    setAgents(a);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, [loadData]);

  const handleCreate = async () => {
    if (!selectedAgent) return;
    await api.sessions.create(selectedAgent, {});
    setShowCreate(false);
    setSelectedAgent('');
    loadData();
  };

  const handleSuspend = async (id) => {
    await api.sessions.suspend(id);
    loadData();
  };

  const handleResume = async (id) => {
    await api.sessions.resume(id);
    loadData();
  };

  const activeSessions = sessions.filter(s => s.status === 'active');
  const suspendedSessions = sessions.filter(s => s.status === 'suspended');
  const otherSessions = sessions.filter(s => s.status !== 'active' && s.status !== 'suspended');

  return (
    <>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h2>Sessions</h2>
            <p>Manage agent conversation sessions</p>
          </div>
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
            ➕ New Session
          </button>
        </div>
      </div>

      <div className="page-content animate-in">
        {/* Stats */}
        <div className="grid-3" style={{ marginBottom: 24 }}>
          <div className="stat-card">
            <div className="stat-label">Active</div>
            <div className="stat-value green">{activeSessions.length}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Suspended</div>
            <div className="stat-value yellow">{suspendedSessions.length}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Total</div>
            <div className="stat-value purple">{sessions.length}</div>
          </div>
        </div>

        {loading ? (
          <div className="empty-state pulse">Loading sessions...</div>
        ) : sessions.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">💬</div>
            <h3>No sessions yet</h3>
            <p style={{ marginBottom: 16 }}>Create your first agent session to get started</p>
            <button className="btn btn-primary" onClick={() => setShowCreate(true)}>Create Session</button>
          </div>
        ) : (
          <>
            {/* Active Sessions */}
            {activeSessions.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <h3 style={{ marginBottom: 12, fontSize: 16 }}>🟢 Active Sessions</h3>
                <div style={{ display: 'grid', gap: 12 }}>
                  {activeSessions.map(session => (
                    <SessionCard key={session.id} session={session} onSuspend={handleSuspend} onResume={handleResume} />
                  ))}
                </div>
              </div>
            )}

            {/* Suspended Sessions */}
            {suspendedSessions.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <h3 style={{ marginBottom: 12, fontSize: 16 }}>🟡 Suspended Sessions</h3>
                <div style={{ display: 'grid', gap: 12 }}>
                  {suspendedSessions.map(session => (
                    <SessionCard key={session.id} session={session} onSuspend={handleSuspend} onResume={handleResume} />
                  ))}
                </div>
              </div>
            )}

            {/* Other Sessions */}
            {otherSessions.length > 0 && (
              <div>
                <h3 style={{ marginBottom: 12, fontSize: 16 }}>📁 History</h3>
                <div className="table-container">
                  <table>
                    <thead>
                      <tr>
                        <th>Agent</th>
                        <th>Session ID</th>
                        <th>Status</th>
                        <th>Created</th>
                      </tr>
                    </thead>
                    <tbody>
                      {otherSessions.map(s => (
                        <tr key={s.id}>
                          <td>{s.ui?.icon} {s.ui?.displayName || s.agent}</td>
                          <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{s.id}</td>
                          <td><span className={`badge badge-${s.status}`}>{s.status}</span></td>
                          <td style={{ fontSize: 13, color: 'var(--text-muted)' }}>{new Date(s.created).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

        {/* Create Modal */}
        {showCreate && (
          <div className="modal-overlay" onClick={() => setShowCreate(false)}>
            <div className="modal" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h3>Create New Session</h3>
                <button className="modal-close" onClick={() => setShowCreate(false)}>×</button>
              </div>
              <p style={{ color: 'var(--text-secondary)', marginBottom: 20 }}>
                Select an agent to start a new conversation session.
              </p>
              <div style={{ display: 'grid', gap: 8, marginBottom: 24 }}>
                {agents.map(agent => (
                  <div
                    key={agent.name}
                    onClick={() => setSelectedAgent(agent.name)}
                    style={{
                      padding: '12px 16px',
                      background: selectedAgent === agent.name ? 'rgba(124, 58, 237, 0.15)' : 'var(--bg-card)',
                      border: `2px solid ${selectedAgent === agent.name ? 'var(--accent-purple)' : 'var(--border)'}`,
                      borderRadius: 'var(--radius-sm)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <span style={{ fontSize: 24 }}>{agent.icon || '🤖'}</span>
                    <div>
                      <div style={{ fontWeight: 600 }}>{agent.title || agent.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{agent.whenToUse || agent.name}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                <button className="btn btn-secondary" onClick={() => setShowCreate(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={handleCreate} disabled={!selectedAgent}>
                  Create Session
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function SessionCard({ session, onSuspend, onResume }) {
  const [expanded, setExpanded] = useState(false);
  const historyLen = session.context?.conversationHistory?.length || 0;

  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 28 }}>{session.ui?.icon || '🤖'}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 15 }}>{session.ui?.displayName || session.agent}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{session.id}</div>
        </div>
        <span className={`badge badge-${session.status}`}>{session.status}</span>
        <div style={{ display: 'flex', gap: 8 }}>
          {session.status === 'active' && (
            <button className="btn btn-sm btn-secondary" onClick={() => onSuspend(session.id)}>⏸ Suspend</button>
          )}
          {session.status === 'suspended' && (
            <button className="btn btn-sm btn-primary" onClick={() => onResume(session.id)}>▶ Resume</button>
          )}
          <button className="btn btn-sm btn-ghost" onClick={() => setExpanded(!expanded)}>
            {expanded ? '▲' : '▼'} Details
          </button>
        </div>
      </div>

      {expanded && (
        <div style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
          <div className="grid-3" style={{ marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Created</div>
              <div style={{ fontSize: 13 }}>{new Date(session.created).toLocaleString()}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Last Activity</div>
              <div style={{ fontSize: 13 }}>{new Date(session.lastActivity).toLocaleString()}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Messages</div>
              <div style={{ fontSize: 13 }}>{historyLen}</div>
            </div>
          </div>

          {historyLen > 0 && (
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>Recent messages:</div>
              <div className="code-block" style={{ maxHeight: 200, overflow: 'auto', fontSize: 12 }}>
                {session.context.conversationHistory.slice(-5).map((entry, i) => (
                  <div key={i} style={{ marginBottom: 8 }}>
                    <span style={{ color: 'var(--accent-purple-light)' }}>[{entry.role || 'system'}]</span>{' '}
                    {entry.text || entry.content || JSON.stringify(entry)}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
