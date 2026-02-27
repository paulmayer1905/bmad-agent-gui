import React, { useEffect, useState, useCallback } from 'react';
import api from '../api';

export default function QueueMonitor() {
  const [metrics, setMetrics] = useState({ active: 0, completed: 0, failed: 0, total: 0, history: [] });
  const [tab, setTab] = useState('active');
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    const [m, msgs] = await Promise.all([
      api.queue.metrics(),
      api.queue.list(tab)
    ]);
    setMetrics(m);
    setMessages(msgs);
    setLoading(false);
  }, [tab]);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, [loadData]);

  const handleRetry = async (id) => {
    await api.queue.retry(id);
    loadData();
  };

  const handleCleanup = async () => {
    await api.queue.cleanup();
    loadData();
  };

  return (
    <>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h2>Queue Monitor</h2>
            <p>Message queue status and operations</p>
          </div>
          <button className="btn btn-secondary" onClick={handleCleanup}>
            🧹 Cleanup Old Messages
          </button>
        </div>
      </div>

      <div className="page-content animate-in">
        {/* Metrics */}
        <div className="grid-4" style={{ marginBottom: 24 }}>
          <div className="stat-card" onClick={() => setTab('active')} style={{ cursor: 'pointer', border: tab === 'active' ? '2px solid var(--accent-blue)' : undefined }}>
            <div className="stat-label">Active</div>
            <div className="stat-value blue">{metrics.active}</div>
            <div className="stat-footer">In progress</div>
          </div>
          <div className="stat-card" onClick={() => setTab('completed')} style={{ cursor: 'pointer', border: tab === 'completed' ? '2px solid var(--accent-green)' : undefined }}>
            <div className="stat-label">Completed</div>
            <div className="stat-value green">{metrics.completed}</div>
            <div className="stat-footer">Successfully processed</div>
          </div>
          <div className="stat-card" onClick={() => setTab('failed')} style={{ cursor: 'pointer', border: tab === 'failed' ? '2px solid var(--accent-red)' : undefined }}>
            <div className="stat-label">Failed</div>
            <div className="stat-value red">{metrics.failed}</div>
            <div className="stat-footer">Needs attention</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Total</div>
            <div className="stat-value purple">{metrics.total}</div>
            <div className="stat-footer">All time</div>
          </div>
        </div>

        {/* Activity Chart */}
        {metrics.history && metrics.history.length > 0 && (
          <div className="card" style={{ marginBottom: 24 }}>
            <h3 style={{ marginBottom: 16 }}>Activity (Last 24h)</h3>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 120, padding: '0 8px' }}>
              {metrics.history.map((h, i) => {
                const maxVal = Math.max(...metrics.history.map(x => x.completed + x.failed), 1);
                const completedHeight = (h.completed / maxVal) * 100;
                const failedHeight = (h.failed / maxVal) * 100;
                return (
                  <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }} title={`${h.time}: ${h.completed} completed, ${h.failed} failed`}>
                    {h.failed > 0 && (
                      <div style={{ width: '100%', height: `${failedHeight}%`, minHeight: h.failed ? 3 : 0, background: 'var(--accent-red)', borderRadius: '2px 2px 0 0', opacity: 0.8 }} />
                    )}
                    <div style={{ width: '100%', height: `${completedHeight}%`, minHeight: h.completed ? 3 : 0, background: 'var(--accent-blue)', borderRadius: '2px 2px 0 0', opacity: 0.8 }} />
                  </div>
                );
              })}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 10, color: 'var(--text-muted)' }}>
              <span>{metrics.history[0]?.time}</span>
              <span>{metrics.history[metrics.history.length - 1]?.time}</span>
            </div>
            <div style={{ display: 'flex', gap: 16, marginTop: 12, fontSize: 12 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 12, height: 12, borderRadius: 2, background: 'var(--accent-blue)', display: 'inline-block' }} /> Completed
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 12, height: 12, borderRadius: 2, background: 'var(--accent-red)', display: 'inline-block' }} /> Failed
              </span>
            </div>
          </div>
        )}

        {/* Messages Table */}
        <div>
          <div className="tabs">
            <button className={`tab ${tab === 'active' ? 'active' : ''}`} onClick={() => setTab('active')}>
              Active ({metrics.active})
            </button>
            <button className={`tab ${tab === 'completed' ? 'active' : ''}`} onClick={() => setTab('completed')}>
              Completed ({metrics.completed})
            </button>
            <button className={`tab ${tab === 'failed' ? 'active' : ''}`} onClick={() => setTab('failed')}>
              Failed ({metrics.failed})
            </button>
          </div>

          {loading ? (
            <div className="empty-state pulse">Loading messages...</div>
          ) : messages.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">📭</div>
              <h3>No {tab} messages</h3>
              <p>The queue is empty for this status</p>
            </div>
          ) : (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Timestamp</th>
                    <th>Retries</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {messages.map(msg => (
                    <tr key={msg.id}>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{msg.id}</td>
                      <td>{msg.type || 'message'}</td>
                      <td><span className={`badge badge-${msg.status}`}>{msg.status}</span></td>
                      <td style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                        {new Date(msg.timestamp).toLocaleString()}
                      </td>
                      <td>{msg.retries || 0}</td>
                      <td>
                        {msg.status === 'failed' && (
                          <button className="btn btn-sm btn-secondary" onClick={() => handleRetry(msg.id)}>
                            🔄 Retry
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
