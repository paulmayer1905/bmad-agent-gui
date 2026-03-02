import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';

const ANTHROPIC_MODELS = [
  { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', description: 'Meilleur rapport qualité/prix' },
  { id: 'claude-opus-4-20250514', name: 'Claude Opus 4', description: 'Le plus capable, plus lent' },
  { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', description: 'Rapide et économique' },
  { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', description: 'Bonne performance générale' },
];

const OLLAMA_SUGGESTED = [
  { id: 'llama3.1', name: 'Llama 3.1 8B', description: 'Très bon généraliste, rapide' },
  { id: 'llama3.1:70b', name: 'Llama 3.1 70B', description: 'Excellent, nécessite 40+ GB RAM' },
  { id: 'mistral', name: 'Mistral 7B', description: 'Rapide et compétent' },
  { id: 'qwen2.5:14b', name: 'Qwen 2.5 14B', description: 'Très bon en code' },
  { id: 'gemma2', name: 'Gemma 2 9B', description: 'Par Google, bon généraliste' },
  { id: 'deepseek-coder-v2', name: 'DeepSeek Coder V2', description: 'Excellent pour le code' },
];

const GEMINI_MODELS = [
  { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', description: 'Rapide et gratuit, très bon généraliste' },
  { id: 'gemini-2.0-flash-lite', name: 'Gemini 2.0 Flash Lite', description: 'Ultra rapide, réponses courtes' },
  { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', description: 'Plus capable, contexte 1M tokens' },
  { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', description: 'Bon équilibre vitesse/qualité' },
];

export default function AISettings() {
  const navigate = useNavigate();
  const [config, setConfig] = useState(null);
  const [provider, setProvider] = useState('ollama');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('llama3.1');
  const [maxTokens, setMaxTokens] = useState(4096);
  const [ollamaUrl, setOllamaUrl] = useState('http://localhost:11434');
  const [ollamaStatus, setOllamaStatus] = useState(null);
  const [ollamaModels, setOllamaModels] = useState([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);
  const [showKey, setShowKey] = useState(false);
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [checkingOllama, setCheckingOllama] = useState(false);
  const [validatingKey, setValidatingKey] = useState(false);
  const [keyValidation, setKeyValidation] = useState(null); // { valid, error, note }

  useEffect(() => {
    const load = async () => {
      const cfg = await api.ai.getConfig();
      setConfig(cfg);
      setProvider(cfg.provider || 'ollama');
      setModel(cfg.model || (cfg.provider === 'anthropic' ? 'claude-sonnet-4-20250514' : 'llama3.1'));
      setMaxTokens(cfg.maxTokens || 4096);
      setOllamaUrl(cfg.ollamaUrl || 'http://localhost:11434');
    };
    load();
  }, []);

  // Check Ollama status on load and when provider changes
  useEffect(() => {
    if (provider === 'ollama') {
      checkOllama();
    }
  }, [provider]);

  const checkOllama = async () => {
    setCheckingOllama(true);
    try {
      const status = await api.ai.ollamaStatus();
      setOllamaStatus(status.available);
      setOllamaModels(status.models || []);
    } catch {
      setOllamaStatus(false);
      setOllamaModels([]);
    }
    setCheckingOllama(false);
  };

  const handleProviderChange = (p) => {
    setProvider(p);
    setKeyValidation(null);
    if (p === 'ollama') {
      setModel('llama3.1');
    } else if (p === 'gemini') {
      setModel('gemini-2.0-flash');
    } else {
      setModel('claude-sonnet-4-20250514');
    }
  };

  const handleValidateKey = async (providerName, key) => {
    if (!key.trim()) return;
    setValidatingKey(true);
    setKeyValidation(null);
    try {
      const result = await api.ai.validateKey(providerName, key);
      setKeyValidation(result);
    } catch (err) {
      setKeyValidation({ valid: false, error: err.message || 'Erreur de validation' });
    } finally {
      setValidatingKey(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const updates = { provider, model, maxTokens, ollamaUrl };
      if (apiKey) updates.apiKey = apiKey;
      if (geminiApiKey) updates.geminiApiKey = geminiApiKey;
      await api.ai.updateConfig(updates);
      const cfg = await api.ai.getConfig();
      setConfig(cfg);
      setApiKey('');
      setGeminiApiKey('');
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err.message || 'Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  const availableModels = provider === 'ollama'
    ? (ollamaModels.length > 0 ? ollamaModels : OLLAMA_SUGGESTED)
    : provider === 'gemini' ? GEMINI_MODELS
    : ANTHROPIC_MODELS;

  const isOllamaModelInstalled = (modelId) => {
    return ollamaModels.some(m => m.id === modelId || m.id.startsWith(modelId + ':'));
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <h2>🤖 Paramètres IA</h2>
        <p className="page-subtitle">Configuration du fournisseur IA pour le chat avec les agents</p>
      </div>

      <div className="settings-grid">
        {/* Provider Selection */}
        <div className="card settings-card">
          <div className="card-header">
            <h3>🔌 Fournisseur</h3>
          </div>
          <div className="card-body">
            <div className="provider-grid">
              <div
                className={`provider-option ${provider === 'ollama' ? 'selected' : ''}`}
                onClick={() => handleProviderChange('ollama')}
              >
                <div className="provider-option-badge">GRATUIT</div>
                <div className="provider-option-icon">🦙</div>
                <div className="provider-option-info">
                  <strong>Ollama (Local)</strong>
                  <span>Modèles open-source sur votre machine</span>
                  <span className="provider-option-detail">Llama 3, Mistral, Qwen, Gemma...</span>
                </div>
                {provider === 'ollama' && <div className="provider-check">✓</div>}
              </div>
              <div
                className={`provider-option ${provider === 'anthropic' ? 'selected' : ''}`}
                onClick={() => handleProviderChange('anthropic')}
              >
                <div className="provider-option-badge paid">PAYANT</div>
                <div className="provider-option-icon">🧠</div>
                <div className="provider-option-info">
                  <strong>Anthropic Claude</strong>
                  <span>API cloud, très haute qualité</span>
                  <span className="provider-option-detail">Claude Sonnet 4, Opus 4, Haiku...</span>
                </div>
                {provider === 'anthropic' && <div className="provider-check">✓</div>}
              </div>
              <div
                className={`provider-option ${provider === 'gemini' ? 'selected' : ''}`}
                onClick={() => handleProviderChange('gemini')}
              >
                <div className="provider-option-badge">GRATUIT</div>
                <div className="provider-option-icon">✨</div>
                <div className="provider-option-info">
                  <strong>Google Gemini</strong>
                  <span>API cloud gratuite (avec limites)</span>
                  <span className="provider-option-detail">Gemini 2.0 Flash, 1.5 Pro...</span>
                </div>
                {provider === 'gemini' && <div className="provider-check">✓</div>}
              </div>
            </div>
          </div>
        </div>

        {/* Ollama Status */}
        {provider === 'ollama' && (
          <div className="card settings-card">
            <div className="card-header">
              <h3>🦙 Ollama</h3>
            </div>
            <div className="card-body">
              <div className="ollama-status-row">
                <span>Statut :</span>
                {checkingOllama ? (
                  <span className="badge">⏳ Vérification...</span>
                ) : ollamaStatus ? (
                  <span className="badge badge-success">✓ Connecté</span>
                ) : (
                  <span className="badge badge-error">✗ Non disponible</span>
                )}
                <button className="btn btn-ghost btn-sm" onClick={checkOllama} disabled={checkingOllama}>
                  🔄 Tester
                </button>
              </div>

              {!ollamaStatus && !checkingOllama && (
                <div className="ollama-help">
                  <p><strong>Ollama n'est pas détecté.</strong> Pour l'installer :</p>
                  <ol>
                    <li>Téléchargez sur <a href="https://ollama.com/download" target="_blank" rel="noopener noreferrer">ollama.com/download</a></li>
                    <li>Installez et lancez Ollama</li>
                    <li>Ouvrez un terminal et exécutez : <code>ollama pull llama3.1</code></li>
                    <li>Revenez ici et cliquez "Tester"</li>
                  </ol>
                </div>
              )}

              {ollamaStatus && ollamaModels.length > 0 && (
                <div className="ollama-installed">
                  <p className="ollama-installed-label">Modèles installés ({ollamaModels.length}) :</p>
                  <div className="ollama-model-tags">
                    {ollamaModels.map(m => (
                      <span key={m.id} className="ollama-model-tag">
                        {m.name} {m.size && <small>({m.size})</small>}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="form-group" style={{marginTop: 12}}>
                <label>URL Ollama</label>
                <input
                  type="text"
                  value={ollamaUrl}
                  onChange={(e) => setOllamaUrl(e.target.value)}
                  placeholder="http://localhost:11434"
                  className="form-input"
                />
                <span className="form-help">Par défaut : http://localhost:11434</span>
              </div>
            </div>
          </div>
        )}

        {/* Gemini API Key */}
        {provider === 'gemini' && (
          <div className="card settings-card">
            <div className="card-header">
              <h3>🔑 Clé API Google Gemini</h3>
            </div>
            <div className="card-body">
              {config?.hasGeminiKey ? (
                <div className="settings-current-key">
                  <span className="badge badge-success">✓ Configurée</span>
                  <span className="settings-key-preview">{config.geminiKeyPreview}</span>
                </div>
              ) : (
                <div className="settings-no-key">
                  <span className="badge badge-warning">Non configurée</span>
                  <p>Obtenez votre clé gratuite sur <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">Google AI Studio</a></p>
                </div>
              )}
              <div className="form-group">
                <label>{config?.hasGeminiKey ? 'Remplacer la clé' : 'Entrez votre clé API'}</label>
                <div className="input-with-toggle">
                  <input
                    type={showGeminiKey ? 'text' : 'password'}
                    value={geminiApiKey}
                    onChange={(e) => { setGeminiApiKey(e.target.value); setKeyValidation(null); }}
                    placeholder="AIza..."
                    className="form-input"
                  />
                  <button className="btn btn-ghost btn-sm" onClick={() => setShowGeminiKey(!showGeminiKey)}>
                    {showGeminiKey ? '🙈' : '👁️'}
                  </button>
                  <button
                    className="btn btn-sm btn-secondary"
                    onClick={() => handleValidateKey('gemini', geminiApiKey)}
                    disabled={!geminiApiKey.trim() || validatingKey}
                    title="Tester la clé"
                  >
                    {validatingKey ? '⏳' : '✔ Vérifier'}
                  </button>
                </div>
                {keyValidation && (
                  <div className={`key-validation-result ${keyValidation.valid ? 'valid' : 'invalid'}`}>
                    {keyValidation.valid ? '✅ Clé valide !' : `❌ ${keyValidation.error}`}
                    {keyValidation.note && <span> ({keyValidation.note})</span>}
                  </div>
                )}
                <span className="form-help">Gratuit jusqu'à 15 req/min. Stockée dans ~/.bmad/ai-config.json</span>
              </div>
            </div>
          </div>
        )}

        {/* Anthropic API Key */}
        {provider === 'anthropic' && (
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
                    onChange={(e) => { setApiKey(e.target.value); setKeyValidation(null); }}
                    placeholder="sk-ant-api..."
                    className="form-input"
                  />
                  <button className="btn btn-ghost btn-sm" onClick={() => setShowKey(!showKey)}>
                    {showKey ? '🙈' : '👁️'}
                  </button>
                  <button
                    className="btn btn-sm btn-secondary"
                    onClick={() => handleValidateKey('anthropic', apiKey)}
                    disabled={!apiKey.trim() || validatingKey}
                    title="Tester la clé"
                  >
                    {validatingKey ? '⏳' : '✔ Vérifier'}
                  </button>
                </div>
                {keyValidation && (
                  <div className={`key-validation-result ${keyValidation.valid ? 'valid' : 'invalid'}`}>
                    {keyValidation.valid ? '✅ Clé valide !' : `❌ ${keyValidation.error}`}
                    {keyValidation.note && <span> ({keyValidation.note})</span>}
                  </div>
                )}
                <span className="form-help">Stockée localement dans ~/.bmad/ai-config.json</span>
              </div>
            </div>
          </div>
        )}

        {/* Model Selection */}
        <div className="card settings-card">
          <div className="card-header">
            <h3>🧠 Modèle</h3>
          </div>
          <div className="card-body">
            <div className="model-grid">
              {availableModels.map(m => {
                const installed = provider === 'ollama' && ollamaModels.length > 0
                  ? isOllamaModelInstalled(m.id)
                  : true;
                return (
                  <div
                    key={m.id}
                    className={`model-option ${model === m.id ? 'selected' : ''} ${!installed ? 'not-installed' : ''}`}
                    onClick={() => setModel(m.id)}
                  >
                    <div className="model-option-radio">
                      {model === m.id ? '◉' : '○'}
                    </div>
                    <div className="model-option-info">
                      <strong>
                        {m.name}
                        {provider === 'ollama' && installed && <span className="model-installed-badge"> ✓</span>}
                        {provider === 'ollama' && !installed && ollamaModels.length > 0 && <span className="model-not-installed-badge"> (non installé)</span>}
                      </strong>
                      <span>{m.description || (m.size ? `Taille : ${m.size}` : '')}</span>
                    </div>
                  </div>
                );
              })}
            </div>
            {provider === 'ollama' && (
              <div className="form-help" style={{marginTop: 12}}>
                Pour installer un modèle : <code>ollama pull nom-du-modele</code>
              </div>
            )}
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
              <span className="form-help">Entre 256 et 8192.</span>
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
        <button
          className="btn btn-secondary btn-lg"
          onClick={() => navigate('/chat')}
        >
          💬 Aller au Chat
        </button>
      </div>
    </div>
  );
}
