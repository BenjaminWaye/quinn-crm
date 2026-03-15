import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  where,
  updateDoc,
  type QueryConstraint,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "./firebase";

export type ProductRecord = {
  id: string;
  name: string;
  status: string;
  repo?: string;
  description?: string;
  mission?: string;
  // Optional notification routing (Discord channel id). Empty/undefined => fall back to general channel.
  discordChannelId?: string;
  order?: number;
  ownerId?: string;
  lastActivityAt?: unknown;
};

export type TaskAttachmentRecord = {
  id: string;
  name: string;
  contentType: string;
  sizeBytes: number;
  storagePath: string;
  downloadUrl: string;
  uploadedAt?: unknown;
};

export type TaskAttachmentUpload = {
  name: string;
  dataUrl: string;
  contentType: string;
  sizeBytes: number;
};

export type TaskRecord = {
  id: string;
  productId?: string;
  title: string;
  description?: string;
  type?: string;
  status: string;
  priority: string;
  dueDate?: string | null;
  assignedType?: "human" | "agent" | null;
  assignedId?: string | null;
  linkedContactIds?: string[];
  linkedKpiKeys?: string[];
  linkedDocIds?: string[];
  // Optional per-task notification routing override (Discord channel id).
  discordChannelId?: string;
  checklist?: Array<{ id: string; text: string; done: boolean }>;
  updatedAt?: unknown;
  latestCommentPreview?: string;
  commentCount?: number;
  source?: "manual" | "openclaw" | "automation";
  blockedReason?: string;
  createdBy?: string;
  createdAt?: unknown;
  completedAt?: unknown;
  attachments?: TaskAttachmentRecord[];
};

export type ContactRecord = {
  id: string;
  name: string;
  status: string;
  kind: string;
  company?: string;
  title?: string;
  email?: string;
  phone?: string;
  linkedin?: string;
  website?: string;
  location?: string;
  tags?: string[];
  notes?: string;
  updatedAt?: unknown;
};

export type KpiRecord = {
  key: string;
  name: string;
  targetValue?: number | null;
  unit: string;
  targetDirection: "up" | "down" | "flat";
  active: boolean;
};

export type KpiEntryRecord = {
  id: string;
  productId: string;
  kpiKey: string;
  value: number;
  date: string;
  createdAt?: unknown;
};

export type ActivityRecord = {
  id: string;
  message: string;
  type: string;
  actorType: string;
  createdAt?: unknown;
};

export type ContactActivityRecord = {
  id: string;
  type: "contact.created" | "contact.updated";
  message: string;
  actorType: "owner" | "agent" | "system";
  actorId?: string;
  createdAt?: unknown;
  changes?: Array<{
    field: string;
    label: string;
    before: string;
    after: string;
  }>;
};

export type TaskCommentRecord = {
  id: string;
  body: string;
  authorType: string;
  authorId: string;
  createdAt?: unknown;
  attachments?: TaskAttachmentRecord[];
};

export type OpenClawMemoryEntry = {
  id: string;
  title: string;
  content: string;
  summary?: string;
  tags?: string[];
  sourceFile?: string;
  agentId?: string;
  wordCount?: number;
  createdAt?: unknown;
  updatedAt?: unknown;
  syncedAt?: unknown;
};

export type OpenClawLongTermMemory = {
  id: string;
  title: string;
  content: string;
  sourceFile?: string;
  wordCount?: number;
  updatedAt?: unknown;
  syncedAt?: unknown;
};

export type OpenClawDocLink = {
  productId: string;
  taskId: string;
  title?: string;
};

export type OpenClawDoc = {
  id: string;
  name: string;
  type: string; // .md, .html, etc
  content: string;
  downloadUrl?: string;
  storagePath?: string;
  contentType?: string;
  summary?: string;
  tags?: string[];
  sourceFile?: string;
  agentId?: string;
  productId?: string | null;
  sizeBytes?: number;
  wordCount?: number;
  modifiedAt?: unknown;
  syncedAt?: unknown;
  linkedTaskKeys?: string[];
  linkedTasks?: OpenClawDocLink[];
};

export type OpenClawAgent = {
  id: string;
  name: string;
  role: string;
  description: string;
  parentId?: string | null;
  machine?: string;
  status?: "active" | "paused" | "offline";
  tags?: string[];
  avatar?: string;
  order?: number;
  syncedAt?: unknown;
  updatedAt?: unknown;
};

export type OpenClawScheduleSlot = {
  day: number; // 0=Sun .. 6=Sat
  time: string; // HH:mm
  label?: string;
};

export type OpenClawScheduleJob = {
  id: string;
  docId?: string;
  name: string;
  agentId: string;
  enabled: boolean;
  alwaysRunning?: boolean;
  color?: string;
  timezone?: string;
  productId?: string | null;
  scheduleType?: "cron" | "rrule" | "interval" | "other";
  expression?: string;
  tags?: string[];
  weekSlots: OpenClawScheduleSlot[];
  nextRuns?: string[];
  sourceUpdatedAt?: unknown;
  syncedAt?: unknown;
};

const SKIP_AUTH = import.meta.env.VITE_SKIP_AUTH === "true";
const MOCK_DB_KEY = "product_os_mock_db_v1";

type MockDb = {
  products: ProductRecord[];
  contactsByProduct: Record<string, ContactRecord[]>;
  contactActivityByContact: Record<string, ContactActivityRecord[]>;
  tasksByProduct: Record<string, TaskRecord[]>;
  commentsByTask: Record<string, TaskCommentRecord[]>;
  kpisByProduct: Record<string, KpiRecord[]>;
  kpiEntriesByKey: Record<string, KpiEntryRecord[]>;
  activityByProduct: Record<string, ActivityRecord[]>;
  schedules: OpenClawScheduleJob[];
  memoryEntries: OpenClawMemoryEntry[];
  longTermMemory: OpenClawLongTermMemory;
  docs: OpenClawDoc[];
  team: OpenClawAgent[];
};

function nowIso() {
  return new Date().toISOString();
}

function toOptimisticAttachmentRecord(input: TaskAttachmentUpload, prefix = "tmp"): TaskAttachmentRecord {
  return {
    id: `${prefix}_${crypto.randomUUID()}`,
    name: input.name,
    contentType: input.contentType || "application/octet-stream",
    sizeBytes: Number(input.sizeBytes ?? 0),
    storagePath: "pending/local",
    downloadUrl: input.dataUrl,
    uploadedAt: nowIso(),
  };
}

function taskKey(productId: string, taskId: string) {
  return `${productId}:${taskId}`;
}

function normalizeTaskStatus(status: unknown): string {
  return status === "todo" ? "backlog" : String(status ?? "backlog");
}

function contactKey(productId: string, contactId: string) {
  return `${productId}:${contactId}`;
}

function kpiKey(productId: string, key: string) {
  return `${productId}:${key}`;
}

function createMockDb(): MockDb {
  const products: ProductRecord[] = [
    { id: "callmycall", name: "CallMyCall", status: "active", order: 0 },
    { id: "rinderr", name: "Rinderr", status: "active", order: 1 },
  ];

  return {
    products,
    contactsByProduct: {
      callmycall: [
        {
          id: "c1",
          name: "Anna Svensson",
          status: "interested",
          kind: "lead",
          company: "Nordic Insurance",
          title: "Operations Manager",
          email: "anna@nordicinsurance.se",
          phone: "+46 70 123 45 67",
          linkedin: "https://www.linkedin.com/in/annasvensson",
          website: "https://nordicinsurance.se",
          location: "Stockholm",
          tags: ["insurance", "queue-pain"],
          notes: "Follow up Friday",
          updatedAt: nowIso(),
        },
      ],
      rinderr: [],
    },
    contactActivityByContact: {
      "callmycall:c1": [
        {
          id: crypto.randomUUID(),
          type: "contact.created",
          message: "Contact created",
          actorType: "owner",
          actorId: "benjamin",
          createdAt: nowIso(),
          changes: [],
        },
      ],
    },
    tasksByProduct: {
      callmycall: [
        {
          id: "t1",
          productId: "callmycall",
          title: "Draft outreach page",
          description: "Landing for insurance vertical",
          type: "content",
          status: "backlog",
          priority: "high",
          dueDate: null,
          assignedType: "human",
          assignedId: "benjamin",
          linkedContactIds: ["c1"],
          linkedKpiKeys: ["weekly_installs"],
          linkedDocIds: ["2026-03-10-research.md"],
          checklist: [{ id: "cl1", text: "Write draft", done: true }],
          latestCommentPreview: "First draft started",
          commentCount: 1,
          source: "manual",
          blockedReason: "",
          createdBy: "local",
          createdAt: nowIso(),
          updatedAt: nowIso(),
          completedAt: null,
        },
      ],
      rinderr: [],
    },
    commentsByTask: {
      [taskKey("callmycall", "t1")]: [
        { id: "cm1", body: "First draft started", authorType: "owner", authorId: "local", createdAt: nowIso() },
      ],
    },
    kpisByProduct: {
      callmycall: [
        { key: "weekly_installs", name: "Weekly installs", targetValue: 100, unit: "number", targetDirection: "up", active: true },
      ],
      rinderr: [],
    },
    kpiEntriesByKey: {
      [kpiKey("callmycall", "weekly_installs")]: [
        { id: "ke1", productId: "callmycall", kpiKey: "weekly_installs", value: 42, date: new Date().toISOString().slice(0, 10), createdAt: nowIso() },
      ],
    },
    activityByProduct: {
      callmycall: [
        { id: "a1", message: "Mock mode active with local data", type: "agent.note", actorType: "system", createdAt: nowIso() },
      ],
      rinderr: [],
    },
    schedules: [
      {
        id: "trend-radar",
        name: "Trend Radar",
        agentId: "scout",
        enabled: true,
        alwaysRunning: true,
        color: "amber",
        timezone: "Europe/Stockholm",
        productId: "callmycall",
        scheduleType: "cron",
        expression: "0 12 * * 1-5",
        tags: ["always-running"],
        weekSlots: [1, 2, 3, 4, 5].map((day) => ({ day, time: "12:00" })),
        nextRuns: [],
        sourceUpdatedAt: nowIso(),
        syncedAt: nowIso(),
      },
      {
        id: "morning-brief",
        name: "Morning Brief",
        agentId: "henry",
        enabled: true,
        color: "yellow",
        timezone: "Europe/Stockholm",
        productId: "callmycall",
        scheduleType: "cron",
        expression: "0 8 * * 1-5",
        weekSlots: [1, 2, 3, 4, 5].map((day) => ({ day, time: "08:00" })),
        nextRuns: [],
        sourceUpdatedAt: nowIso(),
        syncedAt: nowIso(),
      },
      {
        id: "daily-digest",
        name: "Daily Digest",
        agentId: "quill",
        enabled: true,
        color: "indigo",
        timezone: "Europe/Stockholm",
        productId: "rinderr",
        scheduleType: "cron",
        expression: "0 9 * * *",
        weekSlots: [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, time: "09:00" })),
        nextRuns: [],
        sourceUpdatedAt: nowIso(),
        syncedAt: nowIso(),
      },
    ],
    memoryEntries: [
      {
        id: "2026-03-09-morning-brief",
        title: "2026-03-09 — Morning Brief",
        content: "Key findings:\n- Lead quality improved in fintech outreach.\n- Queue pain messaging had best response.\n\nDecision:\n- Keep insurance vertical as priority.",
        summary: "Daily brief from OpenClaw",
        tags: ["daily", "brief"],
        sourceFile: "memory/2026-03-09.md",
        agentId: "openclaw-local",
        wordCount: 38,
        createdAt: nowIso(),
        updatedAt: nowIso(),
        syncedAt: nowIso(),
      },
      {
        id: "2026-03-10-research",
        title: "2026-03-10 — Qwen Research",
        content: "What we discussed:\n- 35B variants show strong efficiency.\n\nRecommendations:\n1. Test on Studio 1\n2. Benchmark against current stack",
        summary: "Model research notes",
        tags: ["research", "models"],
        sourceFile: "memory/2026-03-10.md",
        agentId: "openclaw-local",
        wordCount: 30,
        createdAt: nowIso(),
        updatedAt: nowIso(),
        syncedAt: nowIso(),
      },
    ],
    longTermMemory: {
      id: "long_term",
      title: "Long-Term Memory",
      content:
        "Mission:\nBuild a private product OS where CRM, Tasks, KPI and agent workflows are product-first.\n\nCore constraints:\n- Owner-only access\n- Firebase-native stack\n- Agent-safe structured documents\n\nCurrent focus:\n- Calendar and Memory mirror from OpenClaw local state.",
      sourceFile: "memory/long_term.md",
      wordCount: 46,
      updatedAt: nowIso(),
      syncedAt: nowIso(),
    },
    docs: [
      {
        id: "2026-03-10-research.md",
        name: "2026-03-10-research.md",
        type: ".md",
        content: "Research notes and conclusions...",
        summary: "Model research summary",
        tags: ["research"],
        sourceFile: "docs/2026-03-10-research.md",
        agentId: "openclaw-local",
        productId: "callmycall",
        sizeBytes: 3200,
        wordCount: 560,
        modifiedAt: nowIso(),
        syncedAt: nowIso(),
        linkedTaskKeys: ["callmycall:t1"],
        linkedTasks: [{ productId: "callmycall", taskId: "t1", title: "Draft outreach page" }],
      },
      {
        id: "landing-outline.html",
        name: "landing-outline.html",
        type: ".html",
        content: "<h1>Landing Outline</h1><p>...</p>",
        summary: "HTML draft",
        tags: ["content"],
        sourceFile: "docs/landing-outline.html",
        agentId: "openclaw-local",
        productId: "callmycall",
        sizeBytes: 1800,
        wordCount: 240,
        modifiedAt: nowIso(),
        syncedAt: nowIso(),
        linkedTaskKeys: [],
        linkedTasks: [],
      },
    ],
    team: [
      {
        id: "henry",
        name: "Henry",
        role: "Chief of Staff",
        description: "Coordinates and delegates work between owner and specialist agents.",
        parentId: null,
        machine: "Mac Studio 2",
        status: "active",
        tags: ["orchestration", "clarity", "delegation"],
        avatar: "🦉",
        order: 0,
        syncedAt: nowIso(),
        updatedAt: nowIso(),
      },
      {
        id: "charlie",
        name: "Charlie",
        role: "Infrastructure Engineer",
        description: "Maintains pipelines, automations and runtime reliability.",
        parentId: "henry",
        machine: "Mac Studio 2",
        status: "active",
        tags: ["infra", "automation"],
        avatar: "🤖",
        order: 1,
        syncedAt: nowIso(),
        updatedAt: nowIso(),
      },
      {
        id: "ralph",
        name: "Ralph",
        role: "QA Manager",
        description: "Reviews output quality and signs off before publish.",
        parentId: "henry",
        machine: "Mac Studio 2",
        status: "active",
        tags: ["quality", "monitoring"],
        avatar: "🔧",
        order: 2,
        syncedAt: nowIso(),
        updatedAt: nowIso(),
      },
      {
        id: "quill",
        name: "Quill",
        role: "Content Writer",
        description: "Writes copy and drafts campaigns.",
        parentId: "charlie",
        machine: "MacBook Pro",
        status: "active",
        tags: ["content"],
        avatar: "✍️",
        order: 3,
        syncedAt: nowIso(),
        updatedAt: nowIso(),
      },
      {
        id: "echo",
        name: "Echo",
        role: "Social Media Manager",
        description: "Schedules and publishes multi-platform posts.",
        parentId: "charlie",
        machine: "MacBook Pro",
        status: "active",
        tags: ["social"],
        avatar: "📣",
        order: 4,
        syncedAt: nowIso(),
        updatedAt: nowIso(),
      },
    ],
  };
}

function loadMockDb(): MockDb {
  const raw = localStorage.getItem(MOCK_DB_KEY);
  if (!raw) {
    const initial = createMockDb();
    localStorage.setItem(MOCK_DB_KEY, JSON.stringify(initial));
    return initial;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<MockDb>;
    return {
      ...createMockDb(),
      ...parsed,
      contactActivityByContact: parsed.contactActivityByContact ?? {},
    } as MockDb;
  } catch {
    const initial = createMockDb();
    localStorage.setItem(MOCK_DB_KEY, JSON.stringify(initial));
    return initial;
  }
}

function saveMockDb(dbState: MockDb) {
  localStorage.setItem(MOCK_DB_KEY, JSON.stringify(dbState));
}

function ensureDb() {
  if (!db) {
    throw new Error("Firebase Firestore is not configured");
  }
  return db;
}

function ensureFunctions() {
  if (!functions) {
    throw new Error("Firebase Functions is not configured");
  }
  return functions;
}

async function readCollection<T>(path: string, constraints: QueryConstraint[] = []): Promise<T[]> {
  const dbRef = ensureDb();
  const col = collection(dbRef, path);
  const q = query(col, ...constraints);
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as T);
}

export async function readDocument<T>(path: string): Promise<T | null> {
  if (SKIP_AUTH) {
    const mock = loadMockDb();
    const parts = path.split("/");
    if (parts[0] === "products" && parts[2] === "tasks" && parts[3]) {
      return (
        (mock.tasksByProduct[parts[1]] ?? []).find((item) => item.id === parts[3]) as T | undefined
      ) ?? null;
    }
    if (parts[0] === "products" && parts[2] === "contacts" && parts[3]) {
      return (
        (mock.contactsByProduct[parts[1]] ?? []).find((item) => item.id === parts[3]) as T | undefined
      ) ?? null;
    }
    return null;
  }

  const dbRef = ensureDb();
  const snap = await getDoc(doc(dbRef, path));
  return snap.exists() ? (snap.data() as T) : null;
}

export async function listProducts(): Promise<ProductRecord[]> {
  if (SKIP_AUTH) {
    return [...loadMockDb().products].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }
  return readCollection<ProductRecord>("products", [orderBy("order", "asc")]);
}

export async function getProduct(productId: string): Promise<ProductRecord | null> {
  if (SKIP_AUTH) {
    return (loadMockDb().products ?? []).find((product) => product.id === productId) ?? null;
  }
  return readDocument<ProductRecord>(`products/${productId}`);
}

export async function listTasks(productId: string): Promise<TaskRecord[]> {
  if (SKIP_AUTH) {
    return [...(loadMockDb().tasksByProduct[productId] ?? [])].map((task) => ({
      ...task,
      status: normalizeTaskStatus(task.status),
    }));
  }
  const items = await readCollection<TaskRecord>(`products/${productId}/tasks`, [orderBy("updatedAt", "desc")]);
  return items.map((task) => ({ ...task, status: normalizeTaskStatus(task.status) }));
}

export async function getTask(productId: string, taskId: string): Promise<TaskRecord | null> {
  const item = await readDocument<TaskRecord>(`products/${productId}/tasks/${taskId}`);
  return item ? { ...item, status: normalizeTaskStatus(item.status) } : null;
}

export async function listTaskComments(productId: string, taskId: string): Promise<TaskCommentRecord[]> {
  if (SKIP_AUTH) {
    return [...(loadMockDb().commentsByTask[taskKey(productId, taskId)] ?? [])].reverse();
  }
  return readCollection<TaskCommentRecord>(`products/${productId}/tasks/${taskId}/comments`, [orderBy("createdAt", "desc"), limit(20)]);
}

export async function listContacts(productId: string): Promise<ContactRecord[]> {
  if (SKIP_AUTH) {
    return [...(loadMockDb().contactsByProduct[productId] ?? [])];
  }
  return readCollection<ContactRecord>(`products/${productId}/contacts`, [orderBy("updatedAt", "desc")]);
}

export async function getContact(productId: string, contactId: string): Promise<ContactRecord | null> {
  return readDocument<ContactRecord>(`products/${productId}/contacts/${contactId}`);
}

export async function listContactActivity(productId: string, contactId: string): Promise<ContactActivityRecord[]> {
  if (SKIP_AUTH) {
    return [...(loadMockDb().contactActivityByContact[contactKey(productId, contactId)] ?? [])].sort((a, b) =>
      String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")),
    );
  }
  return readCollection<ContactActivityRecord>(`products/${productId}/contacts/${contactId}/activity`, [orderBy("createdAt", "desc"), limit(50)]);
}

export async function listKpis(productId: string): Promise<KpiRecord[]> {
  if (SKIP_AUTH) {
    return [...(loadMockDb().kpisByProduct[productId] ?? [])].filter((item) => item.active);
  }
  return readCollection<KpiRecord>(`products/${productId}/kpis`, [where("active", "==", true), orderBy("order", "asc")]);
}

export async function listKpiEntries(productId: string, key: string): Promise<KpiEntryRecord[]> {
  if (SKIP_AUTH) {
    return [...(loadMockDb().kpiEntriesByKey[kpiKey(productId, key)] ?? [])].sort((a, b) => b.date.localeCompare(a.date));
  }
  return readCollection<KpiEntryRecord>(`products/${productId}/kpis/${key}/entries`, [orderBy("date", "desc"), limit(40)]);
}

export async function listActivity(productId: string): Promise<ActivityRecord[]> {
  if (SKIP_AUTH) {
    return [...(loadMockDb().activityByProduct[productId] ?? [])].sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")));
  }
  return readCollection<ActivityRecord>(`products/${productId}/activity`, [orderBy("createdAt", "desc"), limit(20)]);
}

export async function listOpenClawSchedules(): Promise<OpenClawScheduleJob[]> {
  if (SKIP_AUTH) {
    return [...loadMockDb().schedules].sort((a, b) => a.name.localeCompare(b.name));
  }
  return readCollection<OpenClawScheduleJob>("openclaw_schedules", [orderBy("name", "asc")]);
}

export async function updateOpenClawScheduleProduct(job: OpenClawScheduleJob, productId: string | null): Promise<void> {
  if (SKIP_AUTH) {
    const dbMock = loadMockDb();
    const idx = dbMock.schedules.findIndex((s) => s.id === job.id && s.agentId === job.agentId);
    if (idx >= 0) dbMock.schedules[idx].productId = productId;
    saveMockDb(dbMock);
    return;
  }

  const docId = job.docId || `${job.agentId}__${job.id}`;
  const dbRef = ensureDb();
  await updateDoc(doc(dbRef, "openclaw_schedules", docId), {
    productId: productId || null,
  });
}

export async function listOpenClawMemoryEntries(): Promise<OpenClawMemoryEntry[]> {
  if (SKIP_AUTH) {
    return [...loadMockDb().memoryEntries].sort((a, b) => String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? "")));
  }
  return readCollection<OpenClawMemoryEntry>("openclaw_memory_entries", [orderBy("updatedAt", "desc"), limit(400)]);
}

export async function listOpenClawDocs(): Promise<OpenClawDoc[]> {
  if (SKIP_AUTH) {
    return [...loadMockDb().docs].sort((a, b) => String(b.modifiedAt ?? "").localeCompare(String(a.modifiedAt ?? "")));
  }
  return readCollection<OpenClawDoc>("openclaw_docs", [orderBy("modifiedAt", "desc"), limit(500)]);
}

export async function listOpenClawTeam(): Promise<OpenClawAgent[]> {
  if (SKIP_AUTH) {
    return [...loadMockDb().team].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }
  return readCollection<OpenClawAgent>("openclaw_agents", [orderBy("order", "asc"), limit(500)]);
}

export async function getOpenClawLongTermMemory(): Promise<OpenClawLongTermMemory | null> {
  if (SKIP_AUTH) {
    return loadMockDb().longTermMemory;
  }
  return readDocument<OpenClawLongTermMemory>("openclaw_memory/long_term");
}

export async function listBlockedTasks(productId: string): Promise<TaskRecord[]> {
  if (SKIP_AUTH) {
    return (loadMockDb().tasksByProduct[productId] ?? []).filter((task) => task.status === "blocked");
  }
  return readCollection<TaskRecord>(`products/${productId}/tasks`, [where("status", "==", "blocked"), limit(20)]);
}

export async function listKeyContacts(productId: string): Promise<ContactRecord[]> {
  if (SKIP_AUTH) {
    return (loadMockDb().contactsByProduct[productId] ?? [])
      .filter((contact) => ["contacted", "interested", "customer"].includes(contact.status))
      .slice(0, 5);
  }
  // Avoid composite-index requirement (status IN + orderBy) by filtering client-side.
  const contacts = await readCollection<ContactRecord>(`products/${productId}/contacts`, [orderBy("updatedAt", "desc"), limit(50)]);
  return contacts.filter((contact) => ["new", "contacted", "interested", "customer"].includes(contact.status)).slice(0, 5);
}

export async function listTopPriorities(productId: string): Promise<TaskRecord[]> {
  const tasks = await listTasks(productId);
  const score: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
  return tasks.filter((task) => task.status !== "done").sort((a, b) => (score[a.priority] ?? 99) - (score[b.priority] ?? 99)).slice(0, 5);
}

export async function createProduct(input: {
  name: string;
  slug?: string;
  repo?: string;
  description?: string;
  mission?: string;
  discordChannelId?: string;
  color?: string;
  icon?: string;
}) {
  if (SKIP_AUTH) {
    const dbState = loadMockDb();
    const id = (input.slug ?? input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")).replace(/^-+|-+$/g, "");
    if (dbState.products.some((product) => product.id === id)) {
      throw new Error("Product already exists");
    }
    dbState.products.push({
      id,
      name: input.name,
      status: "active",
      repo: input.repo?.trim() || "",
      description: input.description?.trim() || "",
      mission: input.mission?.trim() || "",
      discordChannelId: input.discordChannelId?.trim() || "",
      order: dbState.products.length,
    });
    dbState.contactsByProduct[id] = [];
    dbState.tasksByProduct[id] = [];
    dbState.kpisByProduct[id] = [];
    dbState.activityByProduct[id] = [{ id: crypto.randomUUID(), message: `Product created: ${input.name}`, type: "product.updated", actorType: "owner", createdAt: nowIso() }];
    saveMockDb(dbState);
    return { data: { productId: id } };
  }

  const call = httpsCallable<typeof input, { productId: string }>(ensureFunctions(), "createProduct");
  return call(input);
}

export async function updateProduct(input: {
  productId: string;
  patch: Partial<{
    name: string;
    status: string;
    repo: string;
    description: string;
    mission: string;
    discordChannelId: string;
    color: string;
    icon: string;
  }>;
}) {
  if (SKIP_AUTH) {
    const dbState = loadMockDb();
    dbState.products = dbState.products.map((product) =>
      product.id === input.productId
        ? {
            ...product,
            ...input.patch,
          }
        : product,
    );
    saveMockDb(dbState);
    return { data: { ok: true } };
  }

  const call = httpsCallable<typeof input, { ok: boolean }>(ensureFunctions(), "updateProduct");
  return call(input);
}

export async function createContact(input: {
  productId: string;
  kind: string;
  name: string;
  status?: string;
  company?: string;
  title?: string;
  email?: string;
  phone?: string;
  linkedin?: string;
  website?: string;
  location?: string;
  tags?: string[];
  notes?: string;
}) {
  if (SKIP_AUTH) {
    const dbState = loadMockDb();
    const id = crypto.randomUUID();
    const createdAt = nowIso();
    const item: ContactRecord = {
      id,
      name: input.name,
      kind: input.kind,
      status: input.status ?? "new",
      company: input.company,
      title: input.title,
      email: input.email,
      phone: input.phone,
      linkedin: input.linkedin,
      website: input.website,
      location: input.location,
      tags: input.tags ?? [],
      notes: input.notes,
      updatedAt: createdAt,
    };
    dbState.contactsByProduct[input.productId] = [...(dbState.contactsByProduct[input.productId] ?? []), item];
    dbState.contactActivityByContact[contactKey(input.productId, id)] = [
      {
        id: crypto.randomUUID(),
        type: "contact.created",
        message: "Contact created",
        actorType: "owner",
        actorId: "benjamin",
        createdAt,
        changes: [],
      },
    ];
    dbState.activityByProduct[input.productId] = [{ id: crypto.randomUUID(), message: `Contact created: ${input.name}`, type: "contact.created", actorType: "owner", createdAt }, ...(dbState.activityByProduct[input.productId] ?? [])];
    saveMockDb(dbState);
    return { data: { contactId: id } };
  }

  const call = httpsCallable<typeof input, { contactId: string }>(ensureFunctions(), "createContact");
  return call(input);
}

export async function updateContact(input: {
  productId: string;
  contactId: string;
  patch: Partial<{
    name: string;
    status: string;
    kind: string;
    company: string;
    title: string;
    email: string;
    phone: string;
    linkedin: string;
    website: string;
    location: string;
    tags: string[];
    notes: string;
  }>;
}) {
  if (SKIP_AUTH) {
    const dbState = loadMockDb();
    const now = nowIso();
    const before = (dbState.contactsByProduct[input.productId] ?? []).find((contact) => contact.id === input.contactId);
    dbState.contactsByProduct[input.productId] = (dbState.contactsByProduct[input.productId] ?? []).map((contact) =>
      contact.id === input.contactId ? { ...contact, ...input.patch, updatedAt: now } : contact,
    );
    const labels: Record<string, string> = {
      name: "Name",
      kind: "Kind",
      status: "Status",
      company: "Company",
      title: "Title",
      email: "Email",
      phone: "Phone",
      linkedin: "LinkedIn",
      website: "Website",
      location: "Location",
      tags: "Tags",
      notes: "Notes",
    };
    const toString = (value: unknown) => {
      if (value === undefined || value === null || value === "") return "empty";
      if (Array.isArray(value)) return value.join(", ") || "empty";
      return String(value);
    };
    const changes = Object.entries(labels)
      .filter(([field]) => field in (input.patch ?? {}))
      .map(([field, label]) => {
        const nextValue = (input.patch as Record<string, unknown>)[field];
        return {
          field,
          label,
          before: toString((before as Record<string, unknown> | undefined)?.[field]),
          after: toString(nextValue),
        };
      })
      .filter((entry) => entry.before !== entry.after);
    const message = changes.length > 0 ? changes.slice(0, 3).map((entry) => `${entry.label}: ${entry.before} -> ${entry.after}`).join(" • ") : "No field changes";
    const key = contactKey(input.productId, input.contactId);
    dbState.contactActivityByContact[key] = [
      {
        id: crypto.randomUUID(),
        type: "contact.updated",
        message,
        actorType: "owner",
        actorId: "benjamin",
        createdAt: now,
        changes,
      },
      ...(dbState.contactActivityByContact[key] ?? []),
    ];
    dbState.activityByProduct[input.productId] = [{ id: crypto.randomUUID(), message: `Contact updated`, type: "contact.updated", actorType: "owner", createdAt: now }, ...(dbState.activityByProduct[input.productId] ?? [])];
    saveMockDb(dbState);
    return { data: { ok: true } };
  }

  const call = httpsCallable<typeof input, { ok: boolean }>(ensureFunctions(), "updateContact");
  return call(input);
}

export async function deleteContact(input: { productId: string; contactId: string }) {
  if (SKIP_AUTH) {
    const dbState = loadMockDb();
    const existing = (dbState.contactsByProduct[input.productId] ?? []).find((contact) => contact.id === input.contactId);
    dbState.contactsByProduct[input.productId] = (dbState.contactsByProduct[input.productId] ?? []).filter((contact) => contact.id !== input.contactId);
    delete dbState.contactActivityByContact[contactKey(input.productId, input.contactId)];
    dbState.activityByProduct[input.productId] = [
      {
        id: crypto.randomUUID(),
        message: `Contact deleted: ${existing?.name ?? input.contactId}`,
        type: "contact.updated",
        actorType: "owner",
        createdAt: nowIso(),
      },
      ...(dbState.activityByProduct[input.productId] ?? []),
    ];
    saveMockDb(dbState);
    return { data: { ok: true } };
  }

  const call = httpsCallable<typeof input, { ok: boolean }>(ensureFunctions(), "deleteContact");
  return call(input);
}

export async function createTask(input: {
  productId: string;
  title: string;
  description?: string;
  type?: string;
  priority?: string;
  dueDate?: string | null;
  assignedType?: "human" | "agent" | null;
  assignedId?: string | null;
  linkedContactIds?: string[];
  linkedKpiKeys?: string[];
  linkedDocIds?: string[];
  checklist?: Array<{ text: string }>;
  source?: "manual" | "automation";
  blockedReason?: string;
  attachments?: TaskAttachmentUpload[];
}) {
  if (SKIP_AUTH) {
    const dbState = loadMockDb();
    const id = crypto.randomUUID();
    const item: TaskRecord = {
      id,
      productId: input.productId,
      title: input.title,
      description: input.description ?? "",
      type: input.type ?? "other",
      status: "backlog",
      priority: input.priority ?? "medium",
      dueDate: input.dueDate ?? null,
      assignedType: input.assignedType ?? null,
      assignedId: input.assignedId ?? null,
      linkedContactIds: input.linkedContactIds ?? [],
      linkedKpiKeys: input.linkedKpiKeys ?? [],
      linkedDocIds: input.linkedDocIds ?? [],
      checklist: (input.checklist ?? []).map((item, index) => ({ id: `cl_${index + 1}`, text: item.text, done: false })),
      latestCommentPreview: "",
      commentCount: 0,
      source: input.source ?? "manual",
      blockedReason: input.blockedReason ?? "",
      attachments: (input.attachments ?? []).map((item) => toOptimisticAttachmentRecord(item)),
      createdBy: "local",
      createdAt: nowIso(),
      updatedAt: nowIso(),
      completedAt: null,
    };
    dbState.tasksByProduct[input.productId] = [...(dbState.tasksByProduct[input.productId] ?? []), item];
    dbState.commentsByTask[taskKey(input.productId, id)] = [];
    dbState.activityByProduct[input.productId] = [{ id: crypto.randomUUID(), message: `Task created: ${input.title}`, type: "task.created", actorType: "owner", createdAt: nowIso() }, ...(dbState.activityByProduct[input.productId] ?? [])];
    saveMockDb(dbState);
    return { data: { taskId: id } };
  }

  const call = httpsCallable<typeof input, { taskId: string }>(ensureFunctions(), "createTask");
  return call(input);
}

export async function updateTask(input: {
  productId: string;
  taskId: string;
  patch: Partial<{
    title: string;
    description: string;
    type: string;
    status: string;
    priority: string;
    dueDate: string | null;
    assignedType: "human" | "agent" | null;
    assignedId: string | null;
    linkedContactIds: string[];
    linkedKpiKeys: string[];
    linkedDocIds: string[];
    checklist: Array<{ id: string; text: string; done: boolean }>;
    blockedReason: string;
    attachments: TaskAttachmentRecord[];
    newAttachments: TaskAttachmentUpload[];
  }>;
}) {
  if (SKIP_AUTH) {
    const dbState = loadMockDb();
    dbState.tasksByProduct[input.productId] = (dbState.tasksByProduct[input.productId] ?? []).map((task) =>
      task.id === input.taskId
        ? {
            ...task,
            ...input.patch,
            status: "status" in (input.patch ?? {}) ? normalizeTaskStatus((input.patch as { status?: string }).status) : task.status,
            updatedAt: nowIso(),
          }
        : task,
    );
    dbState.activityByProduct[input.productId] = [{ id: crypto.randomUUID(), message: `Task updated`, type: "task.updated", actorType: "owner", createdAt: nowIso() }, ...(dbState.activityByProduct[input.productId] ?? [])];
    saveMockDb(dbState);
    return { data: { ok: true } };
  }

  const call = httpsCallable<typeof input, { ok: boolean }>(ensureFunctions(), "updateTask");
  return call(input);
}

export async function deleteTask(input: { productId: string; taskId: string }) {
  if (SKIP_AUTH) {
    const dbState = loadMockDb();
    const existing = (dbState.tasksByProduct[input.productId] ?? []).find((task) => task.id === input.taskId);
    dbState.tasksByProduct[input.productId] = (dbState.tasksByProduct[input.productId] ?? []).filter((task) => task.id !== input.taskId);
    delete dbState.commentsByTask[taskKey(input.productId, input.taskId)];
    dbState.activityByProduct[input.productId] = [
      {
        id: crypto.randomUUID(),
        message: `Task deleted: ${existing?.title ?? input.taskId}`,
        type: "task.updated",
        actorType: "owner",
        createdAt: nowIso(),
      },
      ...(dbState.activityByProduct[input.productId] ?? []),
    ];
    saveMockDb(dbState);
    return { data: { ok: true } };
  }

  const call = httpsCallable<typeof input, { ok: boolean }>(ensureFunctions(), "deleteTask");
  return call(input);
}

export async function addTaskComment(input: { productId: string; taskId: string; body: string; attachments?: TaskAttachmentUpload[] }) {
  if (SKIP_AUTH) {
    const dbState = loadMockDb();
    const id = crypto.randomUUID();
    const comment: TaskCommentRecord = { id, body: input.body, authorType: "owner", authorId: "local", createdAt: nowIso(), attachments: (input.attachments ?? []).map((item) => toOptimisticAttachmentRecord(item, "tmp_comment")) };
    const key = taskKey(input.productId, input.taskId);
    dbState.commentsByTask[key] = [...(dbState.commentsByTask[key] ?? []), comment];
    dbState.tasksByProduct[input.productId] = (dbState.tasksByProduct[input.productId] ?? []).map((task) =>
      task.id === input.taskId ? { ...task, latestCommentPreview: input.body.slice(0, 160), updatedAt: nowIso() } : task,
    );
    dbState.activityByProduct[input.productId] = [{ id: crypto.randomUUID(), message: `Task commented`, type: "task.commented", actorType: "owner", createdAt: nowIso() }, ...(dbState.activityByProduct[input.productId] ?? [])];
    saveMockDb(dbState);
    return { data: { commentId: id } };
  }

  const call = httpsCallable<typeof input, { commentId: string }>(ensureFunctions(), "addTaskComment");
  return call(input);
}

export async function createKpi(input: {
  productId: string;
  key: string;
  name: string;
  description?: string;
  unit?: "number" | "percent" | "currency" | "text";
  targetDirection?: "up" | "down" | "flat";
  targetValue?: number | null;
}) {
  if (SKIP_AUTH) {
    const dbState = loadMockDb();
    const normalizedKey = input.key.trim();
    if (!normalizedKey) {
      throw new Error("KPI key is required");
    }
    const exists = (dbState.kpisByProduct[input.productId] ?? []).some((kpi) => kpi.key === normalizedKey);
    if (exists) {
      throw new Error("KPI key already exists");
    }
    dbState.kpisByProduct[input.productId] = [
      ...(dbState.kpisByProduct[input.productId] ?? []),
      {
        key: normalizedKey,
        name: input.name.trim(),
        targetValue: typeof input.targetValue === "number" ? input.targetValue : null,
        unit: input.unit ?? "number",
        targetDirection: input.targetDirection ?? "up",
        active: true,
      },
    ];
    dbState.activityByProduct[input.productId] = [
      { id: crypto.randomUUID(), message: `KPI created: ${input.name}`, type: "kpi.created", actorType: "owner", createdAt: nowIso() },
      ...(dbState.activityByProduct[input.productId] ?? []),
    ];
    saveMockDb(dbState);
    return { data: { ok: true } };
  }

  const call = httpsCallable<typeof input, { ok: boolean }>(ensureFunctions(), "createKpi");
  return call(input);
}

export async function addKpiEntry(input: { productId: string; kpiKey: string; value: number; date: string }) {
  if (SKIP_AUTH) {
    const dbState = loadMockDb();
    const id = crypto.randomUUID();
    const key = kpiKey(input.productId, input.kpiKey);
    dbState.kpiEntriesByKey[key] = [...(dbState.kpiEntriesByKey[key] ?? []), { id, productId: input.productId, kpiKey: input.kpiKey, value: input.value, date: input.date, createdAt: nowIso() }];
    dbState.activityByProduct[input.productId] = [{ id: crypto.randomUUID(), message: `Added KPI entry for ${input.kpiKey}: ${input.value}`, type: "kpi.entry_added", actorType: "owner", createdAt: nowIso() }, ...(dbState.activityByProduct[input.productId] ?? [])];
    saveMockDb(dbState);
    return { data: { ok: true } };
  }

  const call = httpsCallable<typeof input, { ok: boolean }>(ensureFunctions(), "addKpiEntry");
  return call(input);
}

export async function updateTaskStatus(input: { productId: string; taskId: string; status: string }) {
  return updateTask({ productId: input.productId, taskId: input.taskId, patch: { status: normalizeTaskStatus(input.status) } });
}
