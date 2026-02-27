# BMAD Agent GUI

Application desktop Electron + React pour gérer l'écosystème BMAD-METHOD.

## Prérequis

- Node.js v18+
- npm v9+

## Installation

```bash
cd bmad-agent-gui
npm install
```

## Développement

### Mode React seul (navigateur)
```bash
npm start
```
Ouvre `http://localhost:3000` avec des données mock.

### Mode Electron (application desktop)
```bash
npm run electron:dev
```
Lance l'app Electron connectée aux vrais modules BMAD.

## Build & Packaging

```bash
npm run electron:build
```
Génère un exécutable dans `dist/`.

## Architecture

```
bmad-agent-gui/
├── public/
│   ├── electron.js      # Main process Electron
│   ├── preload.js        # Bridge sécurisé IPC
│   └── index.html
├── src/
│   ├── backend/
│   │   └── bmad-backend.js   # Pont vers bmad-claude-integration/core/
│   ├── components/
│   │   └── Sidebar.js
│   ├── pages/
│   │   ├── Dashboard.js       # Vue d'ensemble
│   │   ├── Agents.js          # Liste des agents
│   │   ├── AgentDetail.js     # Détail d'un agent
│   │   ├── Sessions.js        # Gestion des sessions
│   │   ├── QueueMonitor.js    # Monitoring de la queue
│   │   ├── Workflows.js       # Visualisation workflows
│   │   ├── ConfigEditor.js    # Éditeur de config YAML
│   │   ├── Checklists.js      # Checklists qualité
│   │   └── Tasks.js           # Tâches BMAD
│   ├── styles/
│   │   └── global.css
│   ├── api.js                 # Couche d'abstraction API
│   ├── App.js
│   └── index.js
└── assets/                    # Icônes pour le packaging
```

## Pages

| Page | Description |
|------|-------------|
| **Dashboard** | Stats, actions rapides, santé système |
| **Agents** | Catalogue des 10 agents BMAD avec recherche |
| **Agent Detail** | Définition complète, commandes, sections |
| **Sessions** | Sessions actives/suspendues, création, historique |
| **Queue Monitor** | Messages actifs/complétés/échoués, graphique 24h |
| **Workflows** | Workflows, équipes, carte visuelle des agents |
| **Config Editor** | Édition YAML, vue visuelle, infos système |
| **Checklists** | Checklists interactives avec cases à cocher |
| **Tasks** | Définitions de tâches avec instructions structurées |
