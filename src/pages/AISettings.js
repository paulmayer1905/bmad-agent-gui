import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';

const AVAILABLE_MODELS = [
  { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', description: 'Meilleur rapport qualité/prix' },
  { id: 'claude-opus-4-20250514', name: 'Claude Opus 4', description: 'Le plus capable, plus lent' },
  { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', description: 'Rapide et économique' },
  { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', description: 'Bonne performance générale' },
];

export default function AISettings() {
  const navigate = useNavigate();
  const [config, setConfig] = useState(null);
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('claude-sonnet-4-20250514');
  const [maxTokens, setMaxTokens] = useState(4096);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    const load = async () => {
      const cfg = await api.ai.getConfig();
      setConfig(cfg);
      setModel(cfg.model || 'claude-sonnet-4-20250514');
      setMaxTokens(cfg.maxTokens || 4096);
    };
    load();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const updates = { model, maxTokens };
      if (apiKey) {
        updates.apiKey = apiKey;
      }
      await api.ai.updateConfig(updates);
      // Refresh config
      const cfg = await api.ai.getConfig();
      setConfig(cfg);
      setApiKey('');
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err.message || 'Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <h2>🤖 Paramètres IA</h2>
        <p className="page-subtitle">Configuration de l'API Anthropic pour le chat avec les agents</p>
      </div>

      <div className="settings-grid">
        {/* API Key Section */}
        <div className="card settings-card">
          <div className="card-header">
            <h3>🔑 Clé API Anthropic</h3>
          </div>
          <div className="card-body">
            {config?.hasApiKey ? (
              <div className="settings-current-key">
                <span className="badge badge-success">✓ Configurée</span>
                <span className="settings-key-preview">{config.apiKeyPreview}</span>
              </div>
            ) : (
              <div className="settings-no-key">
                <span className="badge badge-warning">Non configurée</span>
                <p>Obtenez votre clé sur <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer">console.anthropic.com</a></p>
              </div>
            )}
            
            <div className="form-group">
              <label>{config?.hasApiKey ? 'Remplacer la clé' : 'Entrez votre clé API'}</label>
              <div className="input-with-toggle">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-ant-api..."
                  className="form-input"
                />
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => setShowKey(!showKey)}
                >
                  {showKey ? '🙈' : '👁️'}
                </button>
              </div>
              <span className="form-help">La clé est stockée localement dans ~/.bmad/ai-config.json</span>
            </div>
          </div>
        </div>

        {/* Model Selection */}
        <div className="card settings-card">
          <div className="card-header">
            <h3>🧠 Modèle</h3>
          </div>
          <div className="card-body">
            <div className="model-grid">
              {AVAILABLE_MODELS.map(m => (
                <div
                  key={m.id}
                  className={`model-option ${model === m.id ? 'selected' : ''}`}
                  onClick={() => setModel(m.id)}
                >
                  <div className="model-option-radio">
                    {model === m.id ? '◉' : '○'}
                  </div>
                  <div className="model-option-info">
                    <strong>{m.name}</strong>
                    <span>{m.description}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Max Tokens */}
        <div className="card settings-card">
          <div className="card-header">
            <h3>📏 Tokens maximum</h3>
          </div>
          <div className="card-body">
            <div className="form-group">
              <label>Nombre maximum de tokens par réponse</label>
              <input
                type="number"
                value={maxTokens}
                onChange={(e) => setMaxTokens(parseInt(e.target.value) || 4096)}
                min={256}
                max={8192}
                step={256}
                className="form-input"
              />
              <span className="form-help">Entre 256 et 8192. Plus élevé = réponses plus longues mais plus coûteuses.</span>
            </div>
          </div>
        </div>
      </div>

      {/* Save */}
      <div className="settings-actions">
        {error && <div className="settings-error">⚠️ {error}</div>}
        {saved && <div className="settings-success">✅ Configuration sauvegardée !</div>}
        <button
          className="btn btn-primary btn-lg"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? '⏳ Sauvegarde...' : '💾 Sauvegarder'}
        </button>
        {config?.hasApiKey && (
          <button
            className="btn btn-secondary btn-lg"
            onClick={() => navigate('/chat')}
          >
            💬 Aller au Chat
          </button>
        )}
      </div>
    </div>
  );
}
