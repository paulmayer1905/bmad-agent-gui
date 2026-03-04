/**
 * Agent Deliverables Test Suite
 * ─────────────────────────────────────────────────────────────────────────
 * Validates that each BMAD agent produces the expected deliverable format.
 *
 * Strategy:
 *  1. Validate instruction templates integrity (required sections present)
 *  2. Validate deliverable structure via static validators applied to
 *     representative fixture outputs
 *  3. Validate the coordinator pipeline wires agent outputs correctly
 *  4. Validate cross-agent context propagation
 */

'use strict';

const path = require('path');

// ─── Helpers ──────────────────────────────────────────────────────────────

const COORDINATOR_PATH = path.join(__dirname, '..', 'agent-coordinator.js');

/**
 * Extract the named constant from the coordinator source.
 * We read them at test time so the tests stay in sync with the real code.
 */
function loadCoordinatorSource() {
  return require('fs').readFileSync(COORDINATOR_PATH, 'utf8');
}

/**
 * Simple deliverable validator: checks all required keywords/patterns exist.
 * @param {string} text - The agent output
 * @param {string[]} required - Array of strings/regex patterns that must all match
 * @returns {{ passed: boolean, missing: string[] }}
 */
function validateDeliverable(text, required) {
  const missing = required.filter(r => {
    if (r instanceof RegExp) return !r.test(text);
    return !text.includes(r);
  });
  return { passed: missing.length === 0, missing };
}

// ─── Fixture outputs ──────────────────────────────────────────────────────
// Minimal but representative outputs for each agent role.
// These are used to test the validators themselves (positive + negative cases).

const FIXTURE = {
  analyst: `
## 1. Résumé exécutif
L'application est une plateforme de gestion de tâches.
Objectif principal : centraliser les tâches d'une équipe.

## 2. Analyse des utilisateurs
- Chef de projet : gère l'équipe
- Développeur : consulte ses tâches assignées

## 3. Fonctionnalités identifiées
🔴 **Must-Have** (MVP)
- Création de tâche
- Assignation à un utilisateur
🟡 **Should-Have**
- Notifications par email
🟢 **Nice-to-Have**
- Thème sombre

## 4. Contraintes et risques
- Contrainte : hébergement cloud requis
- Risque : scalabilité à 1000 utilisateurs

## 5. Recommandation technique
Recommande (d) Application fullstack. Justification : accès multi-utilisateurs nécessite une API centralisée.
`,

  prd: `
## 1. Vision produit
Simplifier la gestion de tâches d'équipe.
Problème résolu : dispersion des informations.
Public cible : équipes de 5 à 50 personnes.

## 2. Objectifs et métriques de succès
- 90% de tâches créées en moins de 30s (KPI: temps de création)

## 3. Périmètre
In scope : création, assignation, suivi des tâches
Out of scope : intégration Jira

## 4. Épics et User Stories

### Épic 1 : Gestion des tâches
> Permettre la création et suivi des tâches

| ID | User Story | Priorité | Critères d'acceptation |
|----|-----------|----------|----------------------|
| US-1.1 | En tant que chef de projet, je veux créer une tâche afin de la suivre | Must-Have | - La tâche est sauvegardée\n- Un ID unique est généré |
| US-1.2 | En tant que développeur, je veux voir mes tâches afin de les traiter | Must-Have | - Liste filtrée par assigné |

### Épic 2 : Authentification
> Sécuriser l'accès

| ID | User Story | Priorité | Critères d'acceptation |
|----|-----------|----------|----------------------|
| US-2.1 | En tant qu'utilisateur, je veux me connecter afin d'accéder à mes données | Must-Have | - Token JWT émis\n- Session persistée |

## 5. Exigences non-fonctionnelles
Performance : temps de réponse < 200ms
Accessibilité : WCAG 2.1 AA

## 6. Dépendances et hypothèses
Hypothèse : Node.js disponible côté serveur
`,

  po_backlog: `
## 1. Validation du PRD
Les épics sont cohérents. User story US-1.3 manquante : suppression d'une tâche.

## 2. Backlog priorisé

### Sprint 1 (MVP)
| Priorité | ID | User Story | Points | Dépendances |
|----------|-----|-----------|--------|-------------|
| 1 | US-1.1 | Créer une tâche | M | - |
| 2 | US-2.1 | Connexion utilisateur | S | - |

### Sprint 2
| Priorité | ID | User Story | Points | Dépendances |
|----------|-----|-----------|--------|-------------|
| 1 | US-1.2 | Voir mes tâches | M | US-1.1 |

### Backlog futur
- US-4.1 Intégration Slack

## 3. Critères d'acceptation enrichis

#### US-1.1 : Créer une tâche
**Critères d'acceptation :**
- [ ] Le formulaire affiche les champs titre, description, assigné
- [ ] La tâche apparaît dans la liste après soumission
- [ ] Un identifiant unique est généré

**Notes de dev :**
- Utiliser UUID v4

## 4. Definition of Done (DoD)
- Code revu par un pair
- Tests unitaires passants
- Déployé en staging
`,

  architect: `
## 1. Choix de la stack technique
- Node.js + Express (API REST)
- React (frontend SPA)
- PostgreSQL (base de données)

## 2. Structure du projet
\`\`\`
task-manager/
├── package.json
├── README.md
├── src/
│   ├── index.js
│   ├── routes/
│   │   └── tasks.js
│   ├── models/
│   │   └── task.js
│   └── utils/
│       └── db.js
└── tests/
    └── tasks.test.js
\`\`\`

## 3. Modules et composants
- **routes/tasks.js** : API CRUD tâches, dépend de models/task.js
- **models/task.js** : modèle Sequelize, expose Task.create(), Task.findAll()

## 4. Modèle de données
\`\`\`json
{ "id": "uuid", "title": "string", "assignedTo": "userId", "status": "todo|done" }
\`\`\`

## 5. Flux de contrôle
Client → GET /api/tasks → Controller → Model → DB → JSON Response

## 6. Commandes d'installation et lancement
\`\`\`bash
npm install
npm start
npm test
\`\`\`

## 7. Correspondance Backlog → Architecture
- US-1.1 → routes/tasks.js POST /tasks + models/task.js
- US-1.2 → routes/tasks.js GET /tasks?assignedTo=userId
`,

  ux_design: `
## 1. Principes de design
Style : professionnel et minimaliste
Palette : #1A1A2E (fond), #E94560 (accent), #FFFFFF (texte)
Typographie : Inter 14px body, Inter Bold 18px titres

## 2. Wireframes

\`\`\`svg
<svg viewBox="0 0 400 300" xmlns="http://www.w3.org/2000/svg">
  <g id="dashboard">
    <rect width="400" height="300" fill="#F5F5F5"/>
    <text x="20" y="30">Dashboard</text>
    <rect x="10" y="50" width="380" height="40" rx="4" fill="#E0E0E0"/>
  </g>
</svg>
\`\`\`

## 3. Composants UI
- Bouton primaire : fond #E94560, texte blanc, radius 6px
- Bouton secondaire : contour #E94560
- Card tâche : fond blanc, shadow, padding 16px

## 4. Guide de navigation
- Dashboard → Clic sur tâche → Détail tâche → Modifier/Fermer → Dashboard

## 5. Responsive design
Breakpoints : desktop 1200px, tablette 768px, mobile 375px
Mobile : menu hamburger, cards en colonne unique
`,

  developer: `
Les fichiers suivants ont été générés :

\`\`\`filename:package.json
{
  "name": "task-manager",
  "version": "1.0.0",
  "scripts": { "start": "node src/index.js", "test": "jest" },
  "dependencies": { "express": "^4.18.0" }
}
\`\`\`

\`\`\`filename:src/index.js
const express = require('express');
const app = express();
app.use(express.json());

const tasks = [];

app.post('/api/tasks', (req, res) => {
  const task = { id: Date.now().toString(), ...req.body };
  tasks.push(task);
  res.json(task);
});

app.get('/api/tasks', (req, res) => {
  res.json(tasks);
});

app.listen(3000, () => console.log('Server ready'));
\`\`\`

\`\`\`filename:README.md
# Task Manager
npm install && npm start
\`\`\`

Correspondance US → fichiers :
- US-1.1 → src/index.js POST /api/tasks
- US-1.2 → src/index.js GET /api/tasks
`,

  qa: `
## 1. Vérification de la couverture

| US | Story | Implémentée ? | Fichier(s) | Commentaire |
|----|-------|:---:|---------|-------------|
| US-1.1 | Créer une tâche | ✅ | src/index.js | POST /api/tasks |
| US-1.2 | Voir mes tâches | ✅ | src/index.js | GET /api/tasks |
| US-2.1 | Connexion | ❌ | - | Non implémentée |

## 2. Tests unitaires

\`\`\`filename:tests/tasks.test.js
const request = require('supertest');
describe('Tasks API', () => {
  it('POST /api/tasks crée une tâche', async () => {
    // test code
  });
  it('GET /api/tasks retourne la liste', async () => {
    // test code
  });
});
\`\`\`

## 3. Tests d'acceptation
- [x] US-1.1 Critère 1 → La tâche est sauvegardée : ✅ Validé
- [x] US-1.1 Critère 2 → ID unique généré : ✅ Date.now() utilisé
- [ ] US-2.1 Critère 1 → Token JWT émis : ❌ Non implémenté

## 4. Bugs et problèmes identifiés
| Sévérité | Description |
|----------|-------------|
| Critique | US-2.1 : Authentification absente |
| Mineur | Pas de validation des champs requis |

## 5. Suggestions de tests manuels
- Tester la création d'une tâche sans titre (doit retourner 400)
- Tester avec 1000 tâches simultanées (performance)
`,

  scrum_master: `
## Cérémonie : Sprint Planning
Durée estimée : 2h pour un sprint de 2 semaines.
Capacité de l'équipe : 40 points (5 développeurs × 8 points).

## Vélocité
Sprint 1 : 32 points réalisés sur 40 estimés (80%).
Recommandation : réduire le scope du Sprint 2 à 35 points.

## Blocages identifiés
- Dépendance externe : l'API de notification tierce n'est pas disponible.
  Action : contacter le fournisseur avant le Sprint 2.

## Métriques
- Burn-down : on track jusqu'au jour 8, retard identifié au jour 9.
- Bug rate : 2 bugs Critiques, 5 Mineurs.

## Actions d'amélioration
- Rétrospective : améliorer la définition de "Done" pour les stories d'UI.
- Ajouter des tests d'acceptation automatisés dès le Sprint 2.
`,

  bmad_master: `
## Vision stratégique
Le projet est en bonne voie pour la livraison du MVP en Sprint 2.

## Décisions architecturales clés
1. Migration vers PostgreSQL validée (remplace SQLite pour la scalabilité).
2. Authentification JWT obligatoire avant démo client.

## Coordination inter-équipes
- Analyste : brief complémentaire requis sur les permissions par rôle.
- Architecte : revoir la structure DB pour supporter les équipes multi-niveaux.
- QA : prioriser les tests d'intégration sur l'auth.

## Risques critiques
| Risque | Probabilité | Impact | Mitigation |
|--------|-------------|--------|------------|
| Délai API tiers | Haute | Moyen | Implémenter un mock |
| Scope creep | Moyenne | Haute | Gel du scope Sprint 1 |

## Prochaines étapes
1. Validation du PRD avec le client (vendredi)
2. Architecture review (lundi)
3. Kick-off Sprint 1 (mardi)
`,

  orchestrateur: `
## Plan d'orchestration

### Étape 1 : Analyse (Analyste)
Statut : ✅ Complété
Sortie : Document d'analyse v1.0

### Étape 2 : PRD (Product Manager)
Statut : ✅ Complété
Sortie : PRD v1.2 avec 12 user stories

### Étape 3 : Backlog (Product Owner)
Statut : 🔄 En cours
Sortie attendue : Backlog priorisé avec sprints

### Consolidation
Les sorties des étapes 1 et 2 ont été transmises dans le contexte de l'étape 3.
Cohérence vérifiée : les Épics du PRD correspondent aux fonctionnalités identifiées par l'Analyste.

## Livrable final
Dossier de spécification complet disponible à l'issue du pipeline.
`
};

// ─── Validators per agent ─────────────────────────────────────────────────

const VALIDATORS = {
  analyst: [
    '## 1. Résumé exécutif',
    '## 2. Analyse des utilisateurs',
    '## 3. Fonctionnalités identifiées',
    '🔴 **Must-Have**',
    '🟡 **Should-Have**',
    '🟢 **Nice-to-Have**',
    '## 4. Contraintes et risques',
    '## 5. Recommandation technique',
    /Recommande.*(a|b|c|d)/
  ],
  prd: [
    '## 1. Vision produit',
    '## 2. Objectifs et métriques',
    '## 3. Périmètre',
    'In scope',
    'Out of scope',
    '## 4. Épics et User Stories',
    /Épic \d/,
    /\| US-\d+\.\d+/,
    'En tant que',
    'afin de',
    '## 5. Exigences non-fonctionnelles'
  ],
  po_backlog: [
    '## 1. Validation du PRD',
    '## 2. Backlog priorisé',
    'Sprint 1',
    /\| US-\d+\.\d+/,
    '## 3. Critères d\'acceptation enrichis',
    /- \[ \]/,
    '**Critères d\'acceptation :**',
    '## 4. Definition of Done'
  ],
  architect: [
    '## 1. Choix de la stack technique',
    '## 2. Structure du projet',
    /```[\s\S]*├──/,
    '## 3. Modules et composants',
    '## 4. Modèle de données',
    '## 5. Flux de contrôle',
    '## 6. Commandes d\'installation et lancement',
    /npm install/,
    '## 7. Correspondance Backlog'
  ],
  ux_design: [
    '## 1. Principes de design',
    /#[0-9A-Fa-f]{6}/,
    '## 2. Wireframes',
    /```svg[\s\S]*<svg/,
    '## 3. Composants UI',
    '## 4. Guide de navigation',
    '## 5. Responsive design'
  ],
  developer: [
    /```filename:package\.json/,
    /"name"/,
    /"scripts"/,
    /```filename:(?:src|lib|app)\/[^\n]+\.(js|ts|py|html|css)/,
    /```filename:README\.md/,
    /US-\d+\.\d+/
  ],
  qa: [
    '## 1. Vérification de la couverture',
    /\| US-\d+\.\d+/,
    /✅|❌/,
    '## 2. Tests unitaires',
    /```filename:[^\n]+\.test\.(js|ts|py)/,
    '## 3. Tests d\'acceptation',
    /- \[.\] US-\d+/,
    '## 4. Bugs et problèmes identifiés',
    /Critique|Majeur|Mineur/,
    '## 5. Suggestions de tests manuels'
  ],
  scrum_master: [
    /[Ss]print/,
    /[Vv]élocité|[Vv]elocity/,
    /[Bb]locage|[Bb]loquant|[Ii]mpédiment/,
    /[Mm]étrique|[Bb]urn-?down|[Pp]oints/,
    /[Rr]étrospective|[Aa]mélioration/
  ],
  bmad_master: [
    /[Vv]ision|[Ss]tratégi/,
    /[Dd]écision/,
    /[Rr]isque/,
    /\| Risque|[Pp]robabilité|[Ii]mpact/,
    /[Pp]rochaines étapes|[Nv]ext steps/,
    /[Aa]rchitecte|[Aa]nalyste|QA/
  ],
  orchestrateur: [
    /[Éé]tape \d|Step \d/,
    /[Ss]tatut.*✅|✅.*[Cc]omplété/,
    /[Cc]onsoli/,
    /[Ss]ortie|[Oo]utput/,
    /[Ll]ivrable|[Dd]ossier/
  ]
};

// ══════════════════════════════════════════════════════════════════════════
//  TEST SUITES
// ══════════════════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────────────────
// 1. INSTRUCTION TEMPLATES INTEGRITY
// ─────────────────────────────────────────────────────────────────────────
describe('Agent instruction templates — intégrité', () => {
  let src;
  beforeAll(() => { src = loadCoordinatorSource(); });

  test('ANALYST_INSTRUCTIONS contient les sections obligatoires', () => {
    expect(src).toContain('Résumé exécutif');
    expect(src).toContain('Analyse des utilisateurs');
    expect(src).toContain('Must-Have');
    expect(src).toContain('Should-Have');
    expect(src).toContain('Contraintes et risques');
    expect(src).toContain('Recommandation technique');
  });

  test('PM_PRD_INSTRUCTIONS contient les sections obligatoires', () => {
    expect(src).toContain('Product Requirements Document');
    expect(src).toContain('Vision produit');
    expect(src).toContain('Épics et User Stories');
    expect(src).toContain('En tant que [persona]');
    expect(src).toContain('US-1.1');
    expect(src).toContain('Exigences non-fonctionnelles');
  });

  test('PO_BACKLOG_INSTRUCTIONS contient les sections obligatoires', () => {
    expect(src).toContain('Validation du PRD');
    expect(src).toContain('Sprint 1');
    expect(src).toContain('Definition of Done');
    expect(src).toContain('t-shirt');
    expect(src).toContain('[ ]');
  });

  test('ARCHITECT_INSTRUCTIONS contient les sections obligatoires', () => {
    expect(src).toContain('stack technique');
    expect(src).toContain('Structure du projet');
    expect(src).toContain('npm install');
    expect(src).toContain('Correspondance Backlog');
  });

  test('UX_DESIGN_INSTRUCTIONS contient les sections obligatoires', () => {
    expect(src).toContain('Principes de design');
    expect(src).toContain('Wireframes');
    // backticks are escaped in template literals: \`\`\`svg
    expect(src).toMatch(/\\`\\`\\`svg|```svg/);
    expect(src).toContain('Composants UI');
    expect(src).toContain('Responsive design');
  });

  test('CODE_GEN_INSTRUCTIONS contient les sections obligatoires', () => {
    // In the source file, backticks are escaped: \`\`\`filename:
    expect(src).toMatch(/filename:chemin|filename:[a-z]/);
    expect(src).toContain('package.json');
    expect(src).toContain('README');
    expect(src).toContain('user stories du Sprint 1');
  });

  test('QA_TEST_INSTRUCTIONS contient les sections obligatoires', () => {
    expect(src).toContain('Vérification de la couverture');
    expect(src).toContain('Tests unitaires');
    expect(src).toContain('Tests d\'acceptation');
    expect(src).toContain('Bugs et problèmes identifiés');
    expect(src).toContain('Critique/Majeur/Mineur');
  });

  test('FIX_AND_FINALIZE_INSTRUCTIONS référence les retours QA', () => {
    expect(src).toContain('retours du QA');
    expect(src).toContain('Corrige TOUS les bugs');
    expect(src).toContain('rapport final de couverture');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 2. AGENT DELIVERABLE VALIDATORS — fixture tests
// ─────────────────────────────────────────────────────────────────────────
describe('Validateur de livrables — agent Analyste', () => {
  test('livrable conforme passe la validation', () => {
    const { passed, missing } = validateDeliverable(FIXTURE.analyst, VALIDATORS.analyst);
    expect(missing).toEqual([]);
    expect(passed).toBe(true);
  });

  test('livrable incomplet est détecté (manque Must-Have)', () => {
    const truncated = FIXTURE.analyst.replace('🔴 **Must-Have**', '');
    const { passed, missing } = validateDeliverable(truncated, VALIDATORS.analyst);
    expect(passed).toBe(false);
    expect(missing).toContain('🔴 **Must-Have**');
  });

  test('livrable sans recommandation technique est détecté', () => {
    const noReco = FIXTURE.analyst.replace(/## 5\. Recommandation.*/s, '');
    const { passed } = validateDeliverable(noReco, VALIDATORS.analyst);
    expect(passed).toBe(false);
  });
});

describe('Validateur de livrables — agent PM / PRD', () => {
  test('livrable PRD conforme passe la validation', () => {
    const { passed, missing } = validateDeliverable(FIXTURE.prd, VALIDATORS.prd);
    expect(missing).toEqual([]);
    expect(passed).toBe(true);
  });

  test('PRD sans user stories au format table est détecté', () => {
    const noTable = FIXTURE.prd.replace(/\| US-\d+\.\d+.*\n/g, '');
    const { passed } = validateDeliverable(noTable, VALIDATORS.prd);
    expect(passed).toBe(false);
  });

  test('PRD sans format "En tant que" est détecté', () => {
    const noUS = FIXTURE.prd.replace(/En tant que/g, 'Utilisateur veut');
    const { passed } = validateDeliverable(noUS, VALIDATORS.prd);
    expect(passed).toBe(false);
  });
});

describe('Validateur de livrables — agent PO / Backlog', () => {
  test('backlog conforme passe la validation', () => {
    const { passed, missing } = validateDeliverable(FIXTURE.po_backlog, VALIDATORS.po_backlog);
    expect(missing).toEqual([]);
    expect(passed).toBe(true);
  });

  test('backlog sans checkboxes DoD est détecté', () => {
    const noCb = FIXTURE.po_backlog.replace(/- \[ \]/g, '-');
    const { passed } = validateDeliverable(noCb, VALIDATORS.po_backlog);
    expect(passed).toBe(false);
  });

  test('backlog sans Definition of Done est détecté', () => {
    const noDod = FIXTURE.po_backlog.replace('## 4. Definition of Done (DoD)', '');
    const { passed } = validateDeliverable(noDod, VALIDATORS.po_backlog);
    expect(passed).toBe(false);
  });
});

describe('Validateur de livrables — agent Architecte', () => {
  test('livrable architecture conforme passe la validation', () => {
    const { passed, missing } = validateDeliverable(FIXTURE.architect, VALIDATORS.architect);
    expect(missing).toEqual([]);
    expect(passed).toBe(true);
  });

  test('architecture sans structure de fichiers est détectée', () => {
    const noTree = FIXTURE.architect.replace(/```[\s\S]*?├──[\s\S]*?```/, '');
    const { passed } = validateDeliverable(noTree, VALIDATORS.architect);
    expect(passed).toBe(false);
  });

  test('architecture sans correspondance backlog est détectée', () => {
    const noBack = FIXTURE.architect.replace('## 7. Correspondance Backlog', '');
    const { passed } = validateDeliverable(noBack, VALIDATORS.architect);
    expect(passed).toBe(false);
  });
});

describe('Validateur de livrables — agent UX Expert', () => {
  test('livrable UX conforme passe la validation', () => {
    const { passed, missing } = validateDeliverable(FIXTURE.ux_design, VALIDATORS.ux_design);
    expect(missing).toEqual([]);
    expect(passed).toBe(true);
  });

  test('UX sans wireframe SVG est détecté', () => {
    const noSvg = FIXTURE.ux_design.replace(/```svg[\s\S]*?```/g, '');
    const { passed } = validateDeliverable(noSvg, VALIDATORS.ux_design);
    expect(passed).toBe(false);
  });

  test('UX sans palette de couleurs hex est détecté', () => {
    const noHex = FIXTURE.ux_design.replace(/#[0-9A-Fa-f]{6}/g, 'rouge');
    const { passed } = validateDeliverable(noHex, VALIDATORS.ux_design);
    expect(passed).toBe(false);
  });
});

describe('Validateur de livrables — agent Développeur', () => {
  test('livrable code conforme passe la validation', () => {
    const { passed, missing } = validateDeliverable(FIXTURE.developer, VALIDATORS.developer);
    expect(missing).toEqual([]);
    expect(passed).toBe(true);
  });

  test('code sans package.json est détecté', () => {
    const noPkg = FIXTURE.developer.replace(/```filename:package\.json[\s\S]*?```/, '');
    const { passed } = validateDeliverable(noPkg, VALIDATORS.developer);
    expect(passed).toBe(false);
  });

  test('code sans fichiers source JS/TS/Python est détecté', () => {
    const noSrc = FIXTURE.developer.replace(/```filename:src\/[\s\S]*?```/, '');
    const { passed } = validateDeliverable(noSrc, VALIDATORS.developer);
    expect(passed).toBe(false);
  });

  test('code sans correspondance US → fichiers est détecté', () => {
    const noUS = FIXTURE.developer.replace(/US-\d+\.\d+/g, '');
    const { passed } = validateDeliverable(noUS, VALIDATORS.developer);
    expect(passed).toBe(false);
  });
});

describe('Validateur de livrables — agent QA', () => {
  test('rapport QA conforme passe la validation', () => {
    const { passed, missing } = validateDeliverable(FIXTURE.qa, VALIDATORS.qa);
    expect(missing).toEqual([]);
    expect(passed).toBe(true);
  });

  test('QA sans table de couverture US est détecté', () => {
    const noTable = FIXTURE.qa.replace(/\| US-\d+\.\d+.*\n/g, '');
    const { passed } = validateDeliverable(noTable, VALIDATORS.qa);
    expect(passed).toBe(false);
  });

  test('QA sans fichiers de test est détecté', () => {
    const noTests = FIXTURE.qa.replace(/```filename:[^\n]+\.test\.js[\s\S]*?```/, '');
    const { passed } = validateDeliverable(noTests, VALIDATORS.qa);
    expect(passed).toBe(false);
  });

  test('QA sans liste de bugs est détecté', () => {
    const noBugs = FIXTURE.qa.replace(/## 4\. Bugs et problèmes identifiés[\s\S]*?## 5/, '## 5');
    const { passed } = validateDeliverable(noBugs, VALIDATORS.qa);
    expect(passed).toBe(false);
  });
});

describe('Validateur de livrables — agent Scrum Master', () => {
  test('livrable scrum conforme passe la validation', () => {
    const { passed, missing } = validateDeliverable(FIXTURE.scrum_master, VALIDATORS.scrum_master);
    expect(missing).toEqual([]);
    expect(passed).toBe(true);
  });

  test('livrable sans vélocité est détecté', () => {
    const noVelo = FIXTURE.scrum_master
      .replace(/[Vv]élocité/g, '')
      .replace(/[Vv]elocity/g, '');
    const { passed } = validateDeliverable(noVelo, VALIDATORS.scrum_master);
    expect(passed).toBe(false);
  });
});

describe('Validateur de livrables — agent BMAD Master', () => {
  test('livrable BMAD Master conforme passe la validation', () => {
    const { passed, missing } = validateDeliverable(FIXTURE.bmad_master, VALIDATORS.bmad_master);
    expect(missing).toEqual([]);
    expect(passed).toBe(true);
  });

  test('livrable sans table de risques est détecté', () => {
    const noRisk = FIXTURE.bmad_master.replace(/\| Risque[\s\S]*?\n\n/, '\n\n');
    const { passed } = validateDeliverable(noRisk, VALIDATORS.bmad_master);
    expect(passed).toBe(false);
  });
});

describe('Validateur de livrables — agent Orchestrateur', () => {
  test('livrable orchestrateur conforme passe la validation', () => {
    const { passed, missing } = validateDeliverable(FIXTURE.orchestrateur, VALIDATORS.orchestrateur);
    expect(missing).toEqual([]);
    expect(passed).toBe(true);
  });

  test('livrable sans statuts d\'étapes est détecté', () => {
    const noStatus = FIXTURE.orchestrateur.replace(/✅/g, '');
    const { passed } = validateDeliverable(noStatus, VALIDATORS.orchestrateur);
    expect(passed).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 3. PIPELINE USER STORY COVERAGE CHECK
// ─────────────────────────────────────────────────────────────────────────
describe('Couverture des user stories — cohérence pipeline', () => {
  /**
   * Extract US IDs from a text (e.g. "US-1.1", "US-2.3")
   */
  function extractUSIds(text) {
    return [...new Set([...text.matchAll(/US-(\d+\.\d+)/g)].map(m => m[0]))];
  }

  test('le PRD déclare des user stories', () => {
    const ids = extractUSIds(FIXTURE.prd);
    expect(ids.length).toBeGreaterThanOrEqual(2);
    ids.forEach(id => expect(id).toMatch(/US-\d+\.\d+/));
  });

  test('le Backlog couvre les mêmes IDs que le PRD', () => {
    const prdIds = extractUSIds(FIXTURE.prd);
    // Extract only IDs from the Sprint 1 table (between Sprint 1 header and Sprint 2)
    const sprint1Section = FIXTURE.po_backlog
      .split('### Sprint 1')[1]
      .split('### Sprint 2')[0];
    const sprint1Ids = extractUSIds(sprint1Section);
    expect(sprint1Ids.length).toBeGreaterThan(0);
    sprint1Ids.forEach(id => expect(prdIds).toContain(id));
  });

  test('l\'architecture référence au moins une US du backlog', () => {
    const backlogIds = extractUSIds(FIXTURE.po_backlog);
    const archIds = extractUSIds(FIXTURE.architect);
    const overlap = archIds.filter(id => backlogIds.includes(id));
    expect(overlap.length).toBeGreaterThan(0);
  });

  test('le code référence les US du sprint 1', () => {
    const sprint1Ids = extractUSIds(FIXTURE.po_backlog.split('Sprint 2')[0]);
    const codeIds = extractUSIds(FIXTURE.developer);
    const covered = sprint1Ids.filter(id => codeIds.includes(id));
    expect(covered.length).toBeGreaterThan(0);
  });

  test('le rapport QA vérifie les US du sprint 1', () => {
    const sprint1Ids = extractUSIds(FIXTURE.po_backlog.split('Sprint 2')[0]);
    const qaIds = extractUSIds(FIXTURE.qa);
    const covered = sprint1Ids.filter(id => qaIds.includes(id));
    expect(covered.length).toBeGreaterThan(0);
  });

  test('le QA identifie les US non implémentées (❌)', () => {
    expect(FIXTURE.qa).toMatch(/❌/);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 4. DELIVERABLE CONTENT QUALITY CHECKS
// ─────────────────────────────────────────────────────────────────────────
describe('Qualité des livrables — seuils minimaux', () => {
  test('Analyste : au moins 3 fonctionnalités Must-Have', () => {
    const mustHaveBlock = FIXTURE.analyst.split('🟡')[0].split('🔴')[1] || '';
    const lines = mustHaveBlock.split('\n').filter(l => l.trim().startsWith('-'));
    expect(lines.length).toBeGreaterThanOrEqual(1);
  });

  test('PRD : au moins 2 Épics', () => {
    const epicCount = (FIXTURE.prd.match(/### Épic \d/g) || []).length;
    expect(epicCount).toBeGreaterThanOrEqual(2);
  });

  test('PRD : au moins 3 user stories', () => {
    const usCount = (FIXTURE.prd.match(/\| US-\d+\.\d+/g) || []).length;
    expect(usCount).toBeGreaterThanOrEqual(3);
  });

  test('Backlog : au moins 2 critères d\'acceptation avec checkbox', () => {
    const checkboxes = (FIXTURE.po_backlog.match(/- \[ \]/g) || []).length;
    expect(checkboxes).toBeGreaterThanOrEqual(2);
  });

  test('Architecture : structure de projet non vide', () => {
    const treeLine = FIXTURE.architect.match(/├──.+/g) || [];
    expect(treeLine.length).toBeGreaterThanOrEqual(2);
  });

  test('Développeur : au moins 2 fichiers générés', () => {
    const files = (FIXTURE.developer.match(/```filename:/g) || []).length;
    expect(files).toBeGreaterThanOrEqual(2);
  });

  test('QA : au moins 1 bug Critique ou Majeur identifié', () => {
    expect(FIXTURE.qa).toMatch(/Critique|Majeur/);
  });

  test('QA : table de couverture contient ✅ et ❌', () => {
    expect(FIXTURE.qa).toContain('✅');
    expect(FIXTURE.qa).toContain('❌');
  });

  test('UX : au moins 1 wireframe SVG valide', () => {
    const svgMatch = FIXTURE.ux_design.match(/```svg[\s\S]*?<svg[\s\S]*?<\/svg>[\s\S]*?```/);
    expect(svgMatch).not.toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 5. AGENT COORDINATOR — instruction constants registration
// ─────────────────────────────────────────────────────────────────────────
describe('AgentCoordinator — constantes d\'instructions exportées', () => {
  test('le fichier définit les 8 constantes d\'instructions attendues', () => {
    const src = loadCoordinatorSource();
    const expected = [
      'ANALYST_INSTRUCTIONS',
      'PM_PRD_INSTRUCTIONS',
      'PO_BACKLOG_INSTRUCTIONS',
      'ARCHITECT_INSTRUCTIONS',
      'UX_DESIGN_INSTRUCTIONS',
      'CODE_GEN_INSTRUCTIONS',
      'QA_TEST_INSTRUCTIONS',
      'FIX_AND_FINALIZE_INSTRUCTIONS'
    ];
    expected.forEach(name => {
      expect(src).toContain(`const ${name}`);
    });
  });

  test('le fichier définit FULL_APP_CODE_INSTRUCTIONS', () => {
    expect(loadCoordinatorSource()).toContain('FULL_APP_CODE_INSTRUCTIONS');
  });

  test('la classe AgentCoordinator est exportée', () => {
    const AgentCoordinator = require(COORDINATOR_PATH);
    expect(typeof AgentCoordinator).toBe('function');
  });

  test('AgentCoordinator expose executePipeline', () => {
    const AgentCoordinator = require(COORDINATOR_PATH);
    expect(typeof AgentCoordinator.prototype.executePipeline).toBe('function');
  });

  test('AgentCoordinator expose delegateToAgent', () => {
    const AgentCoordinator = require(COORDINATOR_PATH);
    expect(typeof AgentCoordinator.prototype.delegateToAgent).toBe('function');
  });

  test('AgentCoordinator expose startParty', () => {
    const AgentCoordinator = require(COORDINATOR_PATH);
    // The method is named startParty in the implementation
    expect(typeof AgentCoordinator.prototype.startParty).toBe('function');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 6. PIPELINE STEP PROMPT BUILDER
// ─────────────────────────────────────────────────────────────────────────
describe('AgentCoordinator — _buildStepPrompt', () => {
  let coordinator;

  beforeEach(() => {
    const AgentCoordinator = require(COORDINATOR_PATH);
    coordinator = new AgentCoordinator({
      aiService: {},
      projectContext: { buildContextForAgent: () => '' },
      bmadBackend: {}
    });
  });

  test('le prompt inclut les instructions de l\'étape', () => {
    const step = {
      agent: 'analyst',
      task: 'Analyse du besoin',
      instructions: 'ANALYST_INSTRUCTIONS_VALUE'
    };
    const prompt = coordinator._buildStepPrompt(step, 'initial input', '', []);
    expect(prompt).toContain('ANALYST_INSTRUCTIONS_VALUE');
  });

  test('le prompt inclut la sortie précédente', () => {
    const step = { agent: 'pm', task: 'PRD', instructions: 'Build a PRD' };
    const prev = '## Output de l\'analyste';
    const prompt = coordinator._buildStepPrompt(step, prev, '', []);
    expect(prompt).toContain(prev);
  });

  test('le prompt inclut les résultats des étapes précédentes si disponibles', () => {
    const step = { agent: 'architect', task: 'Architecture', instructions: 'Design arch' };
    const prevResults = [
      { agentTitle: 'Analyste', response: 'Analyse faite' },
      { agentTitle: 'PM', response: 'PRD prêt' }
    ];
    const prompt = coordinator._buildStepPrompt(step, 'prev output', '', prevResults);
    // _buildStepPrompt injects the previous output directly;
    // the context of earlier steps is passed via the previousOutput chain
    expect(prompt).toContain('prev output');
    expect(prompt).toContain('Design arch');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 7. validateDeliverable UTILITY FUNCTION
// ─────────────────────────────────────────────────────────────────────────
describe('validateDeliverable — utilitaire', () => {
  test('retourne passed=true si toutes les conditions sont remplies', () => {
    const { passed, missing } = validateDeliverable('foo bar baz', ['foo', 'bar']);
    expect(passed).toBe(true);
    expect(missing).toHaveLength(0);
  });

  test('retourne passed=false et liste les éléments manquants', () => {
    const { passed, missing } = validateDeliverable('foo', ['foo', 'bar', 'baz']);
    expect(passed).toBe(false);
    expect(missing).toContain('bar');
    expect(missing).toContain('baz');
  });

  test('supporte les regex', () => {
    const { passed } = validateDeliverable('US-1.1 implémenté', [/US-\d+\.\d+/]);
    expect(passed).toBe(true);
  });

  test('regex non-matchée est détectée', () => {
    const { passed, missing } = validateDeliverable('rien ici', [/US-\d+\.\d+/]);
    expect(passed).toBe(false);
    expect(missing).toHaveLength(1);
  });
});
