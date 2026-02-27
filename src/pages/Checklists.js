import React, { useEffect, useState } from 'react';
import api from '../api';

export default function Checklists() {
  const [checklists, setChecklists] = useState([]);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.checklists.list().then(c => { setChecklists(c); setLoading(false); });
  }, []);

  const openChecklist = async (name) => {
    setSelected(name);
    const data = await api.checklists.get(name);
    setDetail(data);
  };

  return (
    <>
      <div className="page-header">
        <h2>Checklists</h2>
        <p>BMAD-METHOD quality and process checklists</p>
      </div>

      <div className="page-content animate-in">
        {loading ? (
          <div className="empty-state pulse">Loading checklists...</div>
        ) : (
          <div className="grid-2">
            {/* List */}
            <div>
              <h3 style={{ marginBottom: 12, fontSize: 16 }}>Available Checklists</h3>
              {checklists.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-state-icon">✅</div>
                  <h3>No checklists found</h3>
                </div>
              ) : (
                <div style={{ display: 'grid', gap: 8 }}>
                  {checklists.map(cl => (
                    <div
                      key={cl.name}
                      className="card card-clickable"
                      onClick={() => openChecklist(cl.name)}
                      style={{
                        padding: 14,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        border: selected === cl.name ? '2px solid var(--accent-purple)' : undefined
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 600 }}>✅ {cl.title || cl.name}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{cl.filename}</div>
                      </div>
                      <span className="badge badge-pending">{cl.itemCount} items</span>
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
                  {detail.items && detail.items.length > 0 ? (
                    <div style={{ display: 'grid', gap: 8 }}>
                      {detail.items.map((item, i) => (
                        <label
                          key={i}
                          style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: 10,
                            padding: '10px 14px',
                            background: 'var(--bg-input)',
                            borderRadius: 'var(--radius-sm)',
                            cursor: 'pointer',
                            border: '1px solid var(--border)'
                          }}
                        >
                          <input type="checkbox" style={{ marginTop: 3 }} />
                          <span style={{ fontSize: 13, lineHeight: 1.5 }}>{item.text}</span>
                        </label>
                      ))}
                    </div>
                  ) : detail.rawContent ? (
                    <div className="code-block" style={{ maxHeight: 500, overflow: 'auto' }}>
                      {detail.rawContent}
                    </div>
                  ) : (
                    <p style={{ color: 'var(--text-muted)' }}>No content available</p>
                  )}
                </div>
              ) : (
                <div className="empty-state">
                  <p>Select a checklist to view</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
