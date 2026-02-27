import React, { useEffect, useState } from 'react';
import { HashRouter as Router, Routes, Route, useNavigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
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

function AppInner() {
  const navigate = useNavigate();

  useEffect(() => {
    // Listen for menu navigation events from Electron
    if (window.bmadAPI?.onNavigate) {
      const cleanup = window.bmadAPI.onNavigate((path) => {
        navigate(path);
      });
      return cleanup;
    }
  }, [navigate]);

  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/agents" element={<Agents />} />
          <Route path="/agents/:name" element={<AgentDetail />} />
          <Route path="/chat" element={<AgentChat />} />
          <Route path="/chat/:agentName" element={<AgentChat />} />
          <Route path="/ai-settings" element={<AISettings />} />
          <Route path="/sessions" element={<Sessions />} />
          <Route path="/queue" element={<QueueMonitor />} />
          <Route path="/workflows" element={<Workflows />} />
          <Route path="/config" element={<ConfigEditor />} />
          <Route path="/checklists" element={<Checklists />} />
          <Route path="/tasks" element={<Tasks />} />
        </Routes>
      </main>
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
