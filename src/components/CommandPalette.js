/* ─── Command Palette ──────────────────────────────────────────────────────
 * Invoked by Ctrl+K (or ⌘K on Mac).
 * Lets users quickly navigate pages and trigger actions.
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

const COMMANDS = [
  // Navigation
  { id: 'home',          label: 'Accueil — Dashboard',          icon: '🏠', action: '/', type: 'nav' },
  { id: 'chat',          label: 'Discuter — Nouveau chat',       icon: '💬', action: '/chat', type: 'nav' },
  { id: 'collaboration', label: 'Collaboration multi-agents',    icon: '🎉', action: '/collaboration', type: 'nav' },
  { id: 'agents',        label: 'Liste des agents',              icon: '🤖', action: '/agents', type: 'nav' },
  { id: 'history',       label: 'Historique documentaire',       icon: '📚', action: '/history', type: 'nav' },
  { id: 'tasks',         label: 'Tâches BMAD',                  icon: '📝', action: '/tasks', type: 'nav' },
  { id: 'checklists',    label: 'Checklists',                   icon: '✅', action: '/checklists', type: 'nav' },
  { id: 'workflows',     label: 'Workflows',                    icon: '🔀', action: '/workflows', type: 'nav' },
  { id: 'ai-settings',   label: 'Paramètres IA',               icon: '🧠', action: '/ai-settings', type: 'nav' },
  { id: 'sessions',      label: 'Gérer les sessions',           icon: '🔄', action: '/sessions', type: 'nav' },
  { id: 'queue',         label: "File d'attente",               icon: '📨', action: '/queue', type: 'nav' },
  { id: 'config',        label: 'Configuration',                icon: '⚙️', action: '/config', type: 'nav' },
  // ─── Agents rapides ─────────────────────────────────────────────────
  { id: 'party-mode',    label: 'Party Mode — Tous les agents',  icon: '🎊', action: '/collaboration', type: 'nav' },
  { id: 'orchestrator',  label: 'Orchestrateur — Coordination',  icon: '🎭', action: '/chat/bmad-orchestrator', type: 'nav' },
  { id: 'master',        label: 'Master — Expert universel',     icon: '🧙', action: '/chat/bmad-master', type: 'nav' },
];

export default function CommandPalette({ isOpen, onClose }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const filtered = query.trim()
    ? COMMANDS.filter(c => c.label.toLowerCase().includes(query.toLowerCase()))
    : COMMANDS;

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const execute = useCallback((cmd) => {
    if (!cmd) return;
    if (cmd.type === 'nav') navigate(cmd.action);
    if (cmd.fn) cmd.fn();
    onClose();
  }, [navigate, onClose]);

  const handleKey = useCallback((e) => {
    if (e.key === 'Escape') { onClose(); return; }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      execute(filtered[selectedIndex]);
    }
  }, [onClose, filtered, selectedIndex, execute]);

  // Reset selection when query changes
  useEffect(() => setSelectedIndex(0), [query]);

  if (!isOpen) return null;

  return (
    <div className="cmd-overlay" onClick={onClose}>
      <div className="cmd-palette" onClick={(e) => e.stopPropagation()}>
        <div className="cmd-search-row">
          <span className="cmd-search-icon">🔍</span>
          <input
            ref={inputRef}
            className="cmd-input"
            placeholder="Rechercher une commande…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKey}
            autoComplete="off"
            spellCheck={false}
          />
          <kbd className="cmd-esc-hint">ESC</kbd>
        </div>

        <div className="cmd-list" ref={listRef}>
          {filtered.length === 0 && (
            <div className="cmd-empty">Aucune commande trouvée</div>
          )}
          {filtered.map((cmd, i) => (
            <button
              key={cmd.id}
              className={`cmd-item${i === selectedIndex ? ' cmd-item-selected' : ''}`}
              onClick={() => execute(cmd)}
              onMouseEnter={() => setSelectedIndex(i)}
            >
              <span className="cmd-item-icon">{cmd.icon}</span>
              <span className="cmd-item-label">{cmd.label}</span>
              {cmd.type === 'nav' && <span className="cmd-item-hint">↵</span>}
            </button>
          ))}
        </div>

        <div className="cmd-footer">
          <span><kbd>↑↓</kbd> naviguer</span>
          <span><kbd>↵</kbd> ouvrir</span>
          <span><kbd>Esc</kbd> fermer</span>
          <span style={{ marginLeft: 'auto', color: 'var(--text-muted)', fontSize: 11 }}>Ctrl+K</span>
        </div>
      </div>
    </div>
  );
}
