import React, { useEffect, useState } from 'react';
import api from '../api';

export default function Tasks() {
  const [tasks, setTasks] = useState([]);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.tasks.list().then(t => { setTasks(t); setLoading(false); });
  }, []);

  const openTask = async (name) => {
    setSelected(name);
    const data = await api.tasks.get(name);
    setDetail(data);
  };

  const filtered = tasks.filter(t =>
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    (t.title || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      <div className="page-header">
        <h2>Tasks</h2>
        <p>BMAD-METHOD task definitions and templates</p>
      </div>

      <div className="page-content animate-in">
        {loading ? (
          <div className="empty-state pulse">Loading tasks...</div>
        ) : (
          <div className="grid-2">
            {/* List */}
            <div>
              <div className="search-wrapper" style={{ marginBottom: 16 }}>
                <span className="search-icon">🔍</span>
                <input
                  className="search-input"
                  placeholder="Search tasks..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>

              {filtered.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-state-icon">📝</div>
                  <h3>No tasks found</h3>
                </div>
              ) : (
                <div style={{ display: 'grid', gap: 8 }}>
                  {filtered.map(task => (
                    <div
                      key={task.name}
                      className="card card-clickable"
                      onClick={() => openTask(task.name)}
                      style={{
                        padding: 14,
                        border: selected === task.name ? '2px solid var(--accent-purple)' : undefined
                      }}
                    >
                      <div style={{ fontWeight: 600 }}>📝 {task.title || task.name}</div>
                      <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{task.filename}</span>
                        {task.source && <span className="badge badge-pending" style={{ fontSize: 10 }}>{task.source}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Detail */}
            <div>
              {detail ? (
                <div className="card">
                  <h3 style={{ marginBottom: 16 }}>{detail.title || selected}</h3>

                  {detail.purpose && (
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>Purpose</div>
                      <div style={{ fontSize: 14, lineHeight: 1.6 }}>{detail.purpose}</div>
                    </div>
                  )}

                  {detail.elicitation && (
                    <div style={{ marginBottom: 16 }}>
                      <span className="badge badge-active">📝 Elicitation Task</span>
                    </div>
                  )}

                  {detail.instructions && detail.instructions.length > 0 && (
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>Instructions</div>
                      <div style={{ display: 'grid', gap: 8 }}>
                        {detail.instructions.map((inst, i) => (
                          <div key={i} style={{
                            padding: '10px 14px',
                            background: 'var(--bg-input)',
                            borderRadius: 'var(--radius-sm)',
                            border: '1px solid var(--border)'
                          }}>
                            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>
                              {i + 1}. {inst.title}
                            </div>
                            {inst.description && (
                              <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{inst.description}</div>
                            )}
                            {inst.subItems && inst.subItems.length > 0 && (
                              <ul style={{ marginTop: 6, paddingLeft: 20, fontSize: 12, color: 'var(--text-muted)' }}>
                                {inst.subItems.map((sub, j) => <li key={j}>{sub}</li>)}
                              </ul>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {detail.rawContent && (
                    <div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>Raw Content</div>
                      <div className="code-block" style={{ maxHeight: 400, overflow: 'auto' }}>
                        {detail.rawContent}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="empty-state">
                  <p>Select a task to view details</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
