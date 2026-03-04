import React, { useEffect, useState } from 'react';
import { HashRouter as Router, Routes, Route, useNavigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import CommandPalette from './components/CommandPalette';
import Dashboard from './pages/Dashboard';
import Agents from './pages/Agents';
import AgentDetail from './pages/AgentDetail';
import AgentChat from './pages/AgentChat';
import AISettings from './pages/AISettings';
import Sessions from './pages/Sessions';
import QueueMonitor from './pages/QueueMonitor';
import Workflows from './pages/Workflows';
import ConfigEditor from './pages/ConfigEditor';
import Checklists from './pages/Checklists';
import Tasks from './pages/Tasks';
import PartyChat from './pages/PartyChat';
import DocHistory from './pages/DocHistory';

function AppInner() {
  const navigate = useNavigate();
  const [cmdOpen, setCmdOpen] = useState(false);

  useEffect(() => {
    // Listen for menu navigation events from Electron
    if (window.bmadAPI?.onNavigate) {
      const cleanup = window.bmadAPI.onNavigate((path) => {
        navigate(path);
      });
      return cleanup;
    }
  }, [navigate]);

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      // Ctrl+K / ⌘K — command palette
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setCmdOpen(v => !v);
      }
      // Ctrl+1…9 — quick navigation (already handled by menu in Electron, but add fallback)
      if ((e.ctrlKey || e.metaKey) && e.key === '1') { e.preventDefault(); navigate('/'); }
      if ((e.ctrlKey || e.metaKey) && e.key === '2') { e.preventDefault(); navigate('/agents'); }
      if ((e.ctrlKey || e.metaKey) && e.key === '3') { e.preventDefault(); navigate('/sessions'); }
      if ((e.ctrlKey || e.metaKey) && e.key === '4') { e.preventDefault(); navigate('/collaboration'); }
      if ((e.ctrlKey || e.metaKey) && e.key === '5') { e.preventDefault(); navigate('/history'); }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [navigate]);

  return (
    <div className="app-layout">
      <Sidebar onOpenCommandPalette={() => setCmdOpen(true)} />
      <main className="main-content" style={{ position: 'relative' }}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/agents" element={<Agents />} />
          <Route path="/agents/:name" element={<AgentDetail />} />
          <Route path="/chat" element={<AgentChat />} />
          <Route path="/chat/:agentName" element={<AgentChat />} />
          <Route path="/collaboration" element={<PartyChat />} />
          <Route path="/history" element={<DocHistory />} />
          <Route path="/ai-settings" element={<AISettings />} />
          <Route path="/sessions" element={<Sessions />} />
          <Route path="/queue" element={<QueueMonitor />} />
          <Route path="/workflows" element={<Workflows />} />
          <Route path="/config" element={<ConfigEditor />} />
          <Route path="/checklists" element={<Checklists />} />
          <Route path="/tasks" element={<Tasks />} />
        </Routes>
      </main>
      <CommandPalette isOpen={cmdOpen} onClose={() => setCmdOpen(false)} />
    </div>
  );
}

export default function App() {
  return (
    <Router>
      <AppInner />
    </Router>
  );
}
