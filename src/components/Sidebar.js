import React, { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import api from '../api';

const navItems = [
  { section: 'Overview' },
  { path: '/', icon: '📊', label: 'Dashboard' },
  { section: 'Agents' },
  { path: '/chat', icon: '💬', label: 'Chat Agent', highlight: true },
  { path: '/agents', icon: '🤖', label: 'Tous les Agents' },
  { path: '/sessions', icon: '🔄', label: 'Sessions' },
  { section: 'Operations' },
  { path: '/queue', icon: '📨', label: 'Queue Monitor' },
  { path: '/workflows', icon: '🔀', label: 'Workflows' },
  { section: 'Resources' },
  { path: '/checklists', icon: '✅', label: 'Checklists' },
  { path: '/tasks', icon: '📝', label: 'Tasks' },
  { section: 'System' },
  { path: '/ai-settings', icon: '🤖', label: 'Paramètres IA' },
  { path: '/config', icon: '⚙️', label: 'Configuration' },
];

export default function Sidebar() {
  const location = useLocation();
  const [health, setHealth] = useState({ status: 'checking' });
  const [sessionCount, setSessionCount] = useState(0);
  const [queueActive, setQueueActive] = useState(0);

  useEffect(() => {
    const load = async () => {
      try {
        const [h, s, m] = await Promise.all([
          api.system.health(),
          api.sessions.list(),
          api.queue.metrics(),
        ]);
        setHealth(h);
        setSessionCount(s.filter(x => x.status === 'active').length);
        setQueueActive(m.active);
      } catch (err) {
        setHealth({ status: 'error' });
      }
    };
    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, []);

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon">🧠</div>
          <div className="sidebar-logo-text">
            <h1>BMAD</h1>
            <span>Agent Control Center</span>
          </div>
        </div>
      </div>

      <nav className="sidebar-nav">
        {navItems.map((item, i) => {
          if (item.section) {
            return <div key={i} className="nav-section-title">{item.section}</div>;
          }
          let badge = null;
          if (item.path === '/sessions' && sessionCount > 0) badge = sessionCount;
          if (item.path === '/queue' && queueActive > 0) badge = queueActive;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `nav-link ${isActive && (item.path === '/' ? location.pathname === '/' : true) ? 'active' : ''}`
              }
              end={item.path === '/'}
            >
              <span className="nav-link-icon">{item.icon}</span>
              <span>{item.label}</span>
              {badge != null && <span className="nav-link-badge">{badge}</span>}
            </NavLink>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        <div className="sidebar-health">
          <span className={`health-dot ${health.status === 'healthy' ? '' : health.status === 'degraded' ? 'degraded' : 'error'}`}></span>
          <span>
            {health.status === 'healthy' ? 'All systems operational' :
             health.status === 'degraded' ? 'Degraded mode' :
             health.status === 'checking' ? 'Checking...' : 'Connection error'}
          </span>
        </div>
      </div>
    </aside>
  );
}
