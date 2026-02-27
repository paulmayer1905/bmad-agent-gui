import React, { useEffect, useState } from 'react';
import api from '../api';

export default function ConfigEditor() {
  const [config, setConfig] = useState({ raw: '', parsed: {}, path: '' });
  const [editedContent, setEditedContent] = useState('');
  const [sysInfo, setSysInfo] = useState({});
  const [tab, setTab] = useState('editor');
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.config.get(),
      api.system.info(),
    ]).then(([c, s]) => {
      setConfig(c);
      setEditedContent(c.raw);
      setSysInfo(s);
      setLoading(false);
    });
  }, []);

  const handleSave = async () => {
    await api.config.update(editedContent);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const hasChanges = editedContent !== config.raw;

  return (
    <>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h2>Configuration</h2>
            <p>BMAD core configuration and system settings</p>
          </div>
          {tab === 'editor' && (
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              {saved && <span style={{ color: 'var(--accent-green)', fontSize: 14 }}>✓ Saved!</span>}
              {hasChanges && <span style={{ color: 'var(--accent-yellow)', fontSize: 12 }}>Unsaved changes</span>}
              <button className="btn btn-secondary" onClick={() => setEditedContent(config.raw)} disabled={!hasChanges}>
                Reset
              </button>
              <button className="btn btn-primary" onClick={handleSave} disabled={!hasChanges}>
                💾 Save
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="page-content animate-in">
        <div className="tabs">
          <button className={`tab ${tab === 'editor' ? 'active' : ''}`} onClick={() => setTab('editor')}>
            Config Editor
          </button>
          <button className={`tab ${tab === 'visual' ? 'active' : ''}`} onClick={() => setTab('visual')}>
            Visual View
          </button>
          <button className={`tab ${tab === 'system' ? 'active' : ''}`} onClick={() => setTab('system')}>
            System Info
          </button>
        </div>

        {loading ? (
          <div className="empty-state pulse">Loading configuration...</div>

        ) : tab === 'editor' ? (
          <div>
            <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                {config.path || 'core-config.yaml'}
              </span>
            </div>
            <div className="config-editor">
              <textarea
                value={editedContent}
                onChange={e => setEditedContent(e.target.value)}
                spellCheck={false}
              />
            </div>
          </div>

        ) : tab === 'visual' ? (
          <div>
            {config.parsed && Object.keys(config.parsed).length > 0 ? (
              <div style={{ display: 'grid', gap: 16 }}>
                {Object.entries(config.parsed).map(([key, value]) => (
                  <div key={key} className="card">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                      <h3 style={{ fontSize: 16 }}>{key}</h3>
                      <span className="badge badge-pending" style={{ fontSize: 10 }}>
                        {typeof value === 'object' ? 'object' : typeof value}
                      </span>
                    </div>
                    {typeof value === 'object' && value !== null ? (
                      <div style={{ display: 'grid', gap: 8 }}>
                        {Object.entries(value).map(([k, v]) => (
                          <div key={k} style={{
                            padding: '10px 14px',
                            background: 'var(--bg-input)',
                            borderRadius: 'var(--radius-sm)',
                            border: '1px solid var(--border)',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                          }}>
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--accent-purple-light)' }}>{k}</span>
                            <span style={{ fontSize: 13, color: typeof v === 'boolean' ? (v ? 'var(--accent-green)' : 'var(--accent-red)') : 'var(--text-secondary)' }}>
                              {typeof v === 'boolean' ? (v ? 'true ✓' : 'false ✗') : String(v)}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{
                        padding: '10px 14px',
                        background: 'var(--bg-input)',
                        borderRadius: 'var(--radius-sm)',
                        fontFamily: 'var(--font-mono)',
                        fontSize: 13,
                        color: typeof value === 'boolean' ? (value ? 'var(--accent-green)' : 'var(--accent-red)') : 'var(--text-secondary)'
                      }}>
                        {String(value)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <div className="empty-state-icon">⚙️</div>
                <h3>No configuration parsed</h3>
              </div>
            )}
          </div>

        ) : (
          /* System Info */
          <div className="grid-2">
            <div className="card">
              <h3 style={{ marginBottom: 16 }}>System Information</h3>
              <div style={{ display: 'grid', gap: 12 }}>
                {Object.entries(sysInfo).map(([key, value]) => (
                  <div key={key} style={{
                    padding: '10px 14px',
                    background: 'var(--bg-input)',
                    borderRadius: 'var(--radius-sm)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    border: '1px solid var(--border)'
                  }}>
                    <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{key}</span>
                    <span style={{
                      fontSize: 13,
                      fontFamily: 'var(--font-mono)',
                      color: typeof value === 'boolean' ? (value ? 'var(--accent-green)' : 'var(--accent-red)') : 'var(--text-primary)'
                    }}>
                      {typeof value === 'boolean' ? (value ? '✓ Yes' : '✗ No') : String(value)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="card">
              <h3 style={{ marginBottom: 16 }}>Paths</h3>
              <div style={{ display: 'grid', gap: 12 }}>
                {['bmadRoot', 'integrationRoot', 'coreRoot', 'basePath'].map(key => (
                  sysInfo[key] && (
                    <div key={key} style={{
                      padding: '10px 14px',
                      background: 'var(--bg-input)',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border)'
                    }}>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase' }}>{key}</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, wordBreak: 'break-all' }}>{sysInfo[key]}</div>
                    </div>
                  )
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
