/* ─── Markdown Viewer / Editor ────────────────────────────────────────────
 * Inline read + edit of markdown documents from doc projects.
 * Renders markdown to HTML using a simple parser; allows saving edits.
 */
import React, { useEffect, useState, useCallback } from 'react';
import api from '../api';

/**
 * Props:
 *  projectId    — active doc project ID
 *  filePath     — relative path within the project (e.g. "_historique/foo.md")
 *  title        — display title
 *  onClose      — callback when the viewer closes
 */
export default function MarkdownViewer({ projectId, filePath, title, onClose }) {
  const [content, setContent] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [saveMsg, setSaveMsg] = useState('');

  useEffect(() => {
    if (!projectId || !filePath) return;
    setLoading(true);
    setError(null);
    api.docProject.readFile(projectId, filePath)
      .then(res => {
        setContent(res.content || '');
        setDraft(res.content || '');
      })
      .catch(err => setError(err.message || 'Impossible de lire le fichier'))
      .finally(() => setLoading(false));
  }, [projectId, filePath]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await api.docProject.writeFile(projectId, filePath, draft);
      setContent(draft);
      setEditMode(false);
      setSaveMsg('Sauvegardé ✓');
      setTimeout(() => setSaveMsg(''), 2500);
    } catch (err) {
      setError('Sauvegarde échouée : ' + err.message);
    } finally {
      setSaving(false);
    }
  }, [projectId, filePath, draft]);

  const handleKey = useCallback((e) => {
    if (e.key === 'Escape') onClose?.();
    if ((e.ctrlKey || e.metaKey) && e.key === 's' && editMode) {
      e.preventDefault();
      handleSave();
    }
  }, [onClose, editMode, handleSave]);

  useEffect(() => {
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [handleKey]);

  return (
    <div className="md-viewer-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className="md-viewer-panel">
        {/* Header */}
        <div className="md-viewer-header">
          <div className="md-viewer-title">
            <span className="md-viewer-icon">📄</span>
            <span>{title || filePath}</span>
          </div>
          <div className="md-viewer-actions">
            {saveMsg && <span className="md-save-msg">{saveMsg}</span>}
            {!editMode
              ? <button className="btn btn-sm btn-ghost" onClick={() => { setEditMode(true); setDraft(content); }}>✏️ Modifier</button>
              : <>
                  <button className="btn btn-sm btn-ghost" onClick={() => { setEditMode(false); setDraft(content); }}>Annuler</button>
                  <button className="btn btn-sm btn-primary" onClick={handleSave} disabled={saving}>
                    {saving ? '…' : '💾 Sauvegarder'}
                  </button>
                </>
            }
            <button className="btn btn-sm btn-ghost md-viewer-close" onClick={onClose}>✕</button>
          </div>
        </div>

        {/* Body */}
        <div className="md-viewer-body">
          {loading && <div className="md-viewer-loading"><span className="pulse">⟳</span> Chargement…</div>}
          {error && <div className="md-viewer-error">⚠ {error}</div>}

          {!loading && !error && editMode && (
            <textarea
              className="md-editor-textarea"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              spellCheck={false}
              placeholder="Contenu Markdown…"
            />
          )}

          {!loading && !error && !editMode && (
            <MarkdownRenderer content={content} />
          )}
        </div>

        {/* Footer hint */}
        {editMode && (
          <div className="md-viewer-footer">
            <kbd>Ctrl+S</kbd> pour sauvegarder — <kbd>Esc</kbd> pour fermer
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Minimal Markdown → HTML renderer ─────────────────────────────────── */
function MarkdownRenderer({ content }) {
  const html = renderMarkdown(content);
  return <div className="md-rendered" dangerouslySetInnerHTML={{ __html: html }} />;
}

function renderMarkdown(md) {
  if (!md) return '';
  let html = md
    // Code blocks (fenced)
    .replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) =>
      `<pre class="md-code-block"><code class="lang-${lang || 'text'}">${escHtml(code.trimEnd())}</code></pre>`)
    // Inline code
    .replace(/`([^`\n]+)`/g, (_, c) => `<code class="md-inline-code">${escHtml(c)}</code>`)
    // Bold
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    // Headings
    .replace(/^######\s(.+)$/gm, '<h6>$1</h6>')
    .replace(/^#####\s(.+)$/gm,  '<h5>$1</h5>')
    .replace(/^####\s(.+)$/gm,   '<h4>$1</h4>')
    .replace(/^###\s(.+)$/gm,    '<h3>$1</h3>')
    .replace(/^##\s(.+)$/gm,     '<h2>$1</h2>')
    .replace(/^#\s(.+)$/gm,      '<h1>$1</h1>')
    // HR
    .replace(/^---+$/gm, '<hr />')
    // Unordered list
    .replace(/^[-*]\s(.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, m => `<ul>${m}</ul>`)
    // Ordered list
    .replace(/^\d+\.\s(.+)$/gm, '<li>$1</li>')
    // Blockquote
    .replace(/^>\s(.+)$/gm, '<blockquote>$1</blockquote>')
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    // YAML front-matter block — style it
    .replace(/^---\n([\s\S]*?)\n---\n?/, '<div class="md-frontmatter"><pre>$1</pre></div>');

  // Paragraphs: wrap consecutive non-block lines
  html = html
    .split('\n')
    .map(line => {
      if (/^<(h[1-6]|ul|ol|li|pre|blockquote|hr|div)/.test(line.trim()) || line.trim() === '') return line;
      return `<p>${line}</p>`;
    })
    .join('\n');

  return html;
}

function escHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
