import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';

export default function Agents() {
  const navigate = useNavigate();
  const [agents, setAgents] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.agents.list().then(a => { setAgents(a); setLoading(false); });
  }, []);

  const filtered = agents.filter(a =>
    a.name.toLowerCase().includes(search.toLowerCase()) ||
    (a.title || '').toLowerCase().includes(search.toLowerCase()) ||
    (a.whenToUse || '').toLowerCase().includes(search.toLowerCase())
  );

  const colorMap = {
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

  return (
    <>
      <div className="page-header">
        <h2>Agents</h2>
        <p>BMAD-METHOD specialized AI agents</p>
      </div>
      <div className="page-content animate-in">
        {/* Search */}
        <div className="search-wrapper" style={{ marginBottom: 24 }}>
          <span className="search-icon">🔍</span>
          <input
            className="search-input"
            placeholder="Search agents by name, role, or capability..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {loading ? (
          <div className="empty-state"><div className="pulse">Loading agents...</div></div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🔍</div>
            <h3>No agents found</h3>
            <p>Try a different search term</p>
          </div>
        ) : (
          <div className="grid-3">
            {filtered.map(agent => (
              <div
                key={agent.name}
                className="card card-clickable"
                onClick={() => navigate(`/agents/${agent.name}`)}
                style={{ position: 'relative', overflow: 'hidden' }}
              >
                {/* Color accent bar */}
                <div style={{
                  position: 'absolute', top: 0, left: 0, right: 0, height: 3,
                  background: colorMap[agent.name] || 'var(--accent-purple)'
                }} />

                <div className="card-header" style={{ marginTop: 4 }}>
                  <div className="card-icon" style={{
                    background: colorMap[agent.name] || 'var(--bg-tertiary)',
                    fontSize: 24
                  }}>
                    {agent.icon || '🤖'}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div className="card-title">{agent.title || agent.name}</div>
                    <div className="card-subtitle" style={{ fontFamily: 'var(--font-mono)' }}>{agent.name}</div>
                  </div>
                </div>

                {agent.whenToUse && (
                  <div className="card-body" style={{ fontSize: 13, marginBottom: 12 }}>
                    {agent.whenToUse}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    className="btn btn-sm btn-primary"
                    onClick={e => {
                      e.stopPropagation();
                      api.sessions.create(agent.name, {}).then(() => navigate('/sessions'));
                    }}
                  >
                    Start Session
                  </button>
                  <button className="btn btn-sm btn-ghost" onClick={e => { e.stopPropagation(); navigate(`/agents/${agent.name}`); }}>
                    Details
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
