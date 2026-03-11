#!/usr/bin/env node
import { readFileSync, statSync } from 'node:fs';
import { resolve, basename, extname } from 'node:path';

/**
 * Local dashboard relay for Quinn CRM
 *
 * Usage:
 *   node scripts/dashboard-relay.mjs poll [--productId=<id>]
 *   node scripts/dashboard-relay.mjs create --title="..." --description="..." [--productId=<id>] [--priority=high]
 *   node scripts/dashboard-relay.mjs update --taskId=<id> [--status=in_progress] [--title="..."]
 *   node scripts/dashboard-relay.mjs comment --taskId=<id> --comment="..."
 *   node scripts/dashboard-relay.mjs list-contacts [--productId=<id>] [--limit=50]
 *   node scripts/dashboard-relay.mjs create-contact --name="..." [--productId=<id>] [--email="..."]
 *   node scripts/dashboard-relay.mjs update-contact --contactId=<id> [--status=contacted] [--name="..."]
 *   node scripts/dashboard-relay.mjs delete-contact --contactId=<id> [--productId=<id>]
 *   node scripts/dashboard-relay.mjs sync-docs [--agentId=quinn-main] [--files="README-front.md,README-backend.md,AGENTS.md"]
 *
 * Required env:
 *   OPENCLAW_SECRET=<secret>
 *
 * Optional env:
 *   API_BASE_URL=https://europe-west1-quinn-dash.cloudfunctions.net/api
 *   CREATE_TASK_URL=https://europe-west1-quinn-dash.cloudfunctions.net/createTask
 *   UPDATE_TASK_URL=https://europe-west1-quinn-dash.cloudfunctions.net/updateTask
 *   ADD_TASK_COMMENT_URL=https://europe-west1-quinn-dash.cloudfunctions.net/addTaskComment
 *   ADD_ACTIVITY_NOTE_URL=https://europe-west1-quinn-dash.cloudfunctions.net/api/openclaw/addActivityNote
 *   DEFAULT_PRODUCT_ID=<product-id>
 *   DEFAULT_OWNER=Quinn
 */

const env = process.env;
const OPENCLAW_SECRET = env.OPENCLAW_SECRET;
if (!OPENCLAW_SECRET) {
  console.error('Missing OPENCLAW_SECRET in env');
  process.exit(1);
}

const API_BASE_URL = (env.API_BASE_URL || 'https://europe-west1-quinn-dash.cloudfunctions.net/api').replace(/\/$/, '');
const CREATE_TASK_URL = env.CREATE_TASK_URL || 'https://europe-west1-quinn-dash.cloudfunctions.net/createTask';
const UPDATE_TASK_URL = env.UPDATE_TASK_URL || 'https://europe-west1-quinn-dash.cloudfunctions.net/updateTask';
const ADD_TASK_COMMENT_URL = env.ADD_TASK_COMMENT_URL || 'https://europe-west1-quinn-dash.cloudfunctions.net/addTaskComment';
const ADD_ACTIVITY_NOTE_URL = env.ADD_ACTIVITY_NOTE_URL || `${API_BASE_URL}/openclaw/addActivityNote`;

function parseArgs(argv) {
  const out = { _: [] };
  for (const token of argv) {
    if (token.startsWith('--')) {
      const [k, ...rest] = token.slice(2).split('=');
      out[k] = rest.length ? rest.join('=') : true;
    } else {
      out._.push(token);
    }
  }
  return out;
}

async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-openclaw-key': OPENCLAW_SECRET,
    },
    body: JSON.stringify(body || {}),
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status} ${res.statusText}`);
    err.response = json;
    throw err;
  }
  return json;
}

function nowIso() {
  return new Date().toISOString();
}

function defaultAcceptanceCriteria(title = 'task') {
  return [
    `Scope for "${title}" is clearly defined`,
    'Implementation is completed and reviewed',
    'Validation/testing completed with expected result',
    'Progress updates are posted to task comments',
  ];
}

async function cmdPoll(args) {
  const explicitProductId = args.productId || env.DEFAULT_PRODUCT_ID;
  let productIds = explicitProductId ? [explicitProductId] : [];

  if (productIds.length === 0) {
    const lp = await postJson(`${API_BASE_URL}/openclaw/listProducts`, {});
    const items = Array.isArray(lp?.data?.items) ? lp.data.items : [];
    productIds = items.map((p) => p?.id).filter(Boolean);
    if (productIds.length === 0) {
      throw new Error('No products found. Set DEFAULT_PRODUCT_ID or create a product first.');
    }
  }

  const all = [];
  for (const productId of productIds) {
    const data = await postJson(`${API_BASE_URL}/openclaw/listTasks`, { productId });
    const tasks = Array.isArray(data?.data) ? data.data : Array.isArray(data?.tasks) ? data.tasks : [];
    const summary = {
      at: nowIso(),
      productId,
      count: tasks.length,
      backlog: tasks.filter((t) => t?.status === 'backlog' || t?.status === 'todo').length,
      in_progress: tasks.filter((t) => t?.status === 'in_progress').length,
      blocked: tasks.filter((t) => t?.status === 'blocked').length,
      review: tasks.filter((t) => t?.status === 'review').length,
      done: tasks.filter((t) => t?.status === 'done').length,
    };
    all.push({ productId, summary, tasks });

    try {
      await postJson(ADD_ACTIVITY_NOTE_URL, {
        productId,
        note: `[relay poll] ${summary.count} tasks | backlog:${summary.backlog} in_progress:${summary.in_progress} blocked:${summary.blocked} review:${summary.review} done:${summary.done}`,
        source: 'dashboard-relay',
        at: summary.at,
      });
    } catch {
      // non-fatal
    }
  }

  console.log(JSON.stringify({ ok: true, action: 'poll', products: all }, null, 2));
}

async function cmdCreate(args) {
  const title = args.title || 'Untitled task';
  const description = args.description || 'No description provided.';
  const productId = args.productId || env.DEFAULT_PRODUCT_ID;
  const owner = args.owner || env.DEFAULT_OWNER || 'Quinn';
  const priority = args.priority || 'medium';
  const status = args.status || 'todo';
  const dueAt = args.dueAt || null;

  const body = {
    productId,
    title,
    description,
    owner,
    priority,
    status,
    dueAt,
    acceptanceCriteria: args.acceptanceCriteria
      ? args.acceptanceCriteria.split('||').map((s) => s.trim()).filter(Boolean)
      : defaultAcceptanceCriteria(title),
    source: 'openclaw-relay',
    createdAt: nowIso(),
  };

  const data = await postJson(CREATE_TASK_URL, body);
  console.log(JSON.stringify({ ok: true, action: 'create', request: body, response: data }, null, 2));
}

async function cmdUpdate(args) {
  const taskId = args.taskId;
  if (!taskId) throw new Error('--taskId is required');

  const body = {
    taskId,
    title: args.title,
    description: args.description,
    status: args.status,
    priority: args.priority,
    owner: args.owner,
    dueAt: args.dueAt,
    updatedAt: nowIso(),
  };

  Object.keys(body).forEach((k) => body[k] === undefined && delete body[k]);

  const data = await postJson(UPDATE_TASK_URL, body);
  console.log(JSON.stringify({ ok: true, action: 'update', request: body, response: data }, null, 2));
}

async function cmdComment(args) {
  const taskId = args.taskId;
  const comment = args.comment;
  if (!taskId) throw new Error('--taskId is required');
  if (!comment) throw new Error('--comment is required');

  const body = {
    taskId,
    comment,
    author: args.author || env.DEFAULT_OWNER || 'Quinn',
    createdAt: nowIso(),
  };

  const data = await postJson(ADD_TASK_COMMENT_URL, body);
  console.log(JSON.stringify({ ok: true, action: 'comment', request: body, response: data }, null, 2));
}

async function cmdListContacts(args) {
  const productId = args.productId || env.DEFAULT_PRODUCT_ID;
  if (!productId) throw new Error('--productId required (or set DEFAULT_PRODUCT_ID)');
  const limit = Number(args.limit || 50);
  const data = await postJson(`${API_BASE_URL}/openclaw/listContacts`, {
    productId,
    agentId: args.agentId || 'quinn-main',
    limit,
  });
  console.log(JSON.stringify({ ok: true, action: 'list-contacts', response: data }, null, 2));
}

async function cmdCreateContact(args) {
  const productId = args.productId || env.DEFAULT_PRODUCT_ID;
  const name = args.name;
  if (!productId) throw new Error('--productId required (or set DEFAULT_PRODUCT_ID)');
  if (!name) throw new Error('--name is required');
  const body = {
    productId,
    agentId: args.agentId || 'quinn-main',
    name,
    kind: args.kind || 'lead',
    status: args.status || 'new',
    company: args.company || '',
    title: args.title || '',
    email: args.email || '',
    phone: args.phone || '',
    linkedin: args.linkedin || '',
    website: args.website || '',
    location: args.location || '',
    notes: args.notes || '',
    tags: args.tags ? args.tags.split(',').map((s) => s.trim()).filter(Boolean) : [],
    linkedTaskIds: args.linkedTaskIds ? args.linkedTaskIds.split(',').map((s) => s.trim()).filter(Boolean) : [],
  };
  const data = await postJson(`${API_BASE_URL}/openclaw/createContact`, body);
  console.log(JSON.stringify({ ok: true, action: 'create-contact', request: body, response: data }, null, 2));
}

async function cmdUpdateContact(args) {
  const productId = args.productId || env.DEFAULT_PRODUCT_ID;
  const contactId = args.contactId;
  if (!productId) throw new Error('--productId required (or set DEFAULT_PRODUCT_ID)');
  if (!contactId) throw new Error('--contactId is required');

  const patch = {
    name: args.name,
    kind: args.kind,
    status: args.status,
    company: args.company,
    title: args.title,
    email: args.email,
    phone: args.phone,
    linkedin: args.linkedin,
    website: args.website,
    location: args.location,
    notes: args.notes,
    tags: args.tags ? args.tags.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
    linkedTaskIds: args.linkedTaskIds ? args.linkedTaskIds.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
  };
  Object.keys(patch).forEach((k) => patch[k] === undefined && delete patch[k]);

  const body = {
    productId,
    contactId,
    agentId: args.agentId || 'quinn-main',
    patch,
  };
  const data = await postJson(`${API_BASE_URL}/openclaw/updateContact`, body);
  console.log(JSON.stringify({ ok: true, action: 'update-contact', request: body, response: data }, null, 2));
}

async function cmdDeleteContact(args) {
  const productId = args.productId || env.DEFAULT_PRODUCT_ID;
  const contactId = args.contactId;
  if (!productId) throw new Error('--productId required (or set DEFAULT_PRODUCT_ID)');
  if (!contactId) throw new Error('--contactId is required');

  const body = {
    productId,
    contactId,
    agentId: args.agentId || 'quinn-main',
  };
  const data = await postJson(`${API_BASE_URL}/openclaw/deleteContact`, body);
  console.log(JSON.stringify({ ok: true, action: 'delete-contact', request: body, response: data }, null, 2));
}

async function cmdSyncDocs(args) {
  const agentId = args.agentId || 'quinn-main';
  const root = resolve(args.root || process.cwd());
  const defaultFiles = ['README-front.md', 'README-backend.md', 'AGENTS.md', 'USER.md'];
  const files = (args.files ? String(args.files).split(',') : defaultFiles)
    .map((s) => s.trim())
    .filter(Boolean);

  const docs = [];
  for (const rel of files) {
    const abs = resolve(root, rel);
    try {
      const content = readFileSync(abs, 'utf8');
      const st = statSync(abs);
      const words = content.trim() ? content.trim().split(/\s+/).length : 0;
      docs.push({
        id: rel.replace(/[^a-zA-Z0-9._/-]/g, '_'),
        name: basename(rel),
        type: extname(rel).replace('.', '') || 'text',
        sourceFile: rel,
        content,
        summary: content.slice(0, 280),
        tags: ['auto-sync', 'workspace-doc'],
        sizeBytes: st.size,
        wordCount: words,
        modifiedAt: new Date(st.mtimeMs).toISOString(),
      });
    } catch (e) {
      // skip unreadable files
    }
  }

  const body = {
    agentId,
    generatedAt: nowIso(),
    docs,
  };

  const data = await postJson(`${API_BASE_URL}/openclaw/syncDocs`, body);
  console.log(JSON.stringify({ ok: true, action: 'sync-docs', sent: docs.length, response: data }, null, 2));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cmd = args._[0];

  if (!cmd || ['help', '-h', '--help'].includes(cmd)) {
    console.log('Usage: poll | create | update | comment | list-contacts | create-contact | update-contact | delete-contact | sync-docs (see file header for examples)');
    return;
  }

  if (cmd === 'poll') return cmdPoll(args);
  if (cmd === 'create') return cmdCreate(args);
  if (cmd === 'update') return cmdUpdate(args);
  if (cmd === 'comment') return cmdComment(args);
  if (cmd === 'list-contacts') return cmdListContacts(args);
  if (cmd === 'create-contact') return cmdCreateContact(args);
  if (cmd === 'update-contact') return cmdUpdateContact(args);
  if (cmd === 'delete-contact') return cmdDeleteContact(args);
  if (cmd === 'sync-docs') return cmdSyncDocs(args);

  throw new Error(`Unknown command: ${cmd}`);
}

main().catch((err) => {
  console.error('relay error:', err.message);
  if (err.response) console.error(JSON.stringify(err.response, null, 2));
  process.exit(1);
});
