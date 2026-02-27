import React, { useEffect, useState } from 'react';
import api from '../api';

export default function Workflows() {
  const [workflows, setWorkflows] = useState([]);
  const [agents, setAgents] = useState([]);
  const [selected, setSelected] = useState(null);
  const [teams, setTeams] = useState([]);
  const [tab, setTab] = useState('workflows');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.workflows.list(),
      api.agents.list(),
      api.config.getTeams(),
    ]).then(([w, a, t]) => {
      setWorkflows(w);
      setAgents(a);
      setTeams(t);
      setLoading(false);
    });
  }, []);

  const agentColors = {
    'bmad-master': '#7c3aed', 'bmad-orchestrator': '#3b82f6', 'pm': '#10b981',
    'architect': '#f97316', 'dev': '#06b6d4', 'qa': '#ef4444',
    'ux-expert': '#ec4899', 'sm': '#f59e0b', 'analyst': '#8b5cf6', 'po': '#14b8a6'
  };

  const agentIcons = {
    'bmad-master': '🧙', 'bmad-orchestrator': '🎭', 'pm': '📋',
    'architect': '🏗️', 'dev': '💻', 'qa': '🐛',
    'ux-expert': '🎨', 'sm': '🏃', 'analyst': '📊', 'po': '📦'
  };

  return (
    <>
      <div className="page-header">
        <h2>Workflows & Teams</h2>
        <p>Visualize development workflows and agent team configurations</p>
      </div>

      <div className="page-content animate-in">
        <div className="tabs">
          <button className={`tab ${tab === 'workflows' ? 'active' : ''}`} onClick={() => setTab('workflows')}>
            Workflows
          </button>
          <button className={`tab ${tab === 'teams' ? 'active' : ''}`} onClick={() => setTab('teams')}>
            Agent Teams
          </button>
          <button className={`tab ${tab === 'visualizer' ? 'active' : ''}`} onClick={() => setTab('visualizer')}>
            Visual Map
          </button>
        </div>

        {loading ? (
          <div className="empty-state pulse">Loading...</div>
        ) : tab === 'workflows' ? (
          <div className="grid-2">
            {/* Workflow List */}
            <div>
              <h3 style={{ marginBottom: 12, fontSize: 16 }}>Available Workflows</h3>
              {workflows.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-state-icon">🔀</div>
                  <h3>No workflows found</h3>
                  <p>Workflows are loaded from bmad-core/workflows/</p>
                </div>
              ) : (
                <div style={{ display: 'grid', gap: 8 }}>
                  {workflows.map(w => (
                    <div
                      key={w.name}
                      className="card card-clickable"
                      onClick={() => setSelected(w)}
                      style={{
                        padding: 14,
                        border: selected?.name === w.name ? '2px solid var(--accent-purple)' : undefined
                      }}
                    >
                      <div style={{ fontWeight: 600 }}>🔀 {w.title || w.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{w.filename}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Workflow Detail */}
            <div>
              {selected ? (
                <div className="card">
                  <h3 style={{ marginBottom: 16 }}>{selected.title || selected.name}</h3>
                  <div className="code-block" style={{ maxHeight: 600, overflow: 'auto' }}>
                    {selected.rawContent}
                  </div>
                </div>
              ) : (
                <div className="empty-state">
                  <p>Select a workflow to view details</p>
                </div>
              )}
            </div>
          </div>

        ) : tab === 'teams' ? (
          <div>
            {teams.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">👥</div>
                <h3>No teams configured</h3>
              </div>
            ) : (
              <div className="grid-2">
                {teams.map(team => (
                  <div key={team.name} className="card">
                    <h3 style={{ marginBottom: 16 }}>
                      👥 {team.name.replace('team-', '').replace(/-/g, ' ').replace(/^\w/, c => c.toUpperCase())}
                    </h3>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16, fontFamily: 'var(--font-mono)' }}>
                      {team.name}.yaml
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {(team.config?.agents || team.config?.team?.agents || Object.keys(team.config || {})).map(agentName => {
                        const name = typeof agentName === 'object' ? agentName.name || Object.keys(agentName)[0] : agentName;
                        return (
                          <div key={name} style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            padding: '8px 14px',
                            background: 'var(--bg-tertiary)',
                            borderRadius: 'var(--radius-sm)',
                            borderLeft: `3px solid ${agentColors[name] || '#666'}`,
                          }}>
                            <span>{agentIcons[name] || '🤖'}</span>
                            <span style={{ fontSize: 13 }}>{name}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        ) : (
          /* Visual Map */
          <div className="workflow-canvas">
            <h3 style={{ marginBottom: 24, textAlign: 'center', color: 'var(--text-muted)' }}>
              BMAD Agent Interaction Map
            </h3>

            {/* Orchestration Layer */}
            <div style={{ textAlign: 'center', marginBottom: 32 }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 2 }}>Orchestration</div>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 16 }}>
                {agents.filter(a => ['bmad-master', 'bmad-orchestrator'].includes(a.name)).map(a => (
                  <div key={a.name} className="workflow-node" style={{ borderColor: agentColors[a.name] }}>
                    <span style={{ fontSize: 24 }}>{a.icon || '🤖'}</span>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{a.title}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{a.name}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Arrow */}
            <div style={{ textAlign: 'center', fontSize: 24, color: 'var(--text-muted)', marginBottom: 16 }}>↓</div>

            {/* Planning Layer */}
            <div style={{ textAlign: 'center', marginBottom: 32 }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 2 }}>Planning & Analysis</div>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 16, flexWrap: 'wrap' }}>
                {agents.filter(a => ['analyst', 'po', 'pm', 'architect'].includes(a.name)).map(a => (
                  <div key={a.name} className="workflow-node" style={{ borderColor: agentColors[a.name] }}>
                    <span style={{ fontSize: 24 }}>{a.icon || '🤖'}</span>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{a.title}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{a.name}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Arrow */}
            <div style={{ textAlign: 'center', fontSize: 24, color: 'var(--text-muted)', marginBottom: 16 }}>↓</div>

            {/* Execution Layer */}
            <div style={{ textAlign: 'center', marginBottom: 32 }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 2 }}>Execution & Quality</div>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 16, flexWrap: 'wrap' }}>
                {agents.filter(a => ['dev', 'qa', 'ux-expert', 'sm'].includes(a.name)).map(a => (
                  <div key={a.name} className="workflow-node" style={{ borderColor: agentColors[a.name] }}>
                    <span style={{ fontSize: 24 }}>{a.icon || '🤖'}</span>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{a.title}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{a.name}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Legend */}
            <div style={{ marginTop: 32, padding: 16, background: 'var(--bg-card)', borderRadius: 'var(--radius-sm)', display: 'flex', gap: 24, flexWrap: 'wrap', justifyContent: 'center' }}>
              {agents.map(a => (
                <div key={a.name} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 2, background: agentColors[a.name] || '#666', display: 'inline-block' }} />
                  <span>{a.icon} {a.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
