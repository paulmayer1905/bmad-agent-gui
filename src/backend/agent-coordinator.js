/**
 * Agent Coordinator - Orchestration layer for multi-agent collaboration
 * Handles: delegation, pipeline workflows, and party mode (multi-agent chat)
 */

const crypto = require('crypto');
const EventEmitter = require('events');

// ─── Instruction templates for pipeline steps ───────────────────────────

// ── ANALYST ──────────────────────────────────────────────────────────────
const ANALYST_INSTRUCTIONS = `Réalise une analyse complète et structurée du besoin décrit.

Tu DOIS produire un document d'analyse contenant :

## 1. Résumé exécutif
- Reformulation claire du besoin en 2-3 phrases
- Objectif principal de l'application/du produit

## 2. Analyse des utilisateurs
- Profils utilisateurs cibles (personas simplifiées)
- Cas d'usage principaux
- Parcours utilisateur type

## 3. Fonctionnalités identifiées
Liste EXHAUSTIVE des fonctionnalités, classées par priorité :
- 🔴 **Must-Have** (MVP) — fonctionnalités indispensables au lancement
- 🟡 **Should-Have** — importantes mais non bloquantes
- 🟢 **Nice-to-Have** — améliorations futures

## 4. Contraintes et risques
- Contraintes techniques identifiées
- Risques potentiels et mitigations

## 5. Recommandation technique
Recommande le type d'application :
- (a) Webapp (HTML/CSS/JS)
- (b) Application desktop (Electron)
- (c) API/Backend (Node.js/Python)
- (d) Application fullstack
Justifie ton choix.

IMPORTANT : Sois exhaustif dans l'identification des fonctionnalités. Un jeu Snake par exemple a au minimum : affichage du plateau, déplacement du serpent, génération de nourriture, détection de collisions, score, game over, redémarrage, etc.`;

// ── MARKET STUDY ─────────────────────────────────────────────────────────
const MARKET_STUDY_INSTRUCTIONS = `Réalise une étude de marché complète et structurée pour ce produit/application.

Tu DOIS produire un document d'étude de marché contenant :

## 1. Contexte et périmètre de l'étude
- Définition du marché adressé
- Zone géographique / segment cible
- Date de l'étude et hypothèses de base

## 2. Analyse de l'existant — Solutions concurrentes

Pour CHAQUE concurrent identifié, produis une fiche :

### 🏢 [Nom du concurrent]
| Critère | Détail |
|---------|--------|
| **Type** | SaaS / Open-source / Desktop / Mobile |
| **Positionnement** | Résumé en 1 phrase |
| **Cible** | Public visé |
| **Prix** | Gratuit / Freemium / Payant (fourchette) |
| **Forces** | Top 3 points forts |
| **Faiblesses** | Top 3 points faibles |
| **Part de marché** | Estimation si connue |

**Minimum 3 concurrents directs + 2 concurrents indirects.**

## 3. Points de douleur des utilisateurs (User Pain Points)

Basé sur les retours utilisateurs typiques des solutions existantes :

### 🔴 Douleurs critiques (bloquants)
- [Pain point] — *Exemple concret d'impact utilisateur*

### 🟡 Douleurs majeures (friction importante)
- [Pain point] — *Exemple concret*

### 🟢 Douleurs mineures (irritants)
- [Pain point] — *Exemple concret*

**Sources potentielles :** avis App Store / Google Play, forums Reddit, Product Hunt comments, G2/Capterra reviews, GitHub issues des projets open-source concurrents.

## 4. Analyse comparative — Tableau de positionnement

| Fonctionnalité clé | Notre produit | Concurrent A | Concurrent B | Concurrent C |
|-------------------|:---:|:---:|:---:|:---:|
| [Feature 1] | ✅ | ✅ | ❌ | ✅ |
| [Feature 2] | ✅ | ❌ | ✅ | ❌ |
| [Feature 3] | 🔄 Prévu | ✅ | ✅ | ❌ |

Légende : ✅ Présent | ❌ Absent | 🔄 Prévu | ⚠️ Partiel

## 5. Opportunités de différenciation

Liste les **gaps du marché** non couverts par les solutions existantes :
1. **[Opportunité 1]** — Pourquoi c'est un avantage concurrentiel
2. **[Opportunité 2]** — …
3. **[Opportunité 3]** — …

## 6. Sizing du marché (TAM / SAM / SOM)

| Segment | Taille estimée | Méthode d'estimation |
|---------|---------------|---------------------|
| **TAM** (Total Addressable Market) | X utilisateurs / X M€ | Bottom-up ou analogie |
| **SAM** (Serviceable Addressable Market) | X utilisateurs | Filtrage géo/segment |
| **SOM** (Serviceable Obtainable Market) | X utilisateurs (Y%) | Part réaliste Y1-Y3 |

## 7. Tendances du marché
- Tendances technologiques pertinentes (IA, no-code, mobile-first, etc.)
- Évolutions réglementaires potentielles
- Menaces et opportunités émergentes

## 8. Recommandation stratégique de positionnement
- **Proposition de valeur unique** (UVP) en 1 phrase percutante
- Segment prioritaire à cibler en Y1
- Stratégie de go-to-market recommandée

IMPORTANT : Sois précis et factuel. Si tu fais des estimations, indique-le clairement. Utilise le conditionnel pour les projections non vérifiables.`;

// ── FUNCTIONAL SPECIFICATIONS ─────────────────────────────────────────────
const FUNCTIONAL_SPEC_INSTRUCTIONS = `Rédige les Spécifications Fonctionnelles Détaillées (SFD) de l'application.

Basé sur le PRD, le backlog, et l'étude de marché, produis un document de spécifications fonctionnelles au standard professionnel :

## 1. Objet et périmètre du document
- Version du document, date, auteur (agent PM)
- Résumé de l'application en 3-5 phrases
- Périmètre couvert (liste des fonctionnalités) et exclu

## 2. Glossaire
Tableau des termes métier utilisés dans le document :
| Terme | Définition |
|-------|------------|
| [Terme 1] | Définition précise dans le contexte de l'application |

## 3. Acteurs et rôles

Pour CHAQUE acteur du système :
| Acteur | Description | Droits / Permissions | Conditions d'accès |
|--------|-------------|---------------------|-------------------|
| [Acteur 1] | … | Lecture, écriture… | Authentifié, abonné… |

## 4. Cas d'utilisation (Use Cases)

Pour CHAQUE fonctionnalité principale, produis une fiche UC :

---
### UC-[N] : [Titre du cas d'utilisation]
**Acteur principal :** [nom de l'acteur]
**Objectif :** [Ce que l'acteur veut accomplir]
**Préconditions :** [Ce qui doit être vrai avant l'exécution]
**Postconditions :** [État du système après l'exécution réussie]

**Scénario nominal (chemin heureux) :**
1. [Action acteur / Réaction système]
2. …

**Scénarios alternatifs :**
- **Alt-[N]a** : [Condition] → [Action alternative]

**Scénarios d'exception :**
- **Exc-[N]a** : [Erreur] → [Comportement du système]

**Règles de gestion associées :** RG-[N]
---

**Minimum 1 UC par épic du PRD.**

## 5. Règles de gestion (RG)

Tableau exhaustif des règles métier :
| ID | Règle | Priorité | UC liés |
|----|-------|----------|---------|
| RG-001 | [Description précise de la règle] | Obligatoire / Optionnel | UC-1 |

## 6. Exigences d'interface utilisateur
- Contraintes d'accessibilité (RGAA / WCAG niveau visé)
- Contraintes de responsive design
- Messages d'erreur standardisés

## 7. Exigences de données
- Données obligatoires vs optionnelles par formulaire/entité
- Règles de validation (format, longueur, type)
- Règles de confidentialité (RGPD / données personnelles)

## 8. Matrice de traçabilité
Lien entre exigences fonctionnelles et user stories du backlog :
| ID Exigence | Description | US liées | Priorité |
|-------------|-------------|----------|---------|
| EF-001 | … | US-1.1, US-1.2 | Must-Have |

IMPORTANT : Chaque règle de gestion doit être univoque, testable, et référencée dans au moins un UC.`;

// ── TECHNICAL SPECIFICATIONS ──────────────────────────────────────────────
const TECHNICAL_SPEC_INSTRUCTIONS = `Rédige les Spécifications Techniques Détaillées (STD) de l'application.

Basé sur l'architecture, les spécifications fonctionnelles, et le PRD, produis un document de spécifications techniques complet :

## 1. Objet et périmètre
- Version du document, date, auteur (agent Architecte)
- Stack technique retenue avec justifications
- Contraintes techniques non-fonctionnelles (performance, sécurité, scalabilité)

## 2. Architecture détaillée

### 2.1 Diagramme d'architecture
Description textuelle ou ASCII du schéma d'architecture :
\`\`\`
[Client]──HTTP/WS──▶[API Gateway]──▶[Service A]──▶[DB]
                                  ──▶[Service B]──▶[Cache]
\`\`\`

### 2.2 Composants techniques
Pour CHAQUE composant :
| Composant | Technologie | Rôle | Dépendances |
|-----------|-------------|------|-------------|
| [Composant 1] | [Tech] | [Responsabilité] | [Ce dont il dépend] |

## 3. API — Contrats d'interface

Pour CHAQUE endpoint ou méthode exposée :

---
### [MÉTHODE] /api/[ressource]
**Description :** [Ce que fait cet endpoint]
**Authentification :** Bearer JWT / API Key / Publique

**Paramètres de requête :**
| Nom | Type | Requis | Description |
|-----|------|:------:|-------------|
| [param] | string | ✅ | … |

**Corps de la requête (JSON) :**
\`\`\`json
{
  "field": "type — description"
}
\`\`\`

**Réponse succès (200/201) :**
\`\`\`json
{
  "id": "uuid",
  "field": "value"
}
\`\`\`

**Codes d'erreur :**
| Code | Signification | Cause |
|------|---------------|-------|
| 400 | Bad Request | Paramètre manquant ou invalide |
| 401 | Unauthorized | Token absent ou expiré |
| 404 | Not Found | Ressource inexistante |
---

## 4. Modèle de données (Schéma)

Pour CHAQUE entité :

### Entité : [NomEntité]
\`\`\`
Table: nom_table
├── id          UUID        PK, NOT NULL, DEFAULT gen_random_uuid()
├── field_name  VARCHAR(255) NOT NULL
├── created_at  TIMESTAMP   NOT NULL, DEFAULT NOW()
└── updated_at  TIMESTAMP   NOT NULL
\`\`\`

**Relations :**
- [NomEntité] 1──N [AutreEntité] (via foreign_key)

**Index :** Lister les index nécessaires pour les performances

## 5. Sécurité

| Vecteur d'attaque | Mesure de protection | Implémentation |
|-------------------|---------------------|----------------|
| Injection SQL | ORM paramétré | Sequelize / Prisma |
| XSS | Échappement des sorties | DOMPurify / CSP headers |
| CSRF | Token CSRF + SameSite Cookie | … |
| Auth | JWT avec expiration courte | Rotation toutes les 15min |
| Rate limiting | 100 req/min par IP | express-rate-limit |

## 6. Exigences non-fonctionnelles (ENF)

| ID | Catégorie | Exigence | Seuil mesurable |
|----|-----------|----------|-----------------|
| ENF-001 | Performance | Temps de réponse API | p95 < 200ms |
| ENF-002 | Disponibilité | Uptime | 99.9% / mois |
| ENF-003 | Scalabilité | Utilisateurs simultanés | 1000 sans dégradation |
| ENF-004 | Sécurité | Chiffrement données transit | TLS 1.3 minimum |

## 7. Infrastructure et déploiement

### Environnements
| Env | URL | Usage | Configuration |
|-----|-----|-------|---------------|
| dev | localhost | Développement local | Docker Compose |
| staging | staging.app.com | Tests d'intégration | Cloud (same as prod) |
| prod | app.com | Production | Cloud HA |

### Pipeline CI/CD
\`\`\`
Push Git → Lint + Tests → Build Docker → Deploy Staging → Tests E2E → Deploy Prod
\`\`\`

## 8. Plan de tests techniques

| Type de test | Outil | Couverture cible | Responsable |
|-------------|-------|-----------------|-------------|
| Unitaires | Jest / PyTest | 80% | Dev |
| Intégration | Supertest | Tous les endpoints | QA |
| E2E | Playwright / Cypress | Flux critiques | QA |
| Performance | k6 / Artillery | ENF-001 à ENF-003 | DevOps |
| Sécurité | OWASP ZAP | OWASP Top 10 | Architect |

IMPORTANT : Chaque exigence non-fonctionnelle DOIT avoir un seuil mesurable et un outil de vérification associé.`;

// ── ROADMAP ───────────────────────────────────────────────────────────────
const ROADMAP_INSTRUCTIONS = `Produis la Roadmap produit complète, stratégique et opérationnelle.

Basé sur le PRD, le backlog priorisé, l'étude de marché, et les spécifications, produis un document de roadmap en deux parties : vision stratégique + plan d'exécution.

## 1. Vision et objectifs stratégiques

### Étoile du Nord (North Star Metric)
- **Métrique principale :** [La métrique unique qui mesure le succès du produit]
- **Cible Y1 :** [Valeur à atteindre dans 12 mois]

### Objectifs par horizon
| Horizon | Période | Objectif principal | Critère de succès |
|---------|---------|-------------------|------------------|
| Court terme | M1 – M3 | [MVP live] | [X utilisateurs actifs] |
| Moyen terme | M4 – M9 | [Croissance] | [Y DAU / MRR] |
| Long terme | M10 – M18 | [Scalabilité / Expansion] | [Z ARR / marchés] |

## 2. Roadmap par phase (Timeline)

### 🏗️ Phase 1 — MVP (Mois 1-3)
**Thème :** [Résoudre le problème core]
**Objectif :** Livrer la valeur essentielle aux early adopters

| Semaine | Epic / Feature | Priorité | Owner | Effort |
|---------|---------------|----------|-------|--------|
| S1-S2 | [Epic 1 : Setup & Infrastructure] | Critique | Tech Lead | L |
| S3-S4 | [Epic 2 : Feature principale] | Critique | Dev | XL |
| S5-S6 | [Epic 3 : Authentification] | Haute | Dev | M |
| S7-S8 | [Epic 4 : Dashboard basique] | Haute | Dev | M |
| S9-S10 | [Tests & QA] | Critique | QA | M |
| S11-S12 | [Beta launch + feedback] | Critique | PM | S |

**Jalons (Milestones) :**
- 📍 **M1** : Infrastructure en place, CI/CD opérationnel
- 📍 **M2** : Feature principale fonctionnelle en staging
- 📍 **M3** : MVP livré, 50 beta users onboardés

### 🚀 Phase 2 — Croissance (Mois 4-9)
**Thème :** [Améliorer la rétention et l'acquisition]
**Objectif :** Atteindre le Product-Market Fit

| Trimestre | Epic / Feature | Priorité | Dépendance |
|-----------|--------------|----------|------------|
| Q2 | [Feature différenciante 1] | Haute | Phase 1 |
| Q2 | [Intégrations tierces] | Moyenne | Phase 1 |
| Q3 | [Premium / Monétisation] | Haute | PMF validé |
| Q3 | [Mobile app] | Moyenne | API stable |

**Jalons :**
- 📍 **M6** : 500 utilisateurs actifs mensuels, NPS > 40
- 📍 **M9** : Premier revenu récurrent, churn < 5%

### 🌍 Phase 3 — Scale (Mois 10-18)
**Thème :** [Expansion et consolidation]

| Période | Initiative | Impact attendu |
|---------|-----------|---------------|
| M10-M12 | [Internationalisation] | +30% TAM adressable |
| M13-M15 | [API publique / Platform] | Effets de réseau |
| M16-M18 | [Enterprise tier] | ACV multiplié par 5 |

**Jalons :**
- 📍 **M12** : Disponible en 3 langues
- 📍 **M18** : [Objectif final ambitieux mais réaliste]

## 3. Dépendances critiques et risques de la roadmap

| Risque | Phase impactée | Probabilité | Impact | Mitigation |
|--------|--------------|:-----------:|:------:|-----------|
| Retard tech majeur | Phase 1 | Moyenne | Critique | Scope MVP réduit à 60% |
| Adoption insuffisante | Phase 2 | Faible | Haute | Pivot feature si NPS < 20 |
| Concurrent agressif | Phase 2-3 | Moyenne | Haute | Accélérer différenciation |

## 4. Backlog stratégique (Post-Phase 3)

Features identifiées mais non planifiées, à réévaluer selon la traction :
- [Feature future 1] — Valeur estimée : Haute | Effort : XL
- [Feature future 2] — Valeur estimée : Moyenne | Effort : M

## 5. Métriques de suivi par phase

| Phase | KPI | Outil de mesure | Fréquence revue |
|-------|-----|----------------|-----------------|
| Phase 1 | Bugs critiques en prod | Sentry | Quotidien |
| Phase 1-2 | DAU / WAU / MAU | Mixpanel / Amplitude | Hebdo |
| Phase 2 | MRR, Churn rate | Stripe / Baremetrics | Mensuel |
| Phase 3 | NPS, CSAT | Typeform | Trimestriel |

## 6. Go-to-Market par phase

| Phase | Canal principal | Action | Budget estimé |
|-------|----------------|--------|---------------|
| Phase 1 | Community (Reddit, Discord) | Lancement Product Hunt | 0€ |
| Phase 2 | SEO + Content | Blog + Docs publics | 500€/mois |
| Phase 3 | Paid acquisition + Partnerships | Google Ads + Intégrations | 5k€/mois |

IMPORTANT : La roadmap doit être ambitieuse mais réaliste. Chaque phase doit avoir des critères d'arrêt/pivot clairement définis si les métriques ne sont pas atteintes.`;

// ── PM / PRD ─────────────────────────────────────────────────────────────
const PM_PRD_INSTRUCTIONS = `Rédige un Product Requirements Document (PRD) complet et structuré.

Basé sur l'analyse précédente, produis un PRD professionnel avec :

## 1. Vision produit
- Énoncé de vision (1 phrase)
- Problème résolu
- Public cible

## 2. Objectifs et métriques de succès
- 3-5 objectifs mesurables
- KPIs associés

## 3. Périmètre
- **In scope** : ce qui est inclus dans cette version
- **Out of scope** : ce qui est exclu explicitement

## 4. Épics et User Stories
STRUCTURE OBLIGATOIRE — Organise les fonctionnalités en Épics, chaque Épic contenant plusieurs User Stories :

### Épic 1 : [Nom de l'épic]
> Description de l'épic et de sa valeur métier

| ID | User Story | Priorité | Critères d'acceptation |
|----|-----------|----------|----------------------|
| US-1.1 | En tant que [persona], je veux [action] afin de [bénéfice] | Must-Have | - Critère 1\\n- Critère 2\\n- Critère 3 |
| US-1.2 | En tant que [persona], je veux [action] afin de [bénéfice] | Must-Have | - Critère 1\\n- Critère 2 |

### Épic 2 : [Nom de l'épic]
> Description...
(idem)

RÈGLES pour les User Stories :
- Chaque épic doit contenir AU MINIMUM 2-3 user stories
- Un projet même simple DOIT avoir au minimum 3 épics et 8-10 user stories
- Chaque user story DOIT avoir des critères d'acceptation testables (minimum 2)
- Utilise le format : "En tant que [persona], je veux [action] afin de [bénéfice]"
- Les IDs suivent le format US-[épic].[story] (ex: US-1.1, US-2.3)

Exemple pour un jeu Snake :
- Épic 1 : Mécanique de jeu de base (US-1.1 Affichage plateau, US-1.2 Mouvement serpent, US-1.3 Nourriture, US-1.4 Croissance)
- Épic 2 : Règles et score (US-2.1 Détection collisions, US-2.2 Score, US-2.3 Game Over, US-2.4 Redémarrage)
- Épic 3 : Interface et UX (US-3.1 Menu principal, US-3.2 Affichage score, US-3.3 Responsive/Clavier)
- Épic 4 : Polish et améliorations (US-4.1 Vitesse progressive, US-4.2 Meilleur score, US-4.3 Sons/effets visuels)

## 5. Exigences non-fonctionnelles
- Performance, accessibilité, compatibilité

## 6. Dépendances et hypothèses
- Dépendances techniques
- Hypothèses faites

IMPORTANT : Ne produis JAMAIS un PRD avec une seule user story. Même le projet le plus simple a plusieurs fonctionnalités distinctes qui doivent être décomposées.`;

// ── PO / BACKLOG ─────────────────────────────────────────────────────────
const PO_BACKLOG_INSTRUCTIONS = `Tu es le Product Owner. À partir du PRD fourni, valide et affine le backlog produit.

Tu DOIS :

## 1. Validation du PRD
- Vérifie la cohérence entre les épics
- Identifie les user stories manquantes
- Vérifie que chaque user story a des critères d'acceptation testables

## 2. Backlog priorisé
Reprends et affine les user stories du PRD dans un backlog ordonné :

### Sprint 1 (MVP)
| Priorité | ID | User Story | Points | Dépendances |
|----------|-----|-----------|--------|-------------|
| 1 | US-X.X | ... | S/M/L/XL | - |

### Sprint 2
(idem)

### Backlog futur
(stories Nice-to-Have)

## 3. Critères d'acceptation enrichis
Pour CHAQUE user story du Sprint 1, détaille les critères d'acceptation :

#### US-X.X : [titre court]
**Critères d'acceptation :**
- [ ] Critère précis et testable 1
- [ ] Critère précis et testable 2
- [ ] Critère précis et testable 3

**Notes de dev :**
- Indications techniques si pertinent

## 4. Definition of Done (DoD)
- Critères généraux pour considérer une story "done"

RÈGLES :
- Le backlog doit contenir AU MINIMUM 8 user stories pour un projet simple, 15+ pour un projet complexe
- Chaque story doit avoir au minimum 2 critères d'acceptation avec des checkbox [ ]
- Les stories doivent être ordonnées par dépendance logique (on ne peut pas scorer sans plateau de jeu)
- Estime la complexité en tailles de t-shirt (S/M/L/XL)`;

// ── ARCHITECT ────────────────────────────────────────────────────────────
const ARCHITECT_INSTRUCTIONS = `Conçois l'architecture technique complète de l'application.

Basé sur le PRD et le backlog produit, tu DOIS fournir :

## 1. Choix de la stack technique
- Langage / Framework principal avec justification
- Dépendances et bibliothèques
- Outils de build/bundling

## 2. Structure du projet
Fournis la structure EXACTE des fichiers :
\`\`\`
mon-app/
├── package.json
├── README.md
├── src/
│   ├── index.js
│   ├── game/           (ou modules métier)
│   │   ├── engine.js
│   │   └── ...
│   ├── ui/
│   │   ├── renderer.js
│   │   └── ...
│   └── utils/
│       └── ...
├── public/
│   └── index.html
├── styles/
│   └── main.css
└── tests/
    └── ...
\`\`\`

## 3. Modules et composants
Pour CHAQUE module/fichier listé :
- Responsabilité
- Dépendances (imports)
- Interface publique (fonctions/classes exposées)

## 4. Modèle de données
- Structures de données principales
- État de l'application

## 5. Flux de contrôle
- Diagramme ou description du flux principal (game loop, event handling, etc.)

## 6. Commandes d'installation et lancement
\`\`\`bash
npm install    # ou équivalent
npm start      # ou équivalent
npm test       # ou équivalent
\`\`\`

## 7. Correspondance Backlog → Architecture
Indique quel module implémente quelle user story.

IMPORTANT :
- Si l'application est destinée au bureau : recommande Electron
- Si c'est une webapp simple : HTML/CSS/JS pur ou un framework léger
- La structure doit supporter TOUTES les user stories du backlog`;

// ── UX DESIGN ────────────────────────────────────────────────────────────
const UX_DESIGN_INSTRUCTIONS = `Conçois le design UX/UI complet de l'application.

Basé sur le PRD, le backlog, et l'architecture, tu DOIS fournir :

## 1. Principes de design
- Style visuel (minimaliste, ludique, professionnel, etc.)
- Palette de couleurs (codes hex)
- Typographie

## 2. Wireframes
Produis un wireframe SVG pour CHAQUE écran principal :
- Écran principal / Page d'accueil
- Écrans secondaires (menu, settings, game over, etc.)
- États vides et états d'erreur

Chaque wireframe DOIT être dans un bloc \`\`\`svg avec des groupes nommés.

## 3. Composants UI
Liste les composants réutilisables :
- Boutons (types et états)
- Cartes / Panneaux
- Modales
- Indicateurs (score, progression)

## 4. Guide de navigation
- Flux de navigation entre écrans
- Transitions et animations suggérées

## 5. Responsive design
- Breakpoints
- Adaptations mobile/tablette si pertinent

IMPORTANT : Les wireframes doivent couvrir TOUS les écrans nécessaires aux user stories du Sprint 1.`;

// ── DEV / CODE ───────────────────────────────────────────────────────────
const CODE_GEN_INSTRUCTIONS = `Implémente le CODE COMPLET et FONCTIONNEL pour cette tâche.

RÈGLES CRITIQUES :
1. Produis CHAQUE FICHIER avec son chemin complet en utilisant ce format exact :

\`\`\`filename:chemin/vers/fichier.ext
// code complet ici
\`\`\`

2. Chaque fichier doit être COMPLET — pas de placeholders, pas de "// TODO", pas de "...existing code..."
3. Inclus TOUS les fichiers nécessaires : code source, config, package.json, README.md
4. Le code doit compiler et fonctionner directement sans modification
5. Utilise les bonnes pratiques et une architecture propre
6. Inclus les dépendances dans package.json (ou requirements.txt pour Python)
7. Respecte la structure de fichiers définie par l'architecte
8. Implémente TOUTES les user stories du Sprint 1 du backlog`;

const FULL_APP_CODE_INSTRUCTIONS = `Tu dois générer le CODE SOURCE COMPLET d'une application fonctionnelle.
Basé sur l'architecture, le design UX, le backlog, et les user stories, produis TOUS les fichiers nécessaires.

RÈGLES CRITIQUES :
1. Utilise ce format pour CHAQUE FICHIER :

\`\`\`filename:chemin/vers/fichier.ext
// code complet ici
\`\`\`

2. Commence par package.json (ou l'équivalent pour le langage choisi) avec TOUTES les dépendances
3. Produis CHAQUE fichier en entier — aucun placeholder, aucun "TODO", aucun raccourci
4. L'application doit pouvoir démarrer avec "npm install && npm start" (ou équivalent)
5. Inclus : index.html, CSS, tous les composants/modules JS, fichiers de config
6. Si c'est une app web : inclus un serveur simple ou utilise une structure SPA
7. Si c'est une app desktop : configure Electron avec main.js et preload.js
8. Ajoute un README.md avec les instructions d'installation et de lancement
9. Le design doit correspondre aux wireframes UX fournis
10. Utilise un style CSS moderne et responsive

IMPORTANT — COUVERTURE FONCTIONNELLE :
- Tu DOIS implémenter TOUTES les user stories du Sprint 1 (MVP)
- Chaque critère d'acceptation doit être implémenté dans le code
- Vérifie que chaque fonctionnalité listée dans le backlog est couverte
- À la fin, liste la correspondance US → fichiers implémentés`;

// ── QA / TESTS ───────────────────────────────────────────────────────────
const QA_TEST_INSTRUCTIONS = `Écris les tests COMPLETS pour l'application ET valide la couverture du backlog.

## 1. Vérification de la couverture
Vérifie que CHAQUE user story du Sprint 1 est implémentée :

| US | Story | Implémentée ? | Fichier(s) | Commentaire |
|----|-------|:---:|---------|-------------|
| US-1.1 | ... | ✅/❌ | ... | ... |

## 2. Tests unitaires
Produis de vrais fichiers de test avec ce format :

\`\`\`filename:tests/nom-du-test.test.js
// code de test complet
\`\`\`

- Un fichier de test par module/composant principal
- Couvre les cas principaux, les cas limites, et les erreurs
- Si c'est du JS : utilise Jest ou le framework de test du projet
- Les tests doivent être exécutables avec "npm test" ou équivalent

## 3. Tests d'acceptation
Pour chaque user story, vérifie les critères d'acceptation :
- [ ] US-X.X Critère 1 → résultat
- [ ] US-X.X Critère 2 → résultat

## 4. Bugs et problèmes identifiés
Liste les bugs, incohérences, ou manques trouvés avec sévérité (Critique/Majeur/Mineur).

## 5. Suggestions de tests manuels
Scénarios de test manuels pour les aspects difficilement automatisables.`;

// ── FIX & FINALIZE ───────────────────────────────────────────────────────
const FIX_AND_FINALIZE_INSTRUCTIONS = `Revois le code généré et les retours du QA.

1. Corrige TOUS les bugs identifiés par le QA (liste-les un par un avec le fix appliqué)
2. Implémente les user stories manquantes signalées par le QA
3. Assure-toi que tous les fichiers sont cohérents entre eux
4. Vérifie les imports/requires et les chemins
5. Ajoute les fichiers manquants s'il y en a
6. Produis les fichiers corrigés au format :

\`\`\`filename:chemin/vers/fichier.ext
// code corrigé complet
\`\`\`

7. Produis un README.md final avec les instructions de démarrage complètes

8. Produis un rapport final de couverture :
| US | Story | Status |
|----|-------|--------|
| US-X.X | ... | ✅ Implémentée |`;

class AgentCoordinator extends EventEmitter {
  constructor(options = {}) {
    super();
    this.aiService = options.aiService;
    this.projectContext = options.projectContext;
    this.bmadBackend = options.bmadBackend;
    this.workspaceManager = options.workspaceManager || null;

    // Pipeline instructions loaded from bmad-core/tasks/pipeline-*.md
    // Falls back to hardcoded constants if a file is missing
    this._pipelineInstructions = options.pipelineInstructions || {};

    // Active party sessions
    this.partySessions = new Map();

    // Active pipelines
    this.activePipelines = new Map();
  }

  /**
   * Get a pipeline instruction by task-id. Uses the shared file from
   * bmad-core/tasks/ if loaded, otherwise falls back to the hardcoded constant.
   * @param {string} taskId - e.g. 'pipeline-analyst-analysis'
   * @param {string} fallback - built-in constant as fallback
   * @returns {string}
   */
  _instr(taskId, fallback) {
    return this._pipelineInstructions[taskId] || fallback;
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  PHASE 2 — Delegation (consult another agent)
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Delegate a question from one agent to another.
   * Creates a transient sub-session, asks the question, returns the response.
   * @param {string|null} fromSessionId - The calling session (for context, can be null)
   * @param {string} targetAgentName - Which agent to consult
   * @param {string} question - The question or task to send
   * @param {Object} options - { saveAsArtifact, artifactType }
   */
  async delegateToAgent(fromSessionId, targetAgentName, question, options = {}) {
    const agent = await this.bmadBackend.getAgent(targetAgentName);
    const metadata = await this.bmadBackend.getAgentMetadata(targetAgentName);
    const displayName = metadata.title || metadata.name || targetAgentName;

    // Build context-aware prompt
    const contextSummary = this.projectContext.buildContextForAgent(targetAgentName);

    const delegationPrompt = `Tu es consulté par un autre agent qui a besoin de ton expertise.
${contextSummary}

--- QUESTION ---
${question}
--- FIN DE LA QUESTION ---

Réponds de manière concise et actionnable. Concentre-toi sur ton domaine d'expertise.`;

    // Create transient sub-session
    const subSessionId = `delegation-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

    const systemPrompt = this.aiService.buildSystemPrompt(agent.rawContent, displayName);
    this.aiService.conversations.set(subSessionId, {
      systemPrompt,
      agentName: displayName,
      messages: [],
      createdAt: Date.now(),
      isDelegation: true
    });

    try {
      const result = await this.aiService.sendMessage(subSessionId, delegationPrompt);

      // Optionally store the result in project context
      if (options.saveAsArtifact) {
        await this.projectContext.addArtifact({
          type: options.artifactType || 'document',
          title: `Consultation ${displayName}: ${question.slice(0, 80)}`,
          content: result.content,
          summary: result.content.slice(0, 200),
          agent: displayName,
          tags: ['delegation', targetAgentName]
        });
      }

      return {
        agentName: targetAgentName,
        agentTitle: displayName,
        agentIcon: metadata.icon || '🤖',
        question,
        response: result.content,
        usage: result.usage
      };
    } finally {
      // Clean up transient session
      this.aiService.conversations.delete(subSessionId);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  PHASE 3 — Pipeline Workflow (chain agents sequentially)
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Execute a pipeline of agent steps sequentially.
   * Each step's output feeds into the next step's input.
   * @param {Object} pipeline - { name, steps: [{agent, task, instructions, artifactType, saveArtifact}], initialInput }
   * @param {Object} options - { continueOnError }
   * @returns {Object} Pipeline execution state
   */
  async executePipeline(pipeline, options = {}) {
    const pipelineId = `pipeline-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

    const state = {
      id: pipelineId,
      name: pipeline.name || 'Pipeline personnalisé',
      workspaceId: pipeline.workspaceId || null,
      steps: pipeline.steps.map((s, i) => ({
        ...s,
        index: i,
        status: 'pending',
        result: null,
        error: null,
        startedAt: null,
        completedAt: null
      })),
      status: 'running',
      startedAt: Date.now(),
      completedAt: null,
      currentStep: 0,
      results: []
    };

    this.activePipelines.set(pipelineId, state);
    this.emit('pipeline:start', { pipelineId, name: state.name, totalSteps: state.steps.length });

    try {
      let previousOutput = pipeline.initialInput || '';

      for (let i = 0; i < state.steps.length; i++) {
        const step = state.steps[i];
        state.currentStep = i;
        step.status = 'running';
        step.startedAt = Date.now();

        this.emit('pipeline:step:start', {
          pipelineId, stepIndex: i, agentName: step.agent, task: step.task
        });

        try {
          // Build the step prompt with accumulated context from ALL previous steps
          const contextSummary = this.projectContext.buildContextForAgent(step.agent);
          const stepPrompt = this._buildStepPrompt(step, previousOutput, contextSummary, state.results);

          // Delegate to the agent (defer artifact save when peer review will handle it)
          const hasPeerReview = !!(step.peerReview && step.peerReview.reviewer);
          const result = await this.delegateToAgent(null, step.agent, stepPrompt, {
            saveAsArtifact: step.saveArtifact !== false && !hasPeerReview,
            artifactType: step.artifactType || 'document'
          });

          // ── Peer review (bidirectional challenge/revision) ──────────
          let finalResult = result;
          if (hasPeerReview) {
            finalResult = await this._runPeerReview({
              step, primaryResult: result, state, pipelineId, stepIndex: i
            });
            // Persist the peer-reviewed version (initial save was deferred)
            if (step.saveArtifact !== false) {
              const wasRevised = finalResult.peerReviewRounds?.some(r => r.type === 'revision');
              await this.projectContext.addArtifact({
                type: step.artifactType || 'document',
                title: `${wasRevised ? '[Révisé] ' : '[Validé] '}${step.task || step.agent}`,
                content: finalResult.response,
                summary: finalResult.response.slice(0, 200),
                agent: step.agent,
                tags: ['peer-reviewed', step.agent, step.peerReview.reviewer]
              }).catch(() => {});
            }
          }

          step.status = 'completed';
          step.completedAt = Date.now();
          step.result = finalResult;
          state.results.push(finalResult);
          previousOutput = finalResult.response;

          // Extract code blocks and write to workspace if step has extractCode
          let filesWritten = [];
          if (step.extractCode && state.workspaceId && this.workspaceManager) {
            try {
              const writeResult = await this.workspaceManager.writeCodeBlocks(
                state.workspaceId, finalResult.response, { agent: step.agent }
              );
              filesWritten = writeResult.written;
              this.emit('pipeline:files:written', {
                pipelineId, stepIndex: i, files: filesWritten
              });
            } catch (err) {
              console.error('Code extraction error:', err.message);
            }
          }

          this.emit('pipeline:step:done', {
            pipelineId, stepIndex: i, agentName: step.agent,
            response: finalResult.response.slice(0, 300),
            usage: finalResult.usage,
            filesWritten: filesWritten.length,
            reviewRounds: finalResult.peerReviewRounds?.filter(r => r.type === 'challenge').length || 0
          });

        } catch (err) {
          step.status = 'failed';
          step.completedAt = Date.now();
          step.error = err.message;

          this.emit('pipeline:step:error', {
            pipelineId, stepIndex: i, agentName: step.agent, error: err.message
          });

          if (!options.continueOnError) {
            state.status = 'failed';
            this.emit('pipeline:error', { pipelineId, stepIndex: i, error: err.message });
            return state;
          }
        }
      }

      state.status = 'completed';
      state.completedAt = Date.now();
      this.emit('pipeline:done', { pipelineId, results: state.results.length });

    } catch (err) {
      state.status = 'failed';
      state.completedAt = Date.now();
      this.emit('pipeline:error', { pipelineId, error: err.message });
    }

    return state;
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  PEER REVIEW — bidirectional agent-to-agent challenge/revision loop
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Run a peer review loop between the primary agent and a reviewer agent.
   *
   * Flow:
   *  1. Reviewer reads primary output → produces CRITIQUE or "VALIDÉ: reason"
   *  2. If "VALIDÉ" → accept immediately
   *  3. Else primary agent reads critique → produces REVISED output
   *  4. Repeat up to maxRounds
   *  5. Return final result (possibly revised)
   *
   * @param {Object} opts
   *  - step         : the pipeline step definition (includes step.peerReview config)
   *  - primaryResult: delegation result from the primary agent
   *  - state        : current pipeline state (for context)
   *  - pipelineId
   *  - stepIndex
   * @returns {Object} final delegation result (may be revised version of primaryResult)
   */
  async _runPeerReview({ step, primaryResult, state, pipelineId, stepIndex }) {
    const { reviewer, maxRounds = 2, focus = null } = step.peerReview;

    const reviewerMeta = await this.bmadBackend.getAgentMetadata(reviewer);
    const reviewerTitle = reviewerMeta.title || reviewerMeta.name || reviewer;
    const reviewerIcon = reviewerMeta.icon || '🔍';

    const primaryMeta = await this.bmadBackend.getAgentMetadata(step.agent);
    const primaryTitle = primaryMeta.title || primaryMeta.name || step.agent;

    this.emit('pipeline:review:start', {
      pipelineId, stepIndex,
      reviewer, reviewerIcon, reviewerTitle,
      primaryAgent: step.agent, primaryTitle,
      maxRounds
    });

    let currentResult = primaryResult;
    let rounds = [];

    for (let round = 1; round <= maxRounds; round++) {
      // ── Reviewer challenges ──────────────────────────────────────────
      const focusHint = focus ? `Focalise-toi particulièrement sur : ${focus}` : '';
      const reviewPrompt = [
        `Tu es ${reviewerTitle} et tu examines le livrable produit par ${primaryTitle}.`,
        ...(focusHint ? [focusHint] : []),
        '',
        '--- LIVRABLE À RÉVISER ---',
        currentResult.response,
        '--- FIN DU LIVRABLE ---',
        '',
        `Ta mission (tour ${round}/${maxRounds}) :`,
        '- Identifie les problèmes bloquants, incohérences ou lacunes importantes.',
        '- Sois constructif et précis.',
        '- 5 critiques maximum.',
        '',
        `Si le livrable est satisfaisant, réponds UNIQUEMENT par :`,
        'VALIDÉ: [raison en une phrase]',
        '',
        'Sinon, liste tes critiques en commençant par le plus bloquant.'
      ].join('\n');

      const critiqueResult = await this.delegateToAgent(null, reviewer, reviewPrompt, {
        saveAsArtifact: false
      });
      const critique = critiqueResult.response.trim();

      rounds.push({ round, type: 'challenge', reviewer, reviewerIcon, critique });

      this.emit('pipeline:review:challenge', {
        pipelineId, stepIndex,
        reviewer, reviewerIcon, reviewerTitle,
        critique: critique.slice(0, 400),
        round, maxRounds
      });

      // ── Check for acceptance ─────────────────────────────────────────
      const isAccepted = /^VALID[EÉ]\s*:/i.test(critique);
      if (isAccepted) {
        const reason = critique.replace(/^VALID[EÉ]\s*:\s*/i, '').slice(0, 200);
        this.emit('pipeline:review:accepted', {
          pipelineId, stepIndex,
          reviewer, reviewerIcon, reviewerTitle,
          reason, by: 'signal', rounds: rounds.length
        });
        break;
      }

      // ── Primary agent revises (only if not last round) ───────────────
      if (round < maxRounds) {
        const revisionPrompt = [
          `${reviewerTitle} a examiné ton livrable et a des remarques.`,
          '',
          '--- TON LIVRABLE ACTUEL ---',
          currentResult.response,
          '--- FIN DU LIVRABLE ---',
          '',
          '--- CRITIQUE ---',
          critique,
          '--- FIN DE LA CRITIQUE ---',
          '',
          'Revois ce livrable en tenant compte des critiques ci-dessus.',
          'Produis une version améliorée et COMPLÈTE (pas juste les corrections — l\'intégralité du document).',
          `Instructions originales rappelées : ${step.task}`
        ].join('\n');

        const revisedResult = await this.delegateToAgent(null, step.agent, revisionPrompt, {
          saveAsArtifact: false
        });

        rounds.push({ round, type: 'revision', agent: step.agent, agentIcon: primaryResult.agentIcon });

        this.emit('pipeline:review:revision', {
          pipelineId, stepIndex,
          agent: step.agent, agentTitle: primaryTitle,
          agentIcon: primaryResult.agentIcon || '🤖',
          round, maxRounds
        });

        currentResult = {
          ...revisedResult,
          // Keep original metadata for pipeline bookkeeping
          agentIcon: primaryResult.agentIcon,
          agentTitle: primaryResult.agentTitle
        };
      } else {
        // Exhausted rounds — keep last revision
        this.emit('pipeline:review:accepted', {
          pipelineId, stepIndex,
          reviewer, reviewerIcon, reviewerTitle,
          reason: `${maxRounds} tours de révision terminés`,
          by: 'rounds', rounds: rounds.length
        });
      }
    }

    return {
      ...currentResult,
      peerReviewRounds: rounds
    };
  }

  _buildStepPrompt(step, previousOutput, contextSummary, allPreviousResults = []) {
    let prompt = '';

    if (step.task) {
      prompt += `TÂCHE : ${step.task}\n\n`;
    }
    if (step.instructions) {
      prompt += `INSTRUCTIONS : ${step.instructions}\n\n`;
    }

    // For code-generating or validation steps, include ALL previous results
    // so the agent can see the full PRD + backlog + architecture chain
    const needsFullContext = step.extractCode ||
      ['dev', 'qa'].includes(step.agent) ||
      (step.artifactType && ['code', 'test'].includes(step.artifactType));

    if (needsFullContext && allPreviousResults.length > 1) {
      prompt += `--- CONTEXTE COMPLET DU PIPELINE ---\n`;
      for (const result of allPreviousResults) {
        const label = result.agentTitle || result.agentName || 'Agent';
        prompt += `\n### Livrable de ${label} :\n${result.response}\n`;
      }
      prompt += `--- FIN DU CONTEXTE ---\n\n`;
    } else if (previousOutput) {
      prompt += `--- RÉSULTAT DE L'ÉTAPE PRÉCÉDENTE ---\n${previousOutput}\n--- FIN ---\n\n`;
    }

    if (contextSummary) {
      prompt += contextSummary;
    }

    prompt += '\n\nProduis un résultat détaillé et structuré pour cette étape. Réponds en français.';
    return prompt;
  }

  getPipelineStatus(pipelineId) {
    const state = this.activePipelines.get(pipelineId);
    if (!state) return null;
    return {
      ...state,
      // Sanitize results for IPC transfer (avoid huge payloads)
      steps: state.steps.map(s => ({
        ...s,
        result: s.result ? {
          agentName: s.result.agentName,
          agentTitle: s.result.agentTitle,
          agentIcon: s.result.agentIcon,
          response: s.result.response,
          usage: s.result.usage
        } : null
      }))
    };
  }

  listPipelines() {
    const pipelines = [];
    for (const [id, state] of this.activePipelines) {
      pipelines.push({
        id,
        name: state.name,
        status: state.status,
        currentStep: state.currentStep,
        totalSteps: state.steps.length,
        startedAt: state.startedAt,
        completedAt: state.completedAt
      });
    }
    return pipelines;
  }

  /**
   * Get predefined pipeline templates based on BMAD team definitions.
   */
  getPipelineTemplates() {
    return [
      {
        id: 'analysis-to-architecture',
        name: 'Analyse → Architecture',
        description: 'Analyste → Architecte : de l\'idée à la conception technique',
        steps: [
          { agent: 'analyst', task: 'Analyse des besoins', instructions: this._instr('pipeline-analyst-analysis', ANALYST_INSTRUCTIONS), artifactType: 'analysis', saveArtifact: true },
          { agent: 'architect', task: 'Conception architecture', instructions: this._instr('pipeline-architect-design', ARCHITECT_INSTRUCTIONS), artifactType: 'architecture', saveArtifact: true }
        ]
      },
      {
        id: 'full-product-design',
        name: 'Conception produit complète',
        description: 'Analyste → PM (PRD + Épics/Stories) → PO (Backlog) → Architecte → UX — avec revue croisée',
        steps: [
          { agent: 'analyst', task: 'Étude de marché et besoins', instructions: this._instr('pipeline-analyst-analysis', ANALYST_INSTRUCTIONS), artifactType: 'analysis', saveArtifact: true },
          { agent: 'pm', task: 'Rédaction PRD avec Épics et User Stories', instructions: this._instr('pipeline-pm-prd', PM_PRD_INSTRUCTIONS), artifactType: 'prd', saveArtifact: true,
            peerReview: { reviewer: 'analyst', maxRounds: 2, focus: 'cohérence entre l\'analyse des besoins et les user stories' } },
          { agent: 'po', task: 'Validation et backlog priorisé', instructions: this._instr('pipeline-po-backlog', PO_BACKLOG_INSTRUCTIONS), artifactType: 'backlog', saveArtifact: true,
            peerReview: { reviewer: 'pm', maxRounds: 1, focus: 'couverture complète des épics du PRD et faisabilité du Sprint 1' } },
          { agent: 'architect', task: 'Architecture technique', instructions: this._instr('pipeline-architect-design', ARCHITECT_INSTRUCTIONS), artifactType: 'architecture', saveArtifact: true,
            peerReview: { reviewer: 'po', maxRounds: 1, focus: 'correspondance entre l\'architecture et les user stories du backlog' } },
          { agent: 'ux-expert', task: 'Design UX/UI', instructions: this._instr('pipeline-ux-design', UX_DESIGN_INSTRUCTIONS), artifactType: 'design', saveArtifact: true }
        ]
      },
      {
        id: 'story-to-implementation',
        name: 'PRD → Backlog → Dev → QA',
        description: 'PM rédige le PRD, PO crée le backlog, Dev implémente, QA valide',
        steps: [
          { agent: 'pm', task: 'Rédaction PRD et user stories', instructions: this._instr('pipeline-pm-prd', PM_PRD_INSTRUCTIONS), artifactType: 'prd', saveArtifact: true },
          { agent: 'po', task: 'Backlog priorisé et critères d\'acceptation', instructions: this._instr('pipeline-po-backlog', PO_BACKLOG_INSTRUCTIONS), artifactType: 'backlog', saveArtifact: true },
          { agent: 'dev', task: 'Implémentation du code', instructions: this._instr('pipeline-dev-code', CODE_GEN_INSTRUCTIONS), artifactType: 'code', saveArtifact: true, extractCode: true },
          { agent: 'qa', task: 'Tests et validation', instructions: this._instr('pipeline-qa-test', QA_TEST_INSTRUCTIONS), artifactType: 'test', saveArtifact: true, extractCode: true }
        ]
      },
      {
        id: 'full-app-development',
        name: '🚀 Développement complet d\'application',
        description: 'Équipe complète : Analyste → PM → PO → Architecte → UX → Dev → QA → Fix',
        requiresWorkspace: true,
        steps: [
          { agent: 'analyst', task: 'Analyse des besoins et faisabilité', instructions: this._instr('pipeline-analyst-analysis', ANALYST_INSTRUCTIONS), artifactType: 'analysis', saveArtifact: true },
          { agent: 'pm', task: 'PRD avec Épics et User Stories', instructions: this._instr('pipeline-pm-prd', PM_PRD_INSTRUCTIONS), artifactType: 'prd', saveArtifact: true,
            peerReview: { reviewer: 'analyst', maxRounds: 2, focus: 'cohérence entre l\'analyse et les user stories' } },
          { agent: 'po', task: 'Backlog priorisé et critères d\'acceptation', instructions: this._instr('pipeline-po-backlog', PO_BACKLOG_INSTRUCTIONS), artifactType: 'backlog', saveArtifact: true,
            peerReview: { reviewer: 'pm', maxRounds: 1, focus: 'couverture complète des épics et faisabilité Sprint 1' } },
          { agent: 'architect', task: 'Architecture technique et structure fichiers', instructions: this._instr('pipeline-architect-design', ARCHITECT_INSTRUCTIONS), artifactType: 'architecture', saveArtifact: true,
            peerReview: { reviewer: 'po', maxRounds: 1, focus: 'faisabilité technique des user stories du backlog' } },
          { agent: 'ux-expert', task: 'Design UX/UI', instructions: this._instr('pipeline-ux-design', UX_DESIGN_INSTRUCTIONS), artifactType: 'design', saveArtifact: true },
          { agent: 'dev', task: 'Génération du code complet', instructions: this._instr('pipeline-dev-full-app', FULL_APP_CODE_INSTRUCTIONS), artifactType: 'code', saveArtifact: true, extractCode: true },
          { agent: 'qa', task: 'Tests et validation de la couverture', instructions: this._instr('pipeline-qa-test', QA_TEST_INSTRUCTIONS), artifactType: 'test', saveArtifact: true, extractCode: true },
          { agent: 'dev', task: 'Corrections et finalisation', instructions: this._instr('pipeline-dev-fix-finalize', FIX_AND_FINALIZE_INSTRUCTIONS), artifactType: 'code', saveArtifact: true, extractCode: true }
        ]
      },
      {
        id: 'code-review-pipeline',
        name: 'Revue de code',
        description: 'Architecture review → QA review → Recommandations',
        steps: [
          { agent: 'architect', task: 'Revue architecture', instructions: 'Évalue l\'architecture et la conception du code soumis. Identifie les problèmes structurels, les anti-patterns, et les améliorations possibles.', artifactType: 'analysis', saveArtifact: true },
          { agent: 'qa', task: 'Revue qualité', instructions: 'Analyse la qualité du code : tests manquants, bugs potentiels, bonnes pratiques, sécurité, performance.', artifactType: 'test', saveArtifact: true },
          { agent: 'dev', task: 'Synthèse et corrections', instructions: 'Synthétise les retours d\'architecture et QA. Propose et implémente les corrections concrètes.', artifactType: 'code', saveArtifact: true }
        ]
      },
      {
        id: 'market-study',
        name: '🔍 Étude de marché',
        description: 'Analyse concurrentielle approfondie, pain points utilisateurs, opportunités de différenciation',
        steps: [
          {
            agent: 'analyst',
            task: 'Étude de marché complète',
            instructions: this._instr('pipeline-analyst-market-study', MARKET_STUDY_INSTRUCTIONS),
            artifactType: 'analysis',
            saveArtifact: true
          }
        ]
      },
      {
        id: 'full-specifications',
        name: '📋 Spécifications complètes',
        description: 'Étude de marché (Analyst) → Specs fonctionnelles (PM) → Specs techniques (Architect) → Roadmap (PM)',
        steps: [
          {
            agent: 'analyst',
            task: 'Étude de marché',
            instructions: this._instr('pipeline-analyst-market-study', MARKET_STUDY_INSTRUCTIONS),
            artifactType: 'analysis',
            saveArtifact: true
          },
          {
            agent: 'pm',
            task: 'Spécifications fonctionnelles',
            instructions: this._instr('pipeline-pm-functional-spec', FUNCTIONAL_SPEC_INSTRUCTIONS),
            artifactType: 'documentation',
            saveArtifact: true,
            peerReview: { reviewer: 'analyst', maxRounds: 2, focus: 'cohérence entre les specs fonctionnelles et l\'étude de marché' }
          },
          {
            agent: 'architect',
            task: 'Spécifications techniques',
            instructions: this._instr('pipeline-architect-technical-spec', TECHNICAL_SPEC_INSTRUCTIONS),
            artifactType: 'architecture',
            saveArtifact: true,
            peerReview: { reviewer: 'pm', maxRounds: 2, focus: 'alignement des specs techniques avec les exigences fonctionnelles' }
          },
          {
            agent: 'pm',
            task: 'Roadmap produit',
            instructions: this._instr('pipeline-pm-roadmap', ROADMAP_INSTRUCTIONS),
            artifactType: 'documentation',
            saveArtifact: true,
            peerReview: { reviewer: 'analyst', maxRounds: 1, focus: 'réalisme des objectifs au regard de l\'étude de marché' }
          }
        ]
      }
    ];
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  PHASE 4 — Party Mode (multi-agent group chat)
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Start a multi-agent chat session (party mode).
   * @param {string[]} agentNames - List of agent names to include
   * @returns {Object} { partyId, agents, greeting }
   */
  async startParty(agentNames) {
    const partyId = `party-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

    // Load agent metadata for all participants
    const agents = [];
    for (const name of agentNames) {
      const meta = await this.bmadBackend.getAgentMetadata(name);
      const full = await this.bmadBackend.getAgent(name);
      agents.push({
        name,
        title: meta.title || meta.name || name,
        icon: meta.icon || '🤖',
        definition: full.rawContent
      });
    }

    const session = {
      id: partyId,
      agents,
      messages: [],
      createdAt: Date.now(),
      status: 'active'
    };

    // Greeting message
    const greeting = `🎉 **Mode Collaboration activé !**\n\nAgents présents :\n${agents.map(a => `${a.icon} **${a.title}**`).join('\n')}\n\nPosez votre question ou décrivez votre besoin. L'agent le plus pertinent répondra.\nUtilisez @nom pour cibler un agent spécifique (ex: @architect, @qa).`;

    session.messages.push({
      id: `msg-${Date.now()}`,
      role: 'system',
      agent: 'coordinator',
      agentIcon: '🎭',
      agentTitle: 'Coordinateur',
      content: greeting,
      timestamp: Date.now()
    });

    this.partySessions.set(partyId, session);

    return {
      partyId,
      agents: agents.map(a => ({ name: a.name, title: a.title, icon: a.icon })),
      greeting,
      messageCount: 1
    };
  }

  /**
   * Send a message in party mode. The coordinator routes it to the best agent(s).
   * @param {string} partyId - Party session ID
   * @param {string} userMessage - User's message
   * @param {Object} options - { targetAgent } for explicit @mention routing
   */
  async sendPartyMessage(partyId, userMessage, options = {}) {
    const session = this.partySessions.get(partyId);
    if (!session) throw new Error('PARTY_SESSION_NOT_FOUND');

    // Add user message
    session.messages.push({
      id: `msg-${Date.now()}`,
      role: 'user',
      content: userMessage,
      timestamp: Date.now()
    });

    // Determine which agent(s) should respond
    let targetAgents;

    if (options.targetAgent) {
      // User explicitly mentioned an agent
      const found = session.agents.find(a =>
        a.name === options.targetAgent ||
        a.title.toLowerCase().includes(options.targetAgent.toLowerCase())
      );
      if (found) targetAgents = [found];
    }

    if (!targetAgents || targetAgents.length === 0) {
      targetAgents = await this._routeMessage(session, userMessage);
    }

    const responses = [];

    for (const agent of targetAgents) {
      try {
        // Build conversation context for this agent
        const contextSummary = this.projectContext.buildContextForAgent(agent.name);
        const conversationContext = this._buildPartyContext(session, agent.name);

        const prompt = `${conversationContext}\n\n${contextSummary}\n\nMessage le plus récent de l'utilisateur : ${userMessage}\n\nRéponds en tant que ${agent.title}. Sois concis et pertinent. Concentre-toi sur ton domaine d'expertise.`;

        const result = await this.delegateToAgent(null, agent.name, prompt);

        const msgEntry = {
          id: `msg-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
          role: 'assistant',
          agent: agent.name,
          agentIcon: agent.icon,
          agentTitle: agent.title,
          content: result.response,
          usage: result.usage,
          timestamp: Date.now()
        };

        session.messages.push(msgEntry);
        responses.push(msgEntry);

      } catch (err) {
        const errorMsg = {
          id: `msg-${Date.now()}-err`,
          role: 'assistant',
          agent: agent.name,
          agentIcon: agent.icon,
          agentTitle: agent.title,
          content: `⚠️ Erreur : ${err.message}`,
          isError: true,
          timestamp: Date.now()
        };
        session.messages.push(errorMsg);
        responses.push(errorMsg);
      }
    }

    return { responses, messageCount: session.messages.length };
  }

  /**
   * Route a message to the most relevant agent(s) using LLM-based routing.
   */
  async _routeMessage(session, message) {
    // Fast rule-based routing: check for @mentions
    const mentionMatch = message.match(/@(\w[\w-]*)/);
    if (mentionMatch) {
      const mentioned = mentionMatch[1].toLowerCase();
      const found = session.agents.find(a =>
        a.name.toLowerCase().includes(mentioned) ||
        a.title.toLowerCase().includes(mentioned)
      );
      if (found) return [found];
    }

    // LLM-based routing
    const agentDescriptions = {
      'analyst': 'Analyse des besoins, étude de marché, brainstorming, identification des fonctionnalités',
      'pm': 'Rédaction du PRD, épics et user stories, product strategy, roadmap',
      'po': 'Backlog priorisé, validation des user stories, critères d\'acceptation, sprint planning',
      'architect': 'Architecture technique, choix de stack, structure du projet, conception système',
      'ux-expert': 'Design UX/UI, wireframes, maquettes SVG, parcours utilisateur',
      'dev': 'Développement, code, implémentation, debugging, refactoring',
      'qa': 'Tests, qualité, revue de code, validation, bugs',
      'sm': 'Scrum, sprints, rétrospective, agilité, facilitation',
      'bmad-master': 'Aide BMAD, workflows, méthodologie',
      'bmad-orchestrator': 'Orchestration globale, coordination multi-agent',
    };
    const agentList = session.agents.map(a => {
      const desc = agentDescriptions[a.name] || a.title;
      return `- ${a.name} (${a.title}): ${desc}`;
    }).join('\n');
    const routingPrompt = `Tu es un coordinateur d'équipe. Voici les agents disponibles et leurs domaines :
${agentList}

Message de l'utilisateur : "${message}"

RÈGLES de routage :
- Si le message concerne des user stories, un backlog, ou des critères d'acceptation → po
- Si le message concerne un PRD, des spécifications produit, ou des épics → pm
- Si le message concerne l'analyse du besoin, l'étude de marché → analyst
- Si le message concerne du code, du développement → dev
- Si le message concerne des tests, de la qualité → qa
- Si le message concerne l'architecture, la conception technique → architect
- Si le message concerne le design, l'UX/UI → ux-expert

Réponds UNIQUEMENT avec le nom (name) de l'agent le plus pertinent. Si 2 agents sont nécessaires, sépare-les par une virgule. Maximum 2 agents. FORMAT : uniquement les noms, rien d'autre.`;

    try {
      const subSessionId = `routing-${Date.now()}`;
      this.aiService.conversations.set(subSessionId, {
        systemPrompt: 'Tu es un routeur de messages. Réponds uniquement avec le nom de l\'agent approprié, rien d\'autre.',
        agentName: 'Router',
        messages: [],
        createdAt: Date.now()
      });

      const result = await this.aiService.sendMessage(subSessionId, routingPrompt);
      this.aiService.conversations.delete(subSessionId);

      // Parse response to find agent names
      const responseText = result.content.toLowerCase().trim();
      const matchedAgents = session.agents.filter(a =>
        responseText.includes(a.name.toLowerCase())
      );

      if (matchedAgents.length > 0) return matchedAgents.slice(0, 2);
    } catch {
      // Fallback on error
    }

    // Fallback: first agent in list
    return [session.agents[0]];
  }

  _buildPartyContext(session, currentAgentName) {
    const recent = session.messages.slice(-20);
    if (recent.length === 0) return '';

    const lines = ['--- CONVERSATION EN COURS (Mode Collaboration) ---'];
    for (const msg of recent) {
      if (msg.role === 'user') {
        lines.push(`[Utilisateur] : ${msg.content}`);
      } else if (msg.role === 'assistant') {
        lines.push(`[${msg.agentTitle}] : ${msg.content}`);
      } else if (msg.role === 'system') {
        // skip system messages
      }
    }
    lines.push('--- FIN CONVERSATION ---');
    return lines.join('\n');
  }

  getPartySession(partyId) {
    const session = this.partySessions.get(partyId);
    if (!session) return null;
    return {
      id: session.id,
      agents: session.agents.map(a => ({ name: a.name, title: a.title, icon: a.icon })),
      messages: session.messages,
      messageCount: session.messages.length,
      status: session.status,
      createdAt: session.createdAt
    };
  }

  endParty(partyId) {
    this.partySessions.delete(partyId);
    return { success: true };
  }

  listPartySessions() {
    const sessions = [];
    for (const [id, session] of this.partySessions) {
      sessions.push({
        id,
        agents: session.agents.map(a => ({ name: a.name, title: a.title, icon: a.icon })),
        messageCount: session.messages.length,
        status: session.status,
        createdAt: session.createdAt
      });
    }
    return sessions;
  }
}

module.exports = AgentCoordinator;
