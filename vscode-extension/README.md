# BMAD Agent Launcher — Extension VS Code

Extension VS Code qui ajoute les agents BMAD dans la liste déroulante du **panneau Chat**.

## Agents disponibles

| Participant | Agent | Description |
|---|---|---|
| `@bmad-party` | 🎊 Party Mode | Sollicite tous les agents et synthétise leurs réponses |
| `@bmad-orchestrator` | 🎭 Orchestrateur | Coordination multi-agents, workflows, guidance |
| `@bmad-master` | 🧙 Master | Expert universel, exécute toutes les tâches |
| `@bmad-analyst` | 📊 Analyste | Recherche, analyse de marché, PRD |
| `@bmad-architect` | 🏗️ Architecte | Architecture logicielle, design patterns |
| `@bmad-pm` | 📋 Chef de Projet | Planification, épiques, user stories |
| `@bmad-dev` | 💻 Développeur | Implémentation, code review |
| `@bmad-qa` | 🧪 QA | Stratégie de test, validation qualité |
| `@bmad-po` | 📝 Product Owner | Backlog, stories, critères d'acceptation |
| `@bmad-sm` | 🔄 Scrum Master | Sprints, rituels agile |
| `@bmad-ux` | 🎨 UX Expert | Wireframes, design système |

## Utilisation

1. Ouvrez le panneau Chat de VS Code (`Ctrl+Shift+I`)
2. Dans la liste déroulante, sélectionnez un agent BMAD
3. Posez votre question

### Party Mode

```
@bmad-party Comment structurer notre architecture microservices ?
```

Tous les agents pertinents donneront leur perspective.

### Commandes slash

Pour l'Orchestrateur et le Master :

- `/help` — Aide et commandes
- `/task [nom]` — Lister ou exécuter une tâche
- `/workflow [nom]` — Lister ou lancer un workflow
- `/agent [nom]` — Lister les agents
- `/checklist [nom]` — Lister ou exécuter une checklist

## Installation

### Depuis le code source

```bash
cd bmad-agent-gui/vscode-extension
npm install -g @vscode/vsce   # si pas déjà installé
vsce package                   # crée bmad-agent-launcher-1.0.0.vsix
code --install-extension bmad-agent-launcher-1.0.0.vsix
```

### Installation directe (dev)

```bash
# Créer un lien symbolique dans le dossier extensions VS Code
# Windows :
mklink /D "%USERPROFILE%\.vscode\extensions\bmad-agent-launcher" "C:\travail\bmad\bmad-agent-gui\vscode-extension"
```

Puis relancez VS Code.

## Prérequis

- VS Code ≥ 1.93
- GitHub Copilot Chat (extension `github.copilot-chat`)
- Le dossier `bmad-core` accessible dans le workspace ou en parent

## Architecture

L'extension charge les personas depuis `bmad-core/agents/*.md` et utilise l'API `vscode.lm` (Language Model) pour envoyer les messages au modèle actif (Copilot/Claude) avec le system prompt de l'agent sélectionné.

Le Party Mode synthétise les perspectives de tous les spécialistes en une seule réponse coordonnée.
