import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';

export default function Dashboard() {
  const navigate = useNavigate();
  const [agents, setAgents] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [metrics, setMetrics] = useState({ active: 0, completed: 0, failed: 0, total: 0, history: [] });
  const [health, setHealth] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [a, s, m, h] = await Promise.all([
          api.agents.list(),
          api.sessions.list(),
          api.queue.metrics(),
          api.system.health(),
        ]);
        setAgents(a);
        setSessions(s);
        setMetrics(m);
        setHealth(h);
      } catch (err) {
        console.error('Dashboard load error:', err);
      }
      setLoading(false);
    }
    load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, []);

  const activeSessions = sessions.filter(s => s.status === 'active');
  const suspendedSessions = sessions.filter(s => s.status === 'suspended');

  if (loading) {
    return (
      <div className="page-content">
        <div className="empty-state">
          <div className="empty-state-icon pulse">🧠</div>
          <h3>Loading BMAD Dashboard...</h3>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="page-header">
        <h2>Dashboard</h2>
        <p>Overview of your BMAD Agent ecosystem</p>
      </div>
      <div className="page-content animate-in">
        {/* Stats Row */}
        <div className="grid-4" style={{ marginBottom: 24 }}>
          <div className="stat-card">
            <div className="stat-label">Agents Available</div>
            <div className="stat-value purple">{agents.length}</div>
            <div className="stat-footer">Loaded from bmad-core</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Active Sessions</div>
            <div className="stat-value green">{activeSessions.length}</div>
            <div className="stat-footer">{suspendedSessions.length} suspended</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Queue: Completed</div>
            <div className="stat-value blue">{metrics.completed}</div>
            <div className="stat-footer">{metrics.active} in progress</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Queue: Failed</div>
            <div className="stat-value red">{metrics.failed}</div>
            <div className="stat-footer">{metrics.total} total messages</div>
          </div>
        </div>

        {/* Quick Actions */}
        <div style={{ marginBottom: 24 }}>
          <h3 style={{ marginBottom: 12, fontSize: 16 }}>Quick Actions</h3>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button className="btn btn-primary" onClick={() => navigate('/agents')}>
              🤖 Launch Agent
            </button>
            <button className="btn btn-secondary" onClick={() => navigate('/sessions')}>
              💬 View Sessions
            </button>
            <button className="btn btn-secondary" onClick={() => navigate('/queue')}>
              📨 Queue Monitor
            </button>
            <button className="btn btn-secondary" onClick={() => navigate('/workflows')}>
              🔀 Workflows
            </button>
          </div>
        </div>

        {/* Agent Grid */}
        <div style={{ marginBottom: 24 }}>
          <h3 style={{ marginBottom: 12, fontSize: 16 }}>Available Agents</h3>
          <div className="grid-3">
            {agents.slice(0, 6).map(agent => (
              <div
                key={agent.name}
                className="card card-clickable"
                onClick={() => navigate(`/agents/${agent.name}`)}
              >
                <div className="card-header">
                  <div className="card-icon">{agent.icon || '🤖'}</div>
                  <div>
                    <div className="card-title">{agent.title || agent.name}</div>
                    <div className="card-subtitle">{agent.name}</div>
                  </div>
                </div>
                {agent.whenToUse && (
                  <div className="card-body" style={{ fontSize: 13 }}>
                    {agent.whenToUse.slice(0, 100)}{agent.whenToUse.length > 100 ? '...' : ''}
                  </div>
                )}
              </div>
            ))}
          </div>
          {agents.length > 6 && (
            <div style={{ textAlign: 'center', marginTop: 12 }}>
              <button className="btn btn-ghost" onClick={() => navigate('/agents')}>
                View all {agents.length} agents →
              </button>
            </div>
          )}
        </div>

        {/* Recent Sessions */}
        {sessions.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <h3 style={{ marginBottom: 12, fontSize: 16 }}>Recent Sessions</h3>
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Agent</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th>Last Activity</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.slice(0, 5).map(session => (
                    <tr key={session.id}>
                      <td>
                        <span style={{ marginRight: 8 }}>{session.ui?.icon || '🤖'}</span>
                        {session.ui?.displayName || session.agent}
                      </td>
                      <td>
                        <span className={`badge badge-${session.status}`}>{session.status}</span>
                      </td>
                      <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                        {new Date(session.created).toLocaleString()}
                      </td>
                      <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                        {new Date(session.lastActivity).toLocaleTimeString()}
                      </td>
                      <td>
                        {session.status === 'suspended' ? (
                          <button className="btn btn-sm btn-secondary" onClick={() => api.sessions.resume(session.id)}>
                            Resume
                          </button>
                        ) : (
                          <button className="btn btn-sm btn-ghost" onClick={() => navigate('/sessions')}>
                            View
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* System Health */}
        {health.checks && (
          <div>
            <h3 style={{ marginBottom: 12, fontSize: 16 }}>System Health</h3>
            <div className="grid-3">
              {Object.entries(health.checks).map(([key, ok]) => (
                <div key={key} className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 16 }}>
                  <span className={`health-dot ${ok ? '' : 'error'}`}></span>
                  <span style={{ fontSize: 14 }}>{key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 12, color: ok ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                    {ok ? '✓ OK' : '✗ Failed'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
