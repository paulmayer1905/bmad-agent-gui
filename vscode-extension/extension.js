// ─── BMAD Agent Launcher — VS Code Chat Participants Extension ────────────
// Registers BMAD agents as Chat Participants in the VS Code Chat panel.
// Users see @bmad-party, @bmad-orchestrator, @bmad-master, @bmad-analyst, etc.
// in the Chat dropdown and can invoke them with natural language.

const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

// ─── Agent definitions ────────────────────────────────────────────────────
// Maps participant IDs to their bmad-core agent file names
const AGENT_MAP = {
  'bmad.orchestrator': 'bmad-orchestrator',
  'bmad.master':       'bmad-master',
  'bmad.analyst':      'analyst',
  'bmad.architect':    'architect',
  'bmad.pm':           'pm',
  'bmad.dev':          'dev',
  'bmad.qa':           'qa',
  'bmad.po':           'po',
  'bmad.sm':           'sm',
  'bmad.ux':           'ux-expert',
};

const AGENT_LABELS = {
  'bmad-orchestrator': { icon: '🎭', title: 'BMad Orchestrator' },
  'bmad-master':       { icon: '🧙', title: 'BMad Master' },
  'analyst':           { icon: '📊', title: 'Analyste Métier' },
  'architect':         { icon: '🏗️', title: 'Architecte Logiciel' },
  'pm':                { icon: '📋', title: 'Chef de Projet' },
  'dev':               { icon: '💻', title: 'Développeur Senior' },
  'qa':                { icon: '🧪', title: 'Ingénieur QA' },
  'po':                { icon: '📝', title: 'Product Owner' },
  'sm':                { icon: '🔄', title: 'Scrum Master' },
  'ux-expert':         { icon: '🎨', title: 'Expert UX' },
};

// All specialist agents (excluding meta-agents) for party mode
const SPECIALIST_AGENTS = [
  'analyst', 'architect', 'pm', 'dev', 'qa', 'po', 'sm', 'ux-expert'
];

// ─── Utilities ────────────────────────────────────────────────────────────

/**
 * Find the bmad-core directory relative to the workspace.
 * Searches the workspace folders and common parent patterns.
 */
function findBmadCore() {
  // 1. Check workspace folders
  const workspaceFolders = vscode.workspace.workspaceFolders || [];
  for (const folder of workspaceFolders) {
    const candidate = path.join(folder.uri.fsPath, 'bmad-core');
    if (fs.existsSync(candidate)) return candidate;
    // Also check parent (monorepo pattern)
    const parentCandidate = path.join(folder.uri.fsPath, '..', 'bmad-core');
    if (fs.existsSync(parentCandidate)) return path.resolve(parentCandidate);
  }

  // 2. Check relative to extension directory
  let dir = __dirname;
  for (let i = 0; i < 5; i++) {
    const candidate = path.join(dir, 'bmad-core');
    if (fs.existsSync(candidate)) return candidate;
    dir = path.dirname(dir);
  }

  return null;
}

/**
 * Load an agent's markdown persona file from bmad-core/agents/.
 */
function loadAgentPersona(agentName) {
  const bmadCore = findBmadCore();
  if (!bmadCore) return null;

  const agentPath = path.join(bmadCore, 'agents', `${agentName}.md`);
  if (!fs.existsSync(agentPath)) return null;

  return fs.readFileSync(agentPath, 'utf8');
}

/**
 * Build a system prompt from an agent's persona file.
 * Extracts the key sections and formats for the VS Code LM API.
 */
function buildSystemPrompt(agentName) {
  const persona = loadAgentPersona(agentName);
  if (!persona) {
    const label = AGENT_LABELS[agentName] || { icon: '🤖', title: agentName };
    return `Tu es ${label.title} (${label.icon}), un agent spécialisé de la BMAD-METHOD. Réponds en tant qu'expert dans ton domaine.`;
  }
  // Use the full agent file as system prompt — it contains persona, commands, etc.
  return persona;
}

/**
 * Build the Party Mode system prompt that instructs the LLM to synthesize
 * multiple specialist perspectives.
 */
function buildPartySystemPrompt(agentNames) {
  const agentDescriptions = agentNames.map(name => {
    const label = AGENT_LABELS[name] || { icon: '🤖', title: name };
    return `- ${label.icon} **${label.title}** (${name})`;
  }).join('\n');

  return `Tu es le coordinateur BMAD **Party Mode** 🎊. Tu dois répondre à la question de l'utilisateur en synthétisant les perspectives de TOUS les agents spécialistes suivants :

${agentDescriptions}

INSTRUCTIONS :
1. Analyse la question de l'utilisateur
2. Pour chaque agent pertinent, donne sa perspective spécifique avec son icône
3. Termine par une synthèse coordonnée
4. Utilise le format suivant pour chaque agent :

### {icon} {title}
{réponse spécifique à l'expertise de cet agent}

### 🎯 Synthèse Party Mode
{conclusion coordonnée intégrant toutes les perspectives}

Sois concis mais complet. Chaque agent ne doit intervenir que s'il a quelque chose de pertinent à apporter.`;
}

// ─── Chat request handlers ────────────────────────────────────────────────

/**
 * Generic handler for a single-agent chat participant.
 * Uses the VS Code Language Model API to send messages with the agent's persona.
 */
function createAgentHandler(agentName) {
  return async (request, context, stream, token) => {
    const label = AGENT_LABELS[agentName] || { icon: '🤖', title: agentName };

    // Handle /help command
    if (request.command === 'help') {
      stream.markdown(`## ${label.icon} ${label.title} — Aide\n\n`);
      stream.markdown(`Je suis **${label.title}**, un agent spécialisé de la BMAD-METHOD.\n\n`);
      stream.markdown(`### Commandes disponibles\n`);
      stream.markdown(`- \`/help\` — Afficher cette aide\n`);
      if (agentName === 'bmad-orchestrator' || agentName === 'bmad-master') {
        stream.markdown(`- \`/task\` — Lister ou exécuter une tâche\n`);
        stream.markdown(`- \`/workflow\` — Lancer un workflow\n`);
        stream.markdown(`- \`/agent\` — Transformer en agent spécialisé\n`);
        stream.markdown(`- \`/checklist\` — Exécuter une checklist\n`);
      }
      stream.markdown(`\nPosez-moi une question dans mon domaine d'expertise !\n`);
      return;
    }

    // Handle /task, /workflow, /agent, /checklist for meta-agents
    if (request.command && (agentName === 'bmad-orchestrator' || agentName === 'bmad-master')) {
      return handleMetaCommand(agentName, request, stream, token);
    }

    // Standard message — send to LLM with agent persona
    const systemPrompt = buildSystemPrompt(agentName);
    await sendToLLM(systemPrompt, request, context, stream, token);
  };
}

/**
 * Party Mode handler — synthesizes multiple agent perspectives.
 */
async function partyHandler(request, context, stream, token) {
  // /start command — let user pick agents
  if (request.command === 'start') {
    stream.markdown(`## 🎊 Party Mode — Sélection d'agents\n\n`);
    stream.markdown(`Tous les agents spécialistes participent par défaut :\n\n`);
    SPECIALIST_AGENTS.forEach(name => {
      const label = AGENT_LABELS[name];
      stream.markdown(`- ${label.icon} **${label.title}**\n`);
    });
    stream.markdown(`\nPosez votre question et tous les experts répondront !\n`);
    return;
  }

  // /all command or default — query all agents
  const agents = SPECIALIST_AGENTS;
  const systemPrompt = buildPartySystemPrompt(agents);

  stream.markdown(`### 🎊 Party Mode — ${agents.length} agents mobilisés\n\n`);
  await sendToLLM(systemPrompt, request, context, stream, token);
}

/**
 * Handle * commands (task, workflow, agent, checklist) for meta-agents.
 */
async function handleMetaCommand(agentName, request, stream, token) {
  const bmadCore = findBmadCore();
  if (!bmadCore) {
    stream.markdown(`⚠️ Dossier \`bmad-core\` introuvable. Vérifiez que le workspace contient le projet BMAD.\n`);
    return;
  }

  const command = request.command;
  const arg = request.prompt.trim();
  const label = AGENT_LABELS[agentName];

  switch (command) {
    case 'task': {
      const tasksDir = path.join(bmadCore, 'tasks');
      if (!arg) {
        // List tasks
        stream.markdown(`## ${label.icon} Tâches disponibles\n\n`);
        if (fs.existsSync(tasksDir)) {
          const files = fs.readdirSync(tasksDir).filter(f => f.endsWith('.md'));
          files.forEach((f, i) => {
            stream.markdown(`${i + 1}. \`${f.replace('.md', '')}\`\n`);
          });
          stream.markdown(`\nUtilisez \`/task nom-de-la-tache\` pour l'exécuter.\n`);
        }
      } else {
        // Load and present task
        const taskFile = path.join(tasksDir, arg.endsWith('.md') ? arg : `${arg}.md`);
        if (fs.existsSync(taskFile)) {
          const content = fs.readFileSync(taskFile, 'utf8');
          stream.markdown(`## ${label.icon} Tâche : ${arg}\n\n`);
          stream.markdown(content);
        } else {
          stream.markdown(`⚠️ Tâche \`${arg}\` introuvable.\n`);
        }
      }
      return;
    }
    case 'workflow': {
      const workflowsDir = path.join(bmadCore, 'workflows');
      if (!arg) {
        stream.markdown(`## ${label.icon} Workflows disponibles\n\n`);
        if (fs.existsSync(workflowsDir)) {
          const files = fs.readdirSync(workflowsDir).filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));
          files.forEach((f, i) => {
            stream.markdown(`${i + 1}. \`${f.replace(/\.(yaml|yml)$/, '')}\`\n`);
          });
          stream.markdown(`\nUtilisez \`/workflow nom\` pour démarrer.\n`);
        }
      } else {
        stream.markdown(`## ${label.icon} Workflow : ${arg}\n\nLancement du workflow **${arg}**...\n`);
      }
      return;
    }
    case 'agent': {
      if (!arg) {
        stream.markdown(`## ${label.icon} Agents disponibles\n\n`);
        Object.entries(AGENT_LABELS).forEach(([name, info]) => {
          stream.markdown(`- ${info.icon} **${info.title}** — \`@bmad-${name === 'ux-expert' ? 'ux' : name}\`\n`);
        });
        stream.markdown(`\nMentionnez un agent dans le Chat pour lui parler directement.\n`);
      } else {
        stream.markdown(`Utilisez \`@bmad-${arg}\` dans le Chat pour parler à cet agent.\n`);
      }
      return;
    }
    case 'checklist': {
      const checklistsDir = path.join(bmadCore, 'checklists');
      if (!arg) {
        stream.markdown(`## ${label.icon} Checklists disponibles\n\n`);
        if (fs.existsSync(checklistsDir)) {
          const files = fs.readdirSync(checklistsDir).filter(f => f.endsWith('.md'));
          files.forEach((f, i) => {
            stream.markdown(`${i + 1}. \`${f.replace('.md', '')}\`\n`);
          });
          stream.markdown(`\nUtilisez \`/checklist nom\` pour l'exécuter.\n`);
        }
      } else {
        const checklistFile = path.join(checklistsDir, arg.endsWith('.md') ? arg : `${arg}.md`);
        if (fs.existsSync(checklistFile)) {
          const content = fs.readFileSync(checklistFile, 'utf8');
          stream.markdown(`## ${label.icon} Checklist : ${arg}\n\n`);
          stream.markdown(content);
        } else {
          stream.markdown(`⚠️ Checklist \`${arg}\` introuvable.\n`);
        }
      }
      return;
    }
  }
}

/**
 * Send a message to the VS Code Language Model (Copilot/Claude) with a system prompt.
 */
async function sendToLLM(systemPrompt, request, context, stream, token) {
  // Select the best available model
  const models = await vscode.lm.selectChatModels({
    vendor: 'copilot',
    family: 'gpt-4o'
  });

  // Fallback: try any available model
  let model = models[0];
  if (!model) {
    const allModels = await vscode.lm.selectChatModels();
    model = allModels[0];
  }

  if (!model) {
    stream.markdown('⚠️ Aucun modèle de langage disponible. Vérifiez que GitHub Copilot est actif.\n');
    return;
  }

  // Build messages array
  const messages = [
    vscode.LanguageModelChatMessage.User(systemPrompt),
  ];

  // Add conversation history from context
  if (context.history) {
    for (const turn of context.history) {
      if (turn instanceof vscode.ChatResponseTurn) {
        // Reconstruct assistant response from parts
        let text = '';
        for (const part of turn.response) {
          if (part instanceof vscode.ChatResponseMarkdownPart) {
            text += part.value.value;
          }
        }
        if (text) {
          messages.push(vscode.LanguageModelChatMessage.Assistant(text));
        }
      } else if (turn instanceof vscode.ChatRequestTurn) {
        messages.push(vscode.LanguageModelChatMessage.User(turn.prompt));
      }
    }
  }

  // Add user's current message
  messages.push(vscode.LanguageModelChatMessage.User(request.prompt));

  // Stream the response
  try {
    const response = await model.sendRequest(messages, {}, token);
    for await (const chunk of response.text) {
      stream.markdown(chunk);
    }
  } catch (err) {
    if (err instanceof vscode.LanguageModelError) {
      if (err.code === vscode.LanguageModelError.NoPermissions.name) {
        stream.markdown('⚠️ Accès refusé. Autorisez BMAD Agent Launcher à utiliser le modèle de langage.\n');
      } else {
        stream.markdown(`⚠️ Erreur LM : ${err.message}\n`);
      }
    } else {
      throw err;
    }
  }
}

// ─── Extension activation ─────────────────────────────────────────────────

function activate(context) {
  console.log('BMAD Agent Launcher activating...');

  // ── Register Party Mode participant ──
  const party = vscode.chat.createChatParticipant('bmad.party', partyHandler);
  party.iconPath = vscode.Uri.joinPath(context.extensionUri, 'icons', 'party.png');
  context.subscriptions.push(party);

  // ── Register all single-agent participants ──
  for (const [participantId, agentName] of Object.entries(AGENT_MAP)) {
    const handler = createAgentHandler(agentName);
    const participant = vscode.chat.createChatParticipant(participantId, handler);
    // Try to set icon
    const iconFile = path.join(context.extensionPath, 'icons', `${agentName}.png`);
    if (fs.existsSync(iconFile)) {
      participant.iconPath = vscode.Uri.file(iconFile);
    }
    context.subscriptions.push(participant);
  }

  // ── Register launch GUI command ──
  context.subscriptions.push(
    vscode.commands.registerCommand('bmad.launchGUI', async () => {
      const terminal = vscode.window.createTerminal({
        name: 'BMAD GUI',
        cwd: path.join(__dirname, '..'),
      });
      terminal.sendText('npm run electron:start');
      terminal.show();
    })
  );

  console.log(`BMAD Agent Launcher: ${Object.keys(AGENT_MAP).length + 1} chat participants registered`);
}

function deactivate() {}

module.exports = { activate, deactivate };
