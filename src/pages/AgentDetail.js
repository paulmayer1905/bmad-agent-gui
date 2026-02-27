import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api';

export default function AgentDetail() {
  const { name } = useParams();
  const navigate = useNavigate();
  const [agent, setAgent] = useState(null);
  const [metadata, setMetadata] = useState(null);
  const [tab, setTab] = useState('overview');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.agents.get(name),
      api.agents.getMetadata(name)
    ]).then(([a, m]) => {
      setAgent(a);
      setMetadata(m);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [name]);

  if (loading) {
    return <div className="page-content"><div className="empty-state pulse">Loading agent...</div></div>;
  }

  if (!agent) {
    return (
      <div className="page-content">
        <div className="empty-state">
          <div className="empty-state-icon">❌</div>
          <h3>Agent not found</h3>
          <button className="btn btn-primary" onClick={() => navigate('/agents')}>Back to Agents</button>
        </div>
      </div>
    );
  }

  const sections = agent.sections || {};
  const sectionNames = Object.keys(sections);

  return (
    <>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button className="btn btn-ghost" onClick={() => navigate('/agents')}>← Back</button>
          <div>
            <h2>{metadata?.icon || '🤖'} {metadata?.title || agent.title || name}</h2>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>{name}</p>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button
              className="btn btn-primary"
              onClick={() => navigate(`/chat/${name}`)}
            >
              💬 Chat
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => api.sessions.create(name, {}).then(() => navigate('/sessions'))}
            >
              🚀 Start Session
            </button>
          </div>
        </div>
      </div>

      <div className="page-content animate-in">
        {/* Tabs */}
        <div className="tabs">
          <button className={`tab ${tab === 'overview' ? 'active' : ''}`} onClick={() => setTab('overview')}>Overview</button>
          <button className={`tab ${tab === 'raw' ? 'active' : ''}`} onClick={() => setTab('raw')}>Raw Definition</button>
          {agent.commands && <button className={`tab ${tab === 'commands' ? 'active' : ''}`} onClick={() => setTab('commands')}>Commands</button>}
          {sectionNames.length > 0 && <button className={`tab ${tab === 'sections' ? 'active' : ''}`} onClick={() => setTab('sections')}>Sections</button>}
        </div>

        {tab === 'overview' && (
          <div className="grid-2">
            <div>
              {/* Metadata */}
              <div className="card" style={{ marginBottom: 16 }}>
                <h3 style={{ marginBottom: 16 }}>Agent Information</h3>
                <div style={{ display: 'grid', gap: 12 }}>
                  {metadata?.whenToUse && (
                    <div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>When to Use</div>
                      <div style={{ fontSize: 14 }}>{metadata.whenToUse}</div>
                    </div>
                  )}
                  {agent.persona && (
                    <div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Persona</div>
                      <div style={{ fontSize: 14 }}>{typeof agent.persona === 'string' ? agent.persona : JSON.stringify(agent.persona)}</div>
                    </div>
                  )}
                  {agent.activationInstructions && (
                    <div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Activation</div>
                      <div style={{ fontSize: 14 }}>{agent.activationInstructions}</div>
                    </div>
                  )}
                </div>
              </div>

              {/* Dependencies */}
              {metadata?.dependencies && Object.keys(metadata.dependencies).length > 0 && (
                <div className="card">
                  <h3 style={{ marginBottom: 12 }}>Dependencies</h3>
                  {Object.entries(metadata.dependencies).map(([cat, items]) => (
                    <div key={cat} style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>{cat}</div>
                      {Array.isArray(items) ? (
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {items.map(item => (
                            <span key={item} className="badge badge-pending">{typeof item === 'string' ? item : item.name || JSON.stringify(item)}</span>
                          ))}
                        </div>
                      ) : (
                        <span className="badge badge-pending">{String(items)}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              {/* Commands */}
              {agent.commands && (
                <div className="card">
                  <h3 style={{ marginBottom: 12 }}>Available Commands</h3>
                  <div style={{ display: 'grid', gap: 8 }}>
                    {(Array.isArray(agent.commands) ? agent.commands : Object.entries(agent.commands)).map((cmd, i) => {
                      const cmdName = Array.isArray(cmd) ? cmd[0] : (typeof cmd === 'string' ? cmd : cmd.name || cmd);
                      const cmdDesc = Array.isArray(cmd) ? cmd[1] : (typeof cmd === 'object' ? cmd.description : '');
                      return (
                        <div key={i} style={{
                          padding: '10px 14px',
                          background: 'var(--bg-input)',
                          borderRadius: 'var(--radius-sm)',
                          border: '1px solid var(--border)'
                        }}>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--accent-purple-light)' }}>
                            {typeof cmdName === 'string' ? cmdName : JSON.stringify(cmdName)}
                          </div>
                          {cmdDesc && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{typeof cmdDesc === 'string' ? cmdDesc : JSON.stringify(cmdDesc)}</div>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'raw' && (
          <div className="code-block">
            {agent.rawContent || 'No raw content available.'}
          </div>
        )}

        {tab === 'commands' && agent.commands && (
          <div className="card">
            <h3 style={{ marginBottom: 16 }}>All Commands</h3>
            <pre style={{ fontFamily: 'var(--font-mono)', fontSize: 13, whiteSpace: 'pre-wrap' }}>
              {JSON.stringify(agent.commands, null, 2)}
            </pre>
          </div>
        )}

        {tab === 'sections' && (
          <div style={{ display: 'grid', gap: 16 }}>
            {sectionNames.map(name => (
              <div key={name} className="card">
                <h3 style={{ marginBottom: 12 }}>{name}</h3>
                <div className="md-viewer" style={{ whiteSpace: 'pre-wrap' }}>
                  {sections[name]}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
