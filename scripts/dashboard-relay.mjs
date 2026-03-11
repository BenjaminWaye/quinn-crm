#!/usr/bin/env node
import { readFileSync, statSync, readdirSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
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
 *   CREATE_TASK_URL=https://europe-west1-quinn-dash.cloudfunctions.net/api/openclaw/createTask
 *   UPDATE_TASK_URL=https://europe-west1-quinn-dash.cloudfunctions.net/api/openclaw/updateTask
 *   ADD_TASK_COMMENT_URL=https://europe-west1-quinn-dash.cloudfunctions.net/api/openclaw/addTaskComment
 *   ADD_ACTIVITY_NOTE_URL=https://europe-west1-quinn-dash.cloudfunctions.net/api/openclaw/addActivityNote
 *   DEFAULT_PRODUCT_ID=<product-id>
 *   DEFAULT_AGENT_ID=quinn-main
 */

const env = process.env;
const OPENCLAW_SECRET = env.OPENCLAW_SECRET;
if (!OPENCLAW_SECRET) {
  console.error('Missing OPENCLAW_SECRET in env');
  process.exit(1);
}

const API_BASE_URL = (env.API_BASE_URL || 'https://europe-west1-quinn-dash.cloudfunctions.net/api').replace(/\/$/, '');
const CREATE_TASK_URL = env.CREATE_TASK_URL || `${API_BASE_URL}/openclaw/createTask`;
const UPDATE_TASK_URL = env.UPDATE_TASK_URL || `${API_BASE_URL}/openclaw/updateTask`;
const ADD_TASK_COMMENT_URL = env.ADD_TASK_COMMENT_URL || `${API_BASE_URL}/openclaw/addTaskComment`;
const ADD_ACTIVITY_NOTE_URL = env.ADD_ACTIVITY_NOTE_URL || `${API_BASE_URL}/openclaw/addActivityNote`;
const LIST_TASK_COMMENTS_URL = env.LIST_TASK_COMMENTS_URL || `${API_BASE_URL}/openclaw/listTaskComments`;
const SYNC_SCHEDULES_URL = env.SYNC_SCHEDULES_URL || `${API_BASE_URL}/openclaw/syncSchedules`;
const DEFAULT_AGENT_ID = env.DEFAULT_AGENT_ID || 'quinn-main';

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

function listFilesRecursive(root, exts = new Set(), ignoreDirs = new Set()) {
  const out = [];
  const walk = (dir, relBase = '') => {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const ent of entries) {
      const abs = resolve(dir, ent.name);
      const rel = relBase ? `${relBase}/${ent.name}` : ent.name;
      if (ent.isDirectory()) {
        if (ignoreDirs.has(ent.name)) continue;
        walk(abs, rel);
        continue;
      }
      const ext = extname(ent.name).toLowerCase();
      if (!exts.size || exts.has(ext)) out.push(rel);
    }
  };
  walk(root, '');
  return out;
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
    const tasks = Array.isArray(data?.data?.items) ? data.data.items : Array.isArray(data?.tasks) ? data.tasks : [];
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
        agentId: DEFAULT_AGENT_ID,
        message: `[relay poll] ${summary.count} tasks | backlog:${summary.backlog} in_progress:${summary.in_progress} blocked:${summary.blocked} review:${summary.review} done:${summary.done}`,
      });
    } catch {
      // non-fatal
    }
  }

  console.log(JSON.stringify({ ok: true, action: 'poll', products: all }, null, 2));
}

async function cmdPollAndWork(args) {
  // Poll like cmdPoll but attempt Phase-1 auto-work: comment & block agent tasks needing human input
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
    const tasks = Array.isArray(data?.data?.items) ? data.data.items : Array.isArray(data?.tasks) ? data.tasks : [];
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

    // Post an activity note
    try {
      await postJson(ADD_ACTIVITY_NOTE_URL, {
        productId,
        agentId: DEFAULT_AGENT_ID,
        message: `[relay poll-and-work] ${summary.count} tasks | backlog:${summary.backlog} in_progress:${summary.in_progress} blocked:${summary.blocked} review:${summary.review} done:${summary.done}`,
      });
    } catch {
      // non-fatal
    }

    // Phase-1 auto-work: for each agent-owned task, ask missing info only once and avoid false re-blocking
    for (const t of tasks) {
      try {
        const isAgent = (t.assignedType === 'agent') || String(t.createdBy || '').startsWith('quinn-');
        const hasOpenChecklist = Array.isArray(t.checklist) && t.checklist.some((c) => !c.done);
        if (!isAgent) continue;

        // Auto-pickup: move agent backlog/todo tasks into in_progress and immediately mark execution started.
        if ((t.status === 'backlog' || t.status === 'todo')) {
          await postJson(UPDATE_TASK_URL, {
            productId,
            agentId: DEFAULT_AGENT_ID,
            taskId: t.id,
            patch: { status: 'in_progress' },
          });

          await postJson(ADD_TASK_COMMENT_URL, {
            productId,
            agentId: DEFAULT_AGENT_ID,
            taskId: t.id,
            body: 'Auto-picked by heartbeat worker: moved to in_progress. Execution started now; next update will include concrete output artifacts.',
          });
          continue;
        }

        if (!hasOpenChecklist) continue;

        const description = String(t.description || '').toLowerCase();
        const latest = String(t.latestCommentPreview || '').toLowerCase();

        // Fetch full recent comments to avoid relying only on latestCommentPreview
        let recentComments = [];
        try {
          const commentsRes = await postJson(LIST_TASK_COMMENTS_URL, {
            productId,
            taskId: t.id,
            agentId: DEFAULT_AGENT_ID,
            limit: 20,
          });
          recentComments = Array.isArray(commentsRes?.data?.items)
            ? commentsRes.data.items
            : Array.isArray(commentsRes?.data)
              ? commentsRes.data
              : [];
        } catch {
          // non-fatal: fallback to task-level preview/description heuristics
          recentComments = [];
        }

        const allComments = recentComments.map((c) => ({
          authorType: String(c?.authorType || '').toLowerCase(),
          body: String(c?.body || ''),
          bodyLc: String(c?.body || '').toLowerCase(),
        }));
        const allCommentText = allComments.map((c) => c.bodyLc).join('\n');

        const templateAlreadyPosted = latest.includes('missing info needed to finish')
          || allCommentText.includes('missing info needed to finish');

        // Generic answer detection (task-agnostic): if a human replied after the missing-info template,
        // we consider inputs provided and stop re-blocking/re-posting template prompts.
        const templateIdx = allComments.findIndex((c) => c.bodyLc.includes('missing info needed to finish'));
        const hasHumanAfterTemplate = templateIdx >= 0
          ? allComments.slice(0, templateIdx).some((c) => c.authorType !== 'agent' && c.body.trim().length > 0)
          : allComments.some((c) => c.authorType !== 'agent' && c.body.trim().length > 0);

        // Additional fallback: if task description was enriched beyond the original base text, treat as provided.
        const hasDescriptionSupplement = description.includes('\n') && description.split('\n').length > 1;

        const hasProvidedAnswers = hasHumanAfterTemplate || hasDescriptionSupplement;
        const executionStartedAlready = allCommentText.includes('execution started now') || allCommentText.includes('auto-picked by heartbeat worker: moved to in_progress. execution started');

        // If answers are present and task is blocked, move back to in_progress and keep it with agent flow.
        if (hasProvidedAnswers && t.status === 'blocked') {
          await postJson(UPDATE_TASK_URL, {
            productId,
            agentId: DEFAULT_AGENT_ID,
            taskId: t.id,
            patch: {
              status: 'in_progress',
            },
          });
        }

        // Ensure in_progress tasks have an explicit execution-start signal once.
        if (t.status === 'in_progress' && !executionStartedAlready) {
          await postJson(ADD_TASK_COMMENT_URL, {
            productId,
            agentId: DEFAULT_AGENT_ID,
            taskId: t.id,
            body: 'Execution started now. This task is actively being processed by the heartbeat worker; next update will include concrete output artifacts.',
          });
          continue;
        }

        // Only request missing info when task is actively in progress, answers are not present, and template is not already the latest comment.
        const needsMissingInfoPrompt = t.status === 'in_progress' && !hasProvidedAnswers && !templateAlreadyPosted;
        if (!needsMissingInfoPrompt) continue;

        const commentLines = [
          'I will complete remaining checklist items. Missing info needed to finish:',
          '1) Travel dates or flexibility (exact dates or +/- days/month).',
          '2) Preferred departure airport(s) (e.g., ARN) or acceptable alternatives.',
          '3) Cabin preference and max budget per person.',
          '4) Airline exclusions or loyalty preference.',
          '5) Do you want me to book or only provide options/links?',
          '',
          'Please reply here so I can finish the research and complete the checklist. —Quinn',
        ];

        await postJson(ADD_TASK_COMMENT_URL, {
          productId,
          agentId: DEFAULT_AGENT_ID,
          taskId: t.id,
          body: commentLines.join('\n'),
        });

        await postJson(UPDATE_TASK_URL, {
          productId,
          agentId: DEFAULT_AGENT_ID,
          taskId: t.id,
          patch: {
            status: 'blocked',
            owner: 'Benjamin',
          },
        });
      } catch (err) {
        // non-fatal per-task
        console.error('auto-work error:', err.message || err);
      }
    }
  }

  console.log(JSON.stringify({ ok: true, action: 'poll-and-work', products: all }, null, 2));
}

async function cmdCreate(args) {
  const title = args.title || 'Untitled task';
  const description = args.description || 'No description provided.';
  const productId = args.productId || env.DEFAULT_PRODUCT_ID;
  const agentId = args.agentId || DEFAULT_AGENT_ID;
  const priority = args.priority || 'medium';
  const status = args.status || 'backlog';
  const dueDate = args.dueDate || null;

  const body = {
    productId,
    agentId,
    title,
    description,
    type: args.type || 'other',
    priority,
    status,
    dueDate,
    source: 'manual',
  };

  const data = await postJson(CREATE_TASK_URL, body);
  console.log(JSON.stringify({ ok: true, action: 'create', request: body, response: data }, null, 2));
}

async function cmdUpdate(args) {
  const taskId = args.taskId;
  const productId = args.productId || env.DEFAULT_PRODUCT_ID;
  const agentId = args.agentId || DEFAULT_AGENT_ID;
  if (!taskId) throw new Error('--taskId is required');
  if (!productId) throw new Error('--productId is required (or set DEFAULT_PRODUCT_ID)');

  const patch = {
    title: args.title,
    description: args.description,
    status: args.status,
    priority: args.priority,
    dueDate: args.dueDate,
  };

  Object.keys(patch).forEach((k) => patch[k] === undefined && delete patch[k]);

  const body = {
    productId,
    taskId,
    agentId,
    patch,
  };

  const data = await postJson(UPDATE_TASK_URL, body);
  console.log(JSON.stringify({ ok: true, action: 'update', request: body, response: data }, null, 2));
}

async function cmdComment(args) {
  const taskId = args.taskId;
  const productId = args.productId || env.DEFAULT_PRODUCT_ID;
  const agentId = args.agentId || DEFAULT_AGENT_ID;
  const bodyText = args.comment;
  if (!taskId) throw new Error('--taskId is required');
  if (!productId) throw new Error('--productId is required (or set DEFAULT_PRODUCT_ID)');
  if (!bodyText) throw new Error('--comment is required');

  const body = {
    productId,
    agentId,
    taskId,
    body: bodyText,
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
    agentId: args.agentId || DEFAULT_AGENT_ID,
    limit,
  });
  console.log(JSON.stringify({ ok: true, action: 'list-contacts', response: data }, null, 2));
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
        id: rel.replace(/[^a-zA-Z0-9._-]/g, '_'),
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

async function cmdSyncWorkspaceDocs(args) {
  const agentId = args.agentId || DEFAULT_AGENT_ID;
  const root = resolve(args.root || process.cwd());
  const extList = (args.extensions || '.md,.markdown,.txt,.html,.htm,.pdf,.mp4,.mov,.webm,.jpg,.jpeg,.png,.gif,.webp,.csv,.json')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const exts = new Set(extList);
  const ignoreDirs = new Set(['.git', 'node_modules', '.openclaw', '.trash', '.clawhub']);
  const textExts = new Set(['.md', '.markdown', '.txt', '.html', '.htm', '.csv', '.json']);

  const files = args.files
    ? String(args.files).split(',').map((s) => s.trim()).filter(Boolean)
    : listFilesRecursive(root, exts, ignoreDirs);
  const docs = [];
  for (const rel of files) {
    const abs = resolve(root, rel);
    try {
      const st = statSync(abs);
      const ext = extname(rel).toLowerCase();
      const isText = textExts.has(ext);
      let content = '';
      let summary = '';
      let words = 0;
      if (isText) {
        const raw = readFileSync(abs, 'utf8');
        content = raw.length > 200000 ? raw.slice(0, 200000) : raw;
        summary = content.slice(0, 280);
        words = content.trim() ? content.trim().split(/\s+/).length : 0;
      } else {
        content = `[binary file not inlined: ${rel}]`;
        summary = `Binary file metadata synced for ${rel}`;
      }
      docs.push({
        id: rel.replace(/[^a-zA-Z0-9._-]/g, '_'),
        name: basename(rel),
        type: ext.replace('.', '') || 'bin',
        sourceFile: rel,
        content,
        summary,
        tags: ['auto-sync', 'workspace-doc', isText ? 'text' : 'binary'],
        sizeBytes: st.size,
        wordCount: words,
        modifiedAt: new Date(st.mtimeMs).toISOString(),
      });
    } catch {
      // skip unreadable file
    }
  }

  const data = await postJson(`${API_BASE_URL}/openclaw/syncDocs`, {
    agentId,
    generatedAt: nowIso(),
    docs,
  });
  console.log(JSON.stringify({ ok: true, action: 'sync-workspace-docs', sent: docs.length, response: data }, null, 2));
}

async function cmdSyncMemory(args) {
  const agentId = args.agentId || DEFAULT_AGENT_ID;
  const root = resolve(args.root || process.cwd());
  const longTermPath = args.longTermPath || 'MEMORY.md';
  const memoryDir = args.memoryDir || 'memory';
  let longTerm = null;

  try {
    const abs = resolve(root, longTermPath);
    const st = statSync(abs);
    const content = readFileSync(abs, 'utf8');
    longTerm = {
      title: 'Long-Term Memory',
      content,
      sourceFile: longTermPath,
      wordCount: content.trim() ? content.trim().split(/\s+/).length : 0,
      updatedAt: new Date(st.mtimeMs).toISOString(),
    };
  } catch {
    // optional
  }

  const entries = [];
  try {
    const files = listFilesRecursive(resolve(root, memoryDir), new Set(['.md']), new Set());
    for (const relInDir of files) {
      const rel = `${memoryDir}/${relInDir}`;
      const abs = resolve(root, rel);
      const st = statSync(abs);
      const content = readFileSync(abs, 'utf8');
      const id = rel.replace(/[^a-zA-Z0-9._-]/g, '_');
      entries.push({
        id,
        title: basename(rel),
        content,
        summary: content.slice(0, 280),
        tags: ['memory', 'daily'],
        sourceFile: rel,
        wordCount: content.trim() ? content.trim().split(/\s+/).length : 0,
        createdAt: new Date(st.birthtimeMs || st.mtimeMs).toISOString(),
        updatedAt: new Date(st.mtimeMs).toISOString(),
      });
    }
  } catch {
    // optional
  }

  const data = await postJson(`${API_BASE_URL}/openclaw/syncMemory`, {
    agentId,
    generatedAt: nowIso(),
    longTerm,
    entries,
  });
  console.log(JSON.stringify({ ok: true, action: 'sync-memory', longTerm: !!longTerm, entries: entries.length, response: data }, null, 2));
}

async function cmdSyncSchedules(args) {
  const agentId = args.agentId || DEFAULT_AGENT_ID;
  const timezone = args.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

  const parseCronWeekSlots = (expr, label) => {
    const parts = String(expr || '').trim().split(/\s+/);
    if (parts.length < 5) return [];
    const [minRaw, hourRaw, , , dowRaw] = parts;
    if (!/^\d{1,2}$/.test(minRaw) || !/^\d{1,2}$/.test(hourRaw)) return [];
    const hh = String(Number(hourRaw)).padStart(2, '0');
    const mm = String(Number(minRaw)).padStart(2, '0');
    const time = `${hh}:${mm}`;

    const parseDow = (raw) => {
      const s = String(raw || '*').trim();
      if (s === '*') return [0, 1, 2, 3, 4, 5, 6];
      const out = new Set();
      for (const token of s.split(',')) {
        const t = token.trim();
        if (!t) continue;
        if (t.includes('-')) {
          const [aRaw, bRaw] = t.split('-');
          const a = Number(aRaw);
          const b = Number(bRaw);
          if (Number.isInteger(a) && Number.isInteger(b)) {
            for (let d = a; d <= b; d++) out.add(d === 7 ? 0 : d);
          }
        } else {
          const d = Number(t);
          if (Number.isInteger(d)) out.add(d === 7 ? 0 : d);
        }
      }
      return [...out].filter((d) => d >= 0 && d <= 6).sort((a, b) => a - b);
    };

    return parseDow(dowRaw).map((day) => ({ day, time, label }));
  };

  // Optional mapping file: config/schedule-product-map.json => { "jobId": "productId" }
  let productMap = {};
  try {
    const mapPath = resolve(process.cwd(), args.mapPath || 'config/schedule-product-map.json');
    if (existsSync(mapPath)) {
      productMap = JSON.parse(readFileSync(mapPath, 'utf8')) || {};
    }
  } catch {
    productMap = {};
  }

  // Pull local cron jobs from OpenClaw CLI
  const raw = execSync('openclaw cron list --all --json', { encoding: 'utf8' });
  const parsed = JSON.parse(raw);
  const jobsRaw = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.jobs) ? parsed.jobs : Array.isArray(parsed?.data) ? parsed.data : [];

  const jobs = jobsRaw.map((j) => {
    const schedule = j?.schedule || {};
    const scheduleType = schedule?.kind || 'other';
    const expression = scheduleType === 'cron'
      ? String(schedule?.expr || '')
      : scheduleType === 'every'
        ? `every:${Number(schedule?.everyMs || 0)}ms`
        : scheduleType === 'at'
          ? `at:${String(schedule?.at || '')}`
          : '';

    const name = String(j?.name || j?.id || j?.jobId || 'Unnamed schedule');
    const nextRuns = j?.state?.nextRunAtMs ? [new Date(Number(j.state.nextRunAtMs)).toISOString()] : [];

    const jobId = String(j?.id || j?.jobId || '');
    const tagMatch = name.match(/\[\s*product\s*:\s*([a-zA-Z0-9_-]+)\s*\]/i);
    const productId = (productMap && productMap[jobId]) || (tagMatch ? String(tagMatch[1]).trim() : null);

    let weekSlots = [];
    if (scheduleType === 'cron') {
      weekSlots = parseCronWeekSlots(String(schedule?.expr || ''), name);
    } else if (nextRuns.length > 0) {
      // Fallback visualization: place non-cron jobs at their next-run day/time
      const dt = new Date(nextRuns[0]);
      if (!Number.isNaN(dt.getTime())) {
        const day = dt.getUTCDay();
        const hh = String(dt.getUTCHours()).padStart(2, '0');
        const mm = String(dt.getUTCMinutes()).padStart(2, '0');
        weekSlots = [{ day, time: `${hh}:${mm}`, label: name }];
      }
    }

    return {
      id: jobId,
      name,
      enabled: j?.enabled !== false,
      alwaysRunning: false,
      color: '',
      productId: productId || null,
      scheduleType,
      expression,
      tags: [],
      weekSlots,
      nextRuns,
      sourceUpdatedAt: new Date(Number(j?.updatedAtMs || Date.now())).toISOString(),
    };
  }).filter((j) => j.id);

  const data = await postJson(SYNC_SCHEDULES_URL, {
    agentId,
    timezone,
    generatedAt: nowIso(),
    jobs,
  });

  console.log(JSON.stringify({ ok: true, action: 'sync-schedules', sent: jobs.length, response: data }, null, 2));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cmd = args._[0];

  if (!cmd || ['help', '-h', '--help'].includes(cmd)) {
    console.log('Usage: poll | poll-and-work | create | update | comment | list-contacts | sync-docs | sync-workspace-docs | sync-memory | sync-schedules (see file header for examples)');
    return;
  }

  if (cmd === 'poll') return cmdPoll(args);
  if (cmd === 'poll-and-work') return cmdPollAndWork(args);
  if (cmd === 'create') return cmdCreate(args);
  if (cmd === 'update') return cmdUpdate(args);
  if (cmd === 'comment') return cmdComment(args);
  if (cmd === 'list-contacts') return cmdListContacts(args);
  if (cmd === 'sync-docs') return cmdSyncDocs(args);
  if (cmd === 'sync-workspace-docs') return cmdSyncWorkspaceDocs(args);
  if (cmd === 'sync-memory') return cmdSyncMemory(args);
  if (cmd === 'sync-schedules') return cmdSyncSchedules(args);

  throw new Error(`Unknown command: ${cmd}`);
}

main().catch((err) => {
  console.error('relay error:', err.message);
  if (err.response) console.error(JSON.stringify(err.response, null, 2));
  process.exit(1);
});
