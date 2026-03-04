/* ─── DocHistory Page ─────────────────────────────────────────────────────
 * Browsable history of all documentation saved by BMAD agents.
 * Lists all projects and lets you browse _historique/ + agent folders.
 */
import React, { useEffect, useState, useCallback } from 'react';
import api from '../api';
import MarkdownViewer from '../components/MarkdownViewer';

const AGENT_LABELS = {
  '01-analyse':         { label: 'Analyse',         icon: '📊' },
  '02-architecture':    { label: 'Architecture',     icon: '🏗️' },
  '03-product':         { label: 'Product Owner',    icon: '📦' },
  '04-gestion-projet':  { label: 'Gestion Projet',  icon: '📋' },
  '05-ux-design':       { label: 'UX Design',        icon: '🎨' },
  '06-developpement':   { label: 'Développement',    icon: '💻' },
  '07-qualite':         { label: 'Qualité / Tests',  icon: '🐛' },
  '08-scrum':           { label: 'Scrum Master',     icon: '🏃' },
  '09-master':          { label: 'BMAD Master',      icon: '🧙' },
  '10-orchestrateur':   { label: 'Orchestrateur',    icon: '🎭' },
  '_historique':        { label: 'Historique',       icon: '📚' },
};

export default function DocHistory() {
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [tree, setTree] = useState([]);
  const [selectedSection, setSelectedSection] = useState(null);
  const [loading, setLoading] = useState(true);
  const [treeLoading, setTreeLoading] = useState(false);
  const [viewer, setViewer] = useState(null); // { filePath, title }
  const [creating, setCreating] = useState(false);
  const [newProjName, setNewProjName] = useState('');
  const [exporting, setExporting] = useState(false);

  // Load projects on mount
  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [list, active] = await Promise.all([
          api.docProject.list(),
          api.docProject.getActive(),
        ]);
        setProjects(list || []);
        const activeId = active?.id || list?.[0]?.id || null;
        if (activeId) setSelectedProjectId(activeId);
      } catch (err) {
        console.error('DocHistory load error', err);
      }
      setLoading(false);
    }
    load();
  }, []);

  // Load tree when project changes
  useEffect(() => {
    if (!selectedProjectId) return;
    setTreeLoading(true);
    api.docProject.tree(selectedProjectId)
      .then(t => {
        setTree(t || []);
        // Default to _historique section if it has files
        const hist = (t || []).find(s => s.dir === '_historique');
        setSelectedSection(hist?.documents?.length ? hist : (t?.[0] || null));
      })
      .catch(() => setTree([]))
      .finally(() => setTreeLoading(false));
  }, [selectedProjectId]);

  const switchProject = useCallback(async (id) => {
    setSelectedProjectId(id);
    await api.docProject.setActive(id);
  }, []);

  const handleCreateProject = useCallback(async () => {
    if (!newProjName.trim()) return;
    try {
      const proj = await api.docProject.create({ name: newProjName.trim() });
      setProjects(prev => [...prev, proj]);
      setSelectedProjectId(proj.id);
      await api.docProject.setActive(proj.id);
      setNewProjName('');
      setCreating(false);
    } catch (err) {
      alert('Erreur création projet : ' + err.message);
    }
  }, [newProjName]);

  const handleExport = useCallback(async () => {
    if (!selectedProjectId) return;
    setExporting(true);
    try {
      const result = await api.docProject.exportZip(selectedProjectId);
      if (!result?.canceled) {
        api.notify('📦 Export réussi', `Projet exporté vers ${result.path || 'archive.zip'}`);
      }
    } catch (err) {
      alert('Export échoué : ' + err.message);
    }
    setExporting(false);
  }, [selectedProjectId]);

  const selectedProject = projects.find(p => p.id === selectedProjectId);
  const sectionDocs = selectedSection?.documents || [];

  if (loading) {
    return (
      <div className="page-content">
        <div className="empty-state"><div className="empty-state-icon pulse">📚</div><h3>Chargement…</h3></div>
      </div>
    );
  }

  return (
    <>
      {/* Markdown viewer overlay */}
      {viewer && (
        <MarkdownViewer
          projectId={selectedProjectId}
          filePath={viewer.filePath}
          title={viewer.title}
          onClose={() => setViewer(null)}
        />
      )}

      <div className="page-header">
        <h2>📚 Historique documentaire</h2>
        <p>Consultez et modifiez tous les documents générés par vos agents BMAD</p>
      </div>

      <div className="page-content animate-in" style={{ display: 'flex', gap: 0, padding: 0, overflow: 'hidden' }}>
        {/* ── Left panel: project list ──────────────────────── */}
        <div className="history-sidebar">
          <div className="history-sidebar-header">
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>Projets</span>
            <button className="btn btn-sm btn-ghost" onClick={() => setCreating(v => !v)}>+ Nouveau</button>
          </div>

          {creating && (
            <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
              <input
                className="input"
                style={{ marginBottom: 6 }}
                value={newProjName}
                onChange={e => setNewProjName(e.target.value)}
                placeholder="Nom du projet…"
                onKeyDown={e => { if (e.key === 'Enter') handleCreateProject(); if (e.key === 'Escape') setCreating(false); }}
                autoFocus
              />
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn btn-sm btn-primary" style={{ flex: 1 }} onClick={handleCreateProject}>Créer</button>
                <button className="btn btn-sm btn-ghost" onClick={() => setCreating(false)}>Annuler</button>
              </div>
            </div>
          )}

          <div style={{ flex: 1, overflowY: 'auto' }}>
            {projects.length === 0 && (
              <div style={{ padding: '24px 16px', color: 'var(--text-muted)', fontSize: 13, textAlign: 'center' }}>
                Aucun projet.<br />Créez-en un pour commencer.
              </div>
            )}
            {projects.map(proj => (
              <button
                key={proj.id}
                className={`history-proj-item${proj.id === selectedProjectId ? ' active' : ''}`}
                onClick={() => switchProject(proj.id)}
              >
                <span className="history-proj-icon">📁</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {proj.name}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{proj.documentCount || 0} doc(s)</div>
                </div>
              </button>
            ))}
          </div>

          {selectedProjectId && (
            <div style={{ padding: 12, borderTop: '1px solid var(--border)' }}>
              <button
                className="btn btn-ghost"
                style={{ width: '100%', fontSize: 12 }}
                onClick={handleExport}
                disabled={exporting}
              >
                {exporting ? '⏳ Export…' : '📦 Exporter ZIP'}
              </button>
            </div>
          )}
        </div>

        {/* ── Middle panel: folder sections ─────────────────── */}
        <div className="history-sections-panel">
          {treeLoading && <div style={{ padding: 24, color: 'var(--text-muted)' }}>Chargement…</div>}
          {!treeLoading && tree.length === 0 && (
            <div style={{ padding: 24, color: 'var(--text-muted)', textAlign: 'center' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>📭</div>
              <div>Aucun document dans ce projet.</div>
              <div style={{ fontSize: 12, marginTop: 6 }}>Démarrez une conversation avec un agent pour générer des documents.</div>
            </div>
          )}
          {!treeLoading && tree.map(section => {
            const meta = AGENT_LABELS[section.dir] || { label: section.label || section.dir, icon: '📂' };
            const isSelected = selectedSection?.dir === section.dir;
            return (
              <button
                key={section.dir}
                className={`history-section-item${isSelected ? ' active' : ''}`}
                onClick={() => setSelectedSection(section)}
              >
                <span style={{ fontSize: 18 }}>{meta.icon}</span>
                <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{meta.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{section.count || 0} fichier(s)</div>
                </div>
              </button>
            );
          })}
        </div>

        {/* ── Right panel: document list ─────────────────────── */}
        <div className="history-docs-panel">
          {!selectedSection && (
            <div className="empty-state" style={{ paddingTop: 80 }}>
              <div className="empty-state-icon">📄</div>
              <div>Sélectionnez un dossier</div>
            </div>
          )}

          {selectedSection && sectionDocs.length === 0 && (
            <div className="empty-state" style={{ paddingTop: 80 }}>
              <div className="empty-state-icon">📭</div>
              <div>Aucun document dans ce dossier</div>
            </div>
          )}

          {selectedSection && sectionDocs.length > 0 && (
            <>
              <div className="history-docs-header">
                <span style={{ fontWeight: 600, fontSize: 14 }}>
                  {(AGENT_LABELS[selectedSection.dir] || {}).icon || '📂'} {selectedSection.label || selectedSection.dir}
                </span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{sectionDocs.length} fichier(s)</span>
              </div>
              <div className="history-docs-list">
                {sectionDocs.map((doc) => {
                  // Extract timestamp + title from filename (e.g. 20240115-120000-dev-code-my-title.md)
                  const parts = doc.name.replace('.md', '').split('-');
                  const dateStr = parts[0]; // YYYYMMDD
                  const displayDate = dateStr?.length === 8
                    ? `${dateStr.slice(6, 8)}/${dateStr.slice(4, 6)}/${dateStr.slice(0, 4)}`
                    : '';
                  const displayName = doc.name.replace(/^\d{8}-\d{6}-/, '').replace('.md', '').replace(/-/g, ' ');

                  return (
                    <button
                      key={doc.path}
                      className="history-doc-item"
                      onClick={() => setViewer({ filePath: doc.path, title: displayName })}
                    >
                      <span className="history-doc-icon">📝</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="history-doc-name">{displayName}</div>
                        {displayDate && <div className="history-doc-date">{displayDate}</div>}
                      </div>
                      <span className="history-doc-arrow">→</span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
