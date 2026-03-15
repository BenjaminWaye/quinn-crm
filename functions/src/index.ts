import * as admin from "firebase-admin";
import * as functions from "firebase-functions";
import express, { Request, Response } from "express";

admin.initializeApp();

const db = admin.firestore();
const storage = admin.storage();
const eu = functions.region("europe-west1");
const runtimeConfig = functions.config();
const firebaseConfigRaw = process.env.FIREBASE_CONFIG ?? "{}";
const firebaseConfig = (() => {
  try {
    return JSON.parse(firebaseConfigRaw) as { projectId?: string; storageBucket?: string };
  } catch {
    return {} as { projectId?: string; storageBucket?: string };
  }
})();
const PROJECT_ID =
  process.env.GCLOUD_PROJECT ??
  process.env.GCP_PROJECT ??
  firebaseConfig.projectId ??
  "";
const OWNER_UID = process.env.OWNER_UID ?? runtimeConfig?.app?.owner_uid ?? "";
const STORAGE_BUCKET =
  process.env.STORAGE_BUCKET ??
  firebaseConfig.storageBucket ??
  runtimeConfig?.app?.storage_bucket ??
  "";
const OPENCLOW_SECRET =
  process.env.OPENCLOW_SECRET ??
  process.env.OPENCLOW_KEY ??
  runtimeConfig?.openclaw?.secret ??
  runtimeConfig?.openclow?.secret ??
  "";

type ActivityType =
  | "product.updated"
  | "contact.created"
  | "contact.updated"
  | "task.created"
  | "task.updated"
  | "task.commented"
  | "task.status_changed"
  | "kpi.created"
  | "kpi.entry_added"
  | "agent.note";

type TaskStatus = "backlog" | "in_progress" | "blocked" | "review" | "done";
type TaskPriority = "low" | "medium" | "high" | "urgent";
type TaskType = "dev" | "outreach" | "content" | "seo" | "design" | "research" | "admin" | "bug" | "other";
type ContactStatus = "new" | "contacted" | "interested" | "follow_up" | "customer" | "inactive";
type ContactKind = "lead" | "customer" | "partner" | "investor" | "vendor" | "other";

type TaskAttachment = {
  id: string;
  name: string;
  contentType: string;
  sizeBytes: number;
  storagePath: string;
  downloadUrl: string;
};

type AttachmentUploadInput = {
  name?: string;
  dataUrl?: string;
  contentType?: string;
  sizeBytes?: number;
};

const TASK_STATUSES: TaskStatus[] = ["backlog", "in_progress", "blocked", "review", "done"];
const TASK_PRIORITIES: TaskPriority[] = ["low", "medium", "high", "urgent"];
const TASK_TYPES: TaskType[] = ["dev", "outreach", "content", "seo", "design", "research", "admin", "bug", "other"];
const CONTACT_STATUSES: ContactStatus[] = ["new", "contacted", "interested", "follow_up", "customer", "inactive"];
const CONTACT_KINDS: ContactKind[] = ["lead", "customer", "partner", "investor", "vendor", "other"];

const paths = {
  product: (productId: string) => `products/${productId}`,
  contacts: (productId: string) => `products/${productId}/contacts`,
  contact: (productId: string, contactId: string) => `products/${productId}/contacts/${contactId}`,
  contactActivity: (productId: string, contactId: string) => `products/${productId}/contacts/${contactId}/activity`,
  tasks: (productId: string) => `products/${productId}/tasks`,
  task: (productId: string, taskId: string) => `products/${productId}/tasks/${taskId}`,
  taskComments: (productId: string, taskId: string) => `products/${productId}/tasks/${taskId}/comments`,
  kpis: (productId: string) => `products/${productId}/kpis`,
  kpi: (productId: string, key: string) => `products/${productId}/kpis/${key}`,
  kpiEntries: (productId: string, key: string) => `products/${productId}/kpis/${key}/entries`,
  activity: (productId: string) => `products/${productId}/activity`,
  settings: (productId: string) => `products/${productId}/settings/config`,
  agentRuns: "agent_runs",
  openclawDocs: "openclaw_docs",
};

function nowTs() {
  return admin.firestore.FieldValue.serverTimestamp();
}

function requireOwner(context: functions.https.CallableContext): string {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError("unauthenticated", "Sign-in required");
  }

  if (!OWNER_UID) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "OWNER_UID is not configured on the server",
    );
  }

  if (context.auth.uid !== OWNER_UID) {
    throw new functions.https.HttpsError("permission-denied", "Owner access required");
  }
  return context.auth.uid;
}

function assertOpenClawSecret(req: Request, res: Response): boolean {
  if (!OPENCLOW_SECRET) {
    res.status(500).json({ ok: false, error: "Server secret not configured" });
    return false;
  }
  const header = req.header("x-openclaw-key");
  if (!header || header !== OPENCLOW_SECRET) {
    res.status(401).json({ ok: false, error: "Invalid OpenClaw secret" });
    return false;
  }
  return true;
}

function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function sanitizeFileName(input: string): string {
  return input.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 120) || "file";
}

function getStorageBucketCandidates(): string[] {
  const candidates = [
    STORAGE_BUCKET,
    PROJECT_ID ? `${PROJECT_ID}.firebasestorage.app` : "",
    PROJECT_ID ? `${PROJECT_ID}.appspot.com` : "",
  ].filter(Boolean);
  return Array.from(new Set(candidates));
}

function parseDataUrl(dataUrl: string): { contentType: string; buffer: Buffer } {
  const match = dataUrl.match(/^data:([^;,]+);base64,(.+)$/);
  if (!match) {
    throw new Error("Invalid attachment data URL");
  }
  const contentType = String(match[1] ?? "application/octet-stream").toLowerCase();
  const buffer = Buffer.from(match[2], "base64");
  return { contentType, buffer };
}

function assertAllowedContentType(contentType: string) {
  if (
    contentType.startsWith("image/") ||
    contentType === "application/pdf" ||
    contentType.startsWith("text/") ||
    contentType === "application/zip" ||
    contentType === "application/x-zip-compressed"
  ) {
    return;
  }
  throw new Error(`Unsupported attachment content type: ${contentType}`);
}

function isUrlLike(value: string): boolean {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized.startsWith("http://") || normalized.startsWith("https://") || normalized.startsWith("data:");
}

function isTextDocType(typeRaw: string, contentTypeRaw: string): boolean {
  const type = String(typeRaw ?? "").trim().toLowerCase();
  const contentType = String(contentTypeRaw ?? "").trim().toLowerCase();
  const textExt = new Set([".md", ".txt", ".html", ".htm", ".json", ".csv", ".xml", ".yaml", ".yml"]);
  if (textExt.has(type)) return true;
  if (contentType.startsWith("text/")) return true;
  if (contentType === "application/json" || contentType === "application/xml") return true;
  return false;
}

function assertAllowedDocContentType(contentType: string) {
  if (
    contentType.startsWith("image/") ||
    contentType.startsWith("audio/") ||
    contentType.startsWith("video/") ||
    contentType.startsWith("text/") ||
    contentType === "application/pdf" ||
    contentType === "application/json" ||
    contentType === "application/xml" ||
    contentType === "application/octet-stream" ||
    contentType === "application/zip" ||
    contentType === "application/x-zip-compressed"
  ) {
    return;
  }
  throw new Error(`Unsupported document content type: ${contentType}`);
}

async function uploadOpenClawDocAsset(params: {
  agentId: string;
  docId: string;
  fileName: string;
  dataUrl: string;
  contentTypeHint?: string;
}): Promise<{ downloadUrl: string; storagePath: string; contentType: string; sizeBytes: number }> {
  const parsed = parseDataUrl(params.dataUrl);
  const contentType = String(params.contentTypeHint ?? parsed.contentType).toLowerCase();
  assertAllowedDocContentType(contentType);
  const sizeBytes = parsed.buffer.byteLength;
  if (sizeBytes <= 0 || sizeBytes > 20 * 1024 * 1024) {
    throw new Error("Document asset exceeds 20MB limit");
  }

  const safeName = sanitizeFileName(params.fileName);
  const storagePath = `openclaw-docs/${sanitizeFileName(params.agentId)}/${sanitizeFileName(params.docId)}/${Date.now()}-${safeName}`;
  const bucketCandidates = getStorageBucketCandidates();

  let downloadUrl = "";
  let lastError: unknown = null;

  for (const bucketName of bucketCandidates) {
    try {
      const bucket = storage.bucket(bucketName);
      const file = bucket.file(storagePath);
      await file.save(parsed.buffer, {
        contentType,
        resumable: false,
        metadata: {
          cacheControl: "private, max-age=31536000",
        },
      });
      const [signedUrl] = await file.getSignedUrl({ action: "read", expires: "2100-01-01" });
      downloadUrl = signedUrl;
      break;
    } catch (error) {
      lastError = error;
      const message = String((error as Error)?.message ?? "");
      const missingBucket = message.includes("The specified bucket does not exist");
      if (!missingBucket) {
        throw error;
      }
    }
  }

  if (!downloadUrl) {
    throw new Error(
      `No valid Cloud Storage bucket found. Set STORAGE_BUCKET in Functions config/env. Last error: ${String((lastError as Error)?.message ?? "unknown")}`,
    );
  }

  return { downloadUrl, storagePath, contentType, sizeBytes };
}

function sanitizeExistingAttachment(input: unknown): TaskAttachment | null {
  if (!input || typeof input !== "object") return null;
  const row = input as Record<string, unknown>;
  const id = String(row.id ?? "").trim();
  const name = String(row.name ?? "").trim();
  const contentType = String(row.contentType ?? "").trim().toLowerCase();
  const storagePath = String(row.storagePath ?? "").trim();
  const downloadUrl = String(row.downloadUrl ?? "").trim();
  const sizeBytes = Number(row.sizeBytes ?? 0);
  if (!id || !name || !contentType || !storagePath || !downloadUrl) return null;
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0 || sizeBytes > 8 * 1024 * 1024) return null;
  return {
    id,
    name: sanitizeFileName(name),
    contentType,
    sizeBytes,
    storagePath,
    downloadUrl,
  };
}

async function uploadTaskAttachment(params: {
  productId: string;
  taskId: string;
  scope: "task" | "comment";
  upload: AttachmentUploadInput;
}): Promise<TaskAttachment> {
  const dataUrl = String(params.upload.dataUrl ?? "").trim();
  const fileName = sanitizeFileName(String(params.upload.name ?? "attachment"));
  if (!dataUrl) throw new Error("Attachment data is required");
  const parsed = parseDataUrl(dataUrl);
  const contentType = String(params.upload.contentType ?? parsed.contentType).toLowerCase();
  assertAllowedContentType(contentType);
  const sizeBytes = parsed.buffer.byteLength;
  if (sizeBytes <= 0 || sizeBytes > 8 * 1024 * 1024) {
    throw new Error("Attachment exceeds 8MB limit");
  }

  const attachmentId = db.collection("_ids").doc().id;
  const storagePath = `task-attachments/${params.productId}/${params.taskId}/${params.scope}/${attachmentId}-${fileName}`;
  const bucketCandidates = getStorageBucketCandidates();

  let downloadUrl = "";
  let lastError: unknown = null;
  for (const bucketName of bucketCandidates) {
    try {
      const bucket = storage.bucket(bucketName);
      const file = bucket.file(storagePath);
      await file.save(parsed.buffer, {
        contentType,
        resumable: false,
        metadata: {
          cacheControl: "private, max-age=31536000",
        },
      });
      const [signedUrl] = await file.getSignedUrl({ action: "read", expires: "2100-01-01" });
      downloadUrl = signedUrl;
      break;
    } catch (error) {
      lastError = error;
      const message = String((error as Error)?.message ?? "");
      const missingBucket = message.includes("The specified bucket does not exist");
      if (!missingBucket) {
        throw error;
      }
    }
  }

  if (!downloadUrl) {
    throw new Error(
      `No valid Cloud Storage bucket found. Set STORAGE_BUCKET in Functions config/env. Last error: ${String((lastError as Error)?.message ?? "unknown")}`,
    );
  }

  return {
    id: attachmentId,
    name: fileName,
    contentType,
    sizeBytes,
    storagePath,
    downloadUrl,
  };
}


async function resolveProductId(input: string): Promise<string> {
  const raw = input.trim();
  if (!raw) return raw;

  // Fast path: already a valid product document id.
  const direct = await db.doc(paths.product(raw)).get();
  if (direct.exists) return raw;

  const normalized = slugify(raw);
  if (normalized) {
    const normalizedDoc = await db.doc(paths.product(normalized)).get();
    if (normalizedDoc.exists) return normalized;

    const bySlug = await db.collection("products").where("slug", "==", normalized).limit(1).get();
    if (!bySlug.empty) return bySlug.docs[0].id;
  }

  const byExactName = await db.collection("products").where("name", "==", raw).limit(1).get();
  if (!byExactName.empty) return byExactName.docs[0].id;

  return raw;
}

function requireString(value: unknown, field: string, min = 1, max = 5000): string {
  if (typeof value !== "string") {
    throw new Error(`${field} must be a string`);
  }
  const normalized = value.trim();
  if (normalized.length < min || normalized.length > max) {
    throw new Error(`${field} must be ${min}-${max} chars`);
  }
  return normalized;
}

function requireDate(value: unknown, field: string): string {
  const date = requireString(value, field, 10, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`${field} must be YYYY-MM-DD`);
  }
  return date;
}

function enumOrDefault<T extends string>(value: unknown, allowed: T[], fallback: T): T {
  if (typeof value !== "string") {
    return fallback;
  }
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function normalizeTaskStatusInput(value: unknown): unknown {
  return value === "todo" ? "backlog" : value;
}

function assertEnum<T extends string>(value: unknown, allowed: T[], field: string): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new Error(`${field} must be one of: ${allowed.join(", ")}`);
  }
  return value as T;
}

async function writeActivity(params: {
  productId: string;
  type: ActivityType;
  actorType: "owner" | "agent" | "system";
  actorId: string;
  targetType: "product" | "contact" | "task" | "kpi";
  targetId: string;
  message: string;
}) {
  await db.collection(paths.activity(params.productId)).add({
    ...params,
    createdAt: nowTs(),
  });

  await db.doc(paths.product(params.productId)).set(
    {
      lastActivityAt: nowTs(),
      updatedAt: nowTs(),
    },
    { merge: true },
  );
}

const CONTACT_CHANGE_LABELS: Record<string, string> = {
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
  notes: "Notes",
  tags: "Tags",
  linkedTaskIds: "Linked tasks",
  archivedAt: "Archived at",
};

function contactValueForLog(value: unknown): string {
  if (value === undefined || value === null || value === "") return "empty";
  if (Array.isArray(value)) return value.map((item) => String(item)).join(", ") || "empty";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

type ContactChange = {
  field: string;
  label: string;
  before: string;
  after: string;
};

function buildContactChanges(before: Record<string, unknown>, patch: Record<string, unknown>): ContactChange[] {
  const changes: ContactChange[] = [];
  for (const [field, label] of Object.entries(CONTACT_CHANGE_LABELS)) {
    if (!(field in patch)) continue;
    const previous = contactValueForLog(before[field]);
    const next = contactValueForLog(patch[field]);
    if (previous === next) continue;
    changes.push({ field, label, before: previous, after: next });
  }
  return changes;
}

async function writeContactActivity(params: {
  productId: string;
  contactId: string;
  actorId: string;
  actorType: "owner" | "agent" | "system";
  type: "contact.created" | "contact.updated";
  message: string;
  changes?: ContactChange[];
}) {
  await db.collection(paths.contactActivity(params.productId, params.contactId)).add({
    ...params,
    changes: params.changes ?? [],
    createdAt: nowTs(),
  });
}

async function startAgentRun(params: { productId: string; agentId: string; action: string; inputSummary?: string }) {
  const ref = db.collection(paths.agentRuns).doc();
  await ref.set({
    id: ref.id,
    productId: params.productId,
    agentId: params.agentId,
    action: params.action,
    status: "started",
    inputSummary: params.inputSummary ?? "",
    createdAt: nowTs(),
  });
  return ref;
}

async function finishAgentRun(
  runRef: FirebaseFirestore.DocumentReference,
  result: { status: "success" | "failed"; outputSummary?: string; errorMessage?: string },
) {
  await runRef.set(
    {
      status: result.status,
      outputSummary: result.outputSummary ?? "",
      errorMessage: result.errorMessage ?? "",
      completedAt: nowTs(),
    },
    { merge: true },
  );
}

async function syncTaskDocumentLinks(params: {
  productId: string;
  taskId: string;
  taskTitle: string;
  linkedDocIds: string[];
}) {
  const taskKey = `${params.productId}:${params.taskId}`;
  const normalized = Array.from(
    new Set(
      params.linkedDocIds
        .map((id) => String(id).trim())
        .filter(Boolean),
    ),
  );

  const docsCol = db.collection(paths.openclawDocs);
  const currentSnap = await docsCol.where("linkedTaskKeys", "array-contains", taskKey).get();
  const currentlyLinkedIds = new Set(currentSnap.docs.map((docSnap) => docSnap.id));

  const toRemove = currentSnap.docs.filter((docSnap) => !normalized.includes(docSnap.id));
  const toAdd = normalized.filter((docId) => !currentlyLinkedIds.has(docId));

  const batch = db.batch();

  for (const docSnap of toRemove) {
    const data = docSnap.data() as { linkedTaskKeys?: string[]; linkedTasks?: Array<{ productId: string; taskId: string; title?: string }> };
    const nextKeys = (data.linkedTaskKeys ?? []).filter((key) => key !== taskKey);
    const nextTasks = (data.linkedTasks ?? []).filter((item) => !(item.productId === params.productId && item.taskId === params.taskId));
    batch.set(
      docSnap.ref,
      {
        linkedTaskKeys: nextKeys,
        linkedTasks: nextTasks,
        updatedAt: nowTs(),
      },
      { merge: true },
    );
  }

  for (const docId of toAdd) {
    const docRef = docsCol.doc(docId);
    const docSnap = await docRef.get();
    const data = (docSnap.data() ?? {}) as {
      content?: string;
      linkedTaskKeys?: string[];
      linkedTasks?: Array<{ productId: string; taskId: string; title?: string }>;
    };
    const nextKeys = Array.from(new Set([...(data.linkedTaskKeys ?? []), taskKey]));
    const nextTasks = [
      ...(data.linkedTasks ?? []).filter((item) => !(item.productId === params.productId && item.taskId === params.taskId)),
      { productId: params.productId, taskId: params.taskId, title: params.taskTitle },
    ];
    batch.set(
      docRef,
      {
        id: docId,
        name: docId,
        type: "unknown",
        content: docSnap.exists ? data.content ?? "" : "",
        linkedTaskKeys: nextKeys,
        linkedTasks: nextTasks,
        updatedAt: nowTs(),
      },
      { merge: true },
    );
  }

  await batch.commit();
}

async function createTaskInternal(input: {
  productId: string;
  actorId: string;
  actorType: "owner" | "agent";
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
  discordChannelId?: string;
  checklist?: Array<{ text: string }>;
  source?: "manual" | "openclaw" | "automation";
  blockedReason?: string;
  attachments?: AttachmentUploadInput[];
}) {
  const taskRef = db.collection(paths.tasks(input.productId)).doc();

  const uploadedTaskAttachments = (
    await Promise.all((input.attachments ?? []).slice(0, 10).map((upload) => uploadTaskAttachment({
      productId: input.productId,
      taskId: taskRef.id,
      scope: "task",
      upload,
    })))
  ).filter(Boolean);

  const task = {
    id: taskRef.id,
    productId: input.productId,
    title: requireString(input.title, "title", 3, 120),
    description: input.description?.trim() || "",
    type: enumOrDefault(input.type, TASK_TYPES, "other"),
    status: "backlog" as TaskStatus,
    priority: enumOrDefault(input.priority, TASK_PRIORITIES, "medium"),
    dueDate: input.dueDate ?? null,
    assignedType: input.assignedType ?? null,
    assignedId: input.assignedId ?? null,
    linkedContactIds: Array.isArray(input.linkedContactIds) ? input.linkedContactIds : [],
    linkedKpiKeys: Array.isArray(input.linkedKpiKeys) ? input.linkedKpiKeys : [],
    linkedDocIds: Array.isArray(input.linkedDocIds) ? input.linkedDocIds : [],
    discordChannelId: input.discordChannelId?.trim() || "",
    checklist: (input.checklist ?? []).map((item, index) => ({
      id: `item_${index + 1}`,
      text: String(item.text ?? ""),
      done: false,
    })),
    latestCommentPreview: "",
    commentCount: 0,
    source: input.source ?? "manual",
    blockedReason: input.blockedReason?.trim() || "",
    attachments: uploadedTaskAttachments,
    createdBy: input.actorId,
    createdAt: nowTs(),
    updatedAt: nowTs(),
    completedAt: null,
  };

  await taskRef.set(task);

  await syncTaskDocumentLinks({
    productId: input.productId,
    taskId: taskRef.id,
    taskTitle: task.title,
    linkedDocIds: Array.isArray(task.linkedDocIds) ? task.linkedDocIds : [],
  });

  await writeActivity({
    productId: input.productId,
    type: "task.created",
    actorType: input.actorType,
    actorId: input.actorId,
    targetType: "task",
    targetId: taskRef.id,
    message: `Task created: ${task.title}`,
  });

  return taskRef.id;
}

async function updateTaskInternal(input: {
  productId: string;
  taskId: string;
  actorId: string;
  actorType: "owner" | "agent";
  patch: Record<string, unknown>;
}) {
  const taskRef = db.doc(paths.task(input.productId, input.taskId));
  const current = await taskRef.get();
  if (!current.exists) {
    throw new Error("Task not found");
  }

  const currentData = current.data() ?? {};
  const nextStatusRaw = normalizeTaskStatusInput(input.patch.status);
  const previousStatus = String(currentData.status ?? "");

  const updatePayload: Record<string, unknown> = {
    ...input.patch,
    updatedAt: nowTs(),
  };

  if (typeof input.patch.type === "string") {
    updatePayload.type = assertEnum(input.patch.type, TASK_TYPES, "type");
  }
  if (typeof input.patch.priority === "string") {
    updatePayload.priority = assertEnum(input.patch.priority, TASK_PRIORITIES, "priority");
  }
  if (Array.isArray(input.patch.linkedDocIds)) {
    updatePayload.linkedDocIds = input.patch.linkedDocIds
      .map((id) => String(id).trim())
      .filter(Boolean);
  }

  const retainedAttachments = Array.isArray(input.patch.attachments)
    ? input.patch.attachments
        .map((row) => sanitizeExistingAttachment(row))
        .filter((row): row is TaskAttachment => Boolean(row))
        .slice(0, 10)
    : Array.isArray(currentData.attachments)
      ? currentData.attachments
          .map((row: unknown) => sanitizeExistingAttachment(row))
          .filter((row: TaskAttachment | null): row is TaskAttachment => Boolean(row))
          .slice(0, 10)
      : [];

  const newAttachmentsInput = Array.isArray(input.patch.newAttachments)
    ? (input.patch.newAttachments as AttachmentUploadInput[]).slice(0, Math.max(0, 10 - retainedAttachments.length))
    : [];
  const uploadedTaskAttachments = await Promise.all(
    newAttachmentsInput.map((upload) =>
      uploadTaskAttachment({
        productId: input.productId,
        taskId: input.taskId,
        scope: "task",
        upload,
      }),
    ),
  );
  if (Array.isArray(input.patch.attachments) || newAttachmentsInput.length > 0) {
    updatePayload.attachments = [...retainedAttachments, ...uploadedTaskAttachments];
  }

  let nextStatus: TaskStatus | undefined;
  if (typeof nextStatusRaw === "string") {
    nextStatus = assertEnum(nextStatusRaw, TASK_STATUSES, "status");
    updatePayload.status = nextStatus;
  }

  if (nextStatus === "done") {
    updatePayload.completedAt = nowTs();
  } else if (previousStatus === "done" && nextStatus) {
    updatePayload.completedAt = null;
  }

  await taskRef.set(updatePayload, { merge: true });

  if (Array.isArray(updatePayload.linkedDocIds)) {
    await syncTaskDocumentLinks({
      productId: input.productId,
      taskId: input.taskId,
      taskTitle: String(updatePayload.title ?? currentData.title ?? input.taskId),
      linkedDocIds: updatePayload.linkedDocIds as string[],
    });
  }

  await writeActivity({
    productId: input.productId,
    type: nextStatus && nextStatus !== previousStatus ? "task.status_changed" : "task.updated",
    actorType: input.actorType,
    actorId: input.actorId,
    targetType: "task",
    targetId: input.taskId,
    message:
      nextStatus && nextStatus !== previousStatus
        ? `Task moved from ${previousStatus || "unknown"} to ${nextStatus}`
        : `Task updated: ${String(currentData.title ?? input.taskId)}`,
  });
}

async function addTaskCommentInternal(input: {
  productId: string;
  taskId: string;
  body: string;
  actorType: "owner" | "agent";
  actorId: string;
  attachments?: AttachmentUploadInput[];
}) {
  const body = requireString(input.body, "body", 1, 3000);
  const commentsRef = db.collection(paths.taskComments(input.productId, input.taskId));
  const commentRef = commentsRef.doc();
  const taskRef = db.doc(paths.task(input.productId, input.taskId));
  const uploadedCommentAttachments = (
    await Promise.all((input.attachments ?? []).slice(0, 10).map((upload) => uploadTaskAttachment({
      productId: input.productId,
      taskId: input.taskId,
      scope: "comment",
      upload,
    })))
  ).filter(Boolean);

  await db.runTransaction(async (tx) => {
    const taskSnap = await tx.get(taskRef);
    if (!taskSnap.exists) {
      throw new Error("Task not found");
    }

    const data = taskSnap.data() ?? {};
    const currentCount = Number(data.commentCount ?? 0);

    tx.set(commentRef, {
      id: commentRef.id,
      taskId: input.taskId,
      productId: input.productId,
      authorType: input.actorType,
      authorId: input.actorId,
      body,
      attachments: uploadedCommentAttachments,
      createdAt: nowTs(),
    });

    tx.set(
      taskRef,
      {
        commentCount: currentCount + 1,
        latestCommentPreview: body.slice(0, 160),
        updatedAt: nowTs(),
      },
      { merge: true },
    );
  });

  await writeActivity({
    productId: input.productId,
    type: "task.commented",
    actorType: input.actorType,
    actorId: input.actorId,
    targetType: "task",
    targetId: input.taskId,
    message: `${input.actorType} commented on task ${input.taskId}`,
  });

  return commentRef.id;
}

export const createProduct = eu.https.onCall(async (data, context) => {
  try {
    const ownerUid = requireOwner(context);

    const name = requireString(data?.name, "name", 2, 80);
    const slug = data?.slug ? requireString(data.slug, "slug", 2, 64) : slugify(name);

    const products = await db.collection("products").orderBy("order", "desc").limit(1).get();
    const nextOrder = products.empty ? 0 : Number(products.docs[0].get("order") ?? 0) + 1;

    const productRef = db.collection("products").doc(slug);
    const existing = await productRef.get();
    if (existing.exists) {
      throw new Error("Product slug already exists");
    }

    await productRef.set({
      id: productRef.id,
      name,
      slug,
      repo: data?.repo ? String(data.repo).trim() : "",
      description: data?.description ?? "",
      mission: data?.mission ?? "",
      // Optional notification routing (Discord channel id). Leave empty to default to general.
      discordChannelId: data?.discordChannelId ? String(data.discordChannelId).trim() : "",
      status: "active",
      order: nextOrder,
      color: data?.color ?? "",
      icon: data?.icon ?? "",
      ownerId: ownerUid,
      createdAt: nowTs(),
      updatedAt: nowTs(),
    });

    await db.doc(paths.settings(productRef.id)).set({
      productId: productRef.id,
      crmKinds: CONTACT_KINDS,
      crmStatuses: CONTACT_STATUSES,
      taskStatuses: TASK_STATUSES,
      taskTypes: TASK_TYPES,
      taskPriorities: TASK_PRIORITIES,
      allowedAgents: [],
      mobileDefaultView: "overview",
      updatedAt: nowTs(),
    });

    return { productId: productRef.id };
  } catch (error) {
    throw new functions.https.HttpsError("invalid-argument", (error as Error).message);
  }
});

export const updateProduct = eu.https.onCall(async (data, context) => {
  const ownerUid = requireOwner(context);
  const productId = requireString(data?.productId, "productId", 2, 120);
  const patch = (data?.patch ?? {}) as Record<string, unknown>;

  await db.doc(paths.product(productId)).set({ ...patch, updatedAt: nowTs() }, { merge: true });

  await writeActivity({
    productId,
    type: "product.updated",
    actorType: "owner",
    actorId: ownerUid,
    targetType: "product",
    targetId: productId,
    message: `Product updated: ${productId}`,
  });

  return { ok: true };
});

export const createContact = eu.https.onCall(async (data, context) => {
  try {
    const ownerUid = requireOwner(context);
    const productId = requireString(data?.productId, "productId", 2, 120);
    const name = requireString(data?.name, "name", 2, 120);

    const ref = db.collection(paths.contacts(productId)).doc();
    await ref.set({
      id: ref.id,
      productId,
      kind: enumOrDefault(data?.kind, CONTACT_KINDS, "lead"),
      name,
      company: data?.company ?? "",
      title: data?.title ?? "",
      email: data?.email ?? "",
      phone: data?.phone ?? "",
      linkedin: data?.linkedin ?? "",
      website: data?.website ?? "",
      location: data?.location ?? "",
      status: enumOrDefault(data?.status, CONTACT_STATUSES, "new"),
      tags: Array.isArray(data?.tags) ? data.tags : [],
      notes: data?.notes ?? "",
      linkedTaskIds: Array.isArray(data?.linkedTaskIds) ? data.linkedTaskIds : [],
      createdBy: ownerUid,
      createdAt: nowTs(),
      updatedAt: nowTs(),
      archivedAt: null,
    });

    await writeActivity({
      productId,
      type: "contact.created",
      actorType: "owner",
      actorId: ownerUid,
      targetType: "contact",
      targetId: ref.id,
      message: `Contact created: ${name}`,
    });

    await writeContactActivity({
      productId,
      contactId: ref.id,
      actorType: "owner",
      actorId: ownerUid,
      type: "contact.created",
      message: `Contact created`,
      changes: [],
    });

    return { contactId: ref.id };
  } catch (error) {
    throw new functions.https.HttpsError("invalid-argument", (error as Error).message);
  }
});

export const updateContact = eu.https.onCall(async (data, context) => {
  const ownerUid = requireOwner(context);
  const productId = requireString(data?.productId, "productId", 2, 120);
  const contactId = requireString(data?.contactId, "contactId", 2, 120);
  const patch = (data?.patch ?? {}) as Record<string, unknown>;

  if (typeof patch.status === "string") {
    patch.status = assertEnum(patch.status, CONTACT_STATUSES, "status");
  }
  if (typeof patch.kind === "string") {
    patch.kind = assertEnum(patch.kind, CONTACT_KINDS, "kind");
  }

  const contactRef = db.doc(paths.contact(productId, contactId));
  const beforeSnap = await contactRef.get();
  const before = (beforeSnap.data() ?? {}) as Record<string, unknown>;
  const changes = buildContactChanges(before, patch);

  await contactRef.set({ ...patch, updatedAt: nowTs() }, { merge: true });

  await writeActivity({
    productId,
    type: "contact.updated",
    actorType: "owner",
    actorId: ownerUid,
    targetType: "contact",
    targetId: contactId,
    message: `Contact updated: ${String((patch.name as string) || (before.name as string) || contactId)}`,
  });

  const changeSummary =
    changes.length > 0
      ? changes.slice(0, 3).map((item) => `${item.label}: ${item.before} -> ${item.after}`).join(" • ")
      : "No field changes";

  await writeContactActivity({
    productId,
    contactId,
    actorType: "owner",
    actorId: ownerUid,
    type: "contact.updated",
    message: changeSummary,
    changes,
  });

  return { ok: true };
});

export const deleteContact = eu.https.onCall(async (data, context) => {
  const ownerUid = requireOwner(context);
  const productId = requireString(data?.productId, "productId", 2, 120);
  const contactId = requireString(data?.contactId, "contactId", 2, 120);

  const contactRef = db.doc(paths.contact(productId, contactId));
  const contactSnap = await contactRef.get();
  if (!contactSnap.exists) {
    throw new functions.https.HttpsError("not-found", "Contact not found");
  }
  const contactData = contactSnap.data() ?? {};
  const contactName = String(contactData.name ?? contactId);

  const activitySnap = await db.collection(paths.contactActivity(productId, contactId)).get();
  const batch = db.batch();
  for (const docSnap of activitySnap.docs) {
    batch.delete(docSnap.ref);
  }
  batch.delete(contactRef);
  await batch.commit();

  await writeActivity({
    productId,
    type: "contact.updated",
    actorType: "owner",
    actorId: ownerUid,
    targetType: "contact",
    targetId: contactId,
    message: `Contact deleted: ${contactName}`,
  });

  return { ok: true };
});

export const createTask = eu.https.onCall(async (data, context) => {
  try {
    const ownerUid = requireOwner(context);
    const productId = requireString(data?.productId, "productId", 2, 120);

    const taskId = await createTaskInternal({
      productId,
      actorId: ownerUid,
      actorType: "owner",
      title: data?.title,
      description: data?.description,
      type: data?.type,
      priority: data?.priority,
      dueDate: data?.dueDate,
      assignedType: data?.assignedType,
      assignedId: data?.assignedId,
      linkedContactIds: data?.linkedContactIds,
      linkedKpiKeys: data?.linkedKpiKeys,
      linkedDocIds: data?.linkedDocIds,
      discordChannelId: data?.discordChannelId,
      checklist: data?.checklist,
      source: data?.source,
      blockedReason: data?.blockedReason,
      attachments: Array.isArray(data?.attachments) ? data.attachments : [],
    });

    return { taskId };
  } catch (error) {
    throw new functions.https.HttpsError("invalid-argument", (error as Error).message);
  }
});

export const updateTask = eu.https.onCall(async (data, context) => {
  try {
    const ownerUid = requireOwner(context);
    const productId = requireString(data?.productId, "productId", 2, 120);
    const taskId = requireString(data?.taskId, "taskId", 2, 120);

    await updateTaskInternal({
      productId,
      taskId,
      patch: (data?.patch ?? {}) as Record<string, unknown>,
      actorType: "owner",
      actorId: ownerUid,
    });

    return { ok: true };
  } catch (error) {
    throw new functions.https.HttpsError("invalid-argument", (error as Error).message);
  }
});

export const deleteTask = eu.https.onCall(async (data, context) => {
  const ownerUid = requireOwner(context);
  const productId = requireString(data?.productId, "productId", 2, 120);
  const taskId = requireString(data?.taskId, "taskId", 2, 120);

  const taskRef = db.doc(paths.task(productId, taskId));
  const taskSnap = await taskRef.get();
  if (!taskSnap.exists) {
    throw new functions.https.HttpsError("not-found", "Task not found");
  }
  const taskData = taskSnap.data() ?? {};
  const taskTitle = String(taskData.title ?? taskId);

  await syncTaskDocumentLinks({
    productId,
    taskId,
    taskTitle,
    linkedDocIds: [],
  });

  const commentsSnap = await db.collection(paths.taskComments(productId, taskId)).get();
  const batch = db.batch();
  for (const docSnap of commentsSnap.docs) {
    batch.delete(docSnap.ref);
  }
  batch.delete(taskRef);
  await batch.commit();

  await writeActivity({
    productId,
    type: "task.updated",
    actorType: "owner",
    actorId: ownerUid,
    targetType: "task",
    targetId: taskId,
    message: `Task deleted: ${taskTitle}`,
  });

  return { ok: true };
});

export const addTaskComment = eu.https.onCall(async (data, context) => {
  try {
    const ownerUid = requireOwner(context);
    const productId = requireString(data?.productId, "productId", 2, 120);
    const taskId = requireString(data?.taskId, "taskId", 2, 120);
    const body = requireString(data?.body, "body", 1, 3000);

    const commentId = await addTaskCommentInternal({
      productId,
      taskId,
      body,
      actorType: "owner",
      actorId: ownerUid,
      attachments: Array.isArray(data?.attachments) ? data.attachments : [],
    });

    return { commentId };
  } catch (error) {
    throw new functions.https.HttpsError("invalid-argument", (error as Error).message);
  }
});

export const createKpi = eu.https.onCall(async (data, context) => {
  try {
    const ownerUid = requireOwner(context);
    const productId = requireString(data?.productId, "productId", 2, 120);
    const key = requireString(data?.key, "key", 2, 80);
    const name = requireString(data?.name, "name", 2, 120);

    await db.doc(paths.kpi(productId, key)).set({
      key,
      productId,
      name,
      description: data?.description ?? "",
      unit: enumOrDefault(data?.unit, ["number", "percent", "currency", "text"], "number"),
      targetDirection: enumOrDefault(data?.targetDirection, ["up", "down", "flat"], "up"),
      targetValue: typeof data?.targetValue === "number" ? data.targetValue : null,
      active: true,
      order: typeof data?.order === "number" ? data.order : 0,
      createdAt: nowTs(),
      updatedAt: nowTs(),
    });

    await writeActivity({
      productId,
      type: "kpi.created",
      actorType: "owner",
      actorId: ownerUid,
      targetType: "kpi",
      targetId: key,
      message: `KPI created: ${name}`,
    });

    return { ok: true };
  } catch (error) {
    throw new functions.https.HttpsError("invalid-argument", (error as Error).message);
  }
});

export const addKpiEntry = eu.https.onCall(async (data, context) => {
  try {
    const ownerUid = requireOwner(context);
    const productId = requireString(data?.productId, "productId", 2, 120);
    const kpiKey = requireString(data?.kpiKey, "kpiKey", 2, 120);

    if (typeof data?.value !== "number") {
      throw new Error("value must be a number");
    }

    const ref = db.collection(paths.kpiEntries(productId, kpiKey)).doc();
    await ref.set({
      id: ref.id,
      productId,
      kpiKey,
      value: data.value,
      date: requireDate(data?.date, "date"),
      source: enumOrDefault(data?.source, ["manual", "import", "automation"], "manual"),
      note: data?.note ?? "",
      createdAt: nowTs(),
    });

    await writeActivity({
      productId,
      type: "kpi.entry_added",
      actorType: "owner",
      actorId: ownerUid,
      targetType: "kpi",
      targetId: kpiKey,
      message: `Added KPI entry for ${kpiKey}: ${data.value}`,
    });

    return { ok: true };
  } catch (error) {
    throw new functions.https.HttpsError("invalid-argument", (error as Error).message);
  }
});

const openclaw = express();
openclaw.use(express.json());
openclaw.use((req, res, next) => {
  if (!assertOpenClawSecret(req, res)) {
    return;
  }
  next();
});

openclaw.post("/api/openclaw/listProducts", async (req, res) => {
  const agentId = String(req.body?.agentId ?? "openclaw");
  const run = await startAgentRun({ productId: "global", agentId, action: "listProducts" });
  try {
    const snap = await db.collection("products").orderBy("order", "asc").get();
    await finishAgentRun(run, { status: "success", outputSummary: `count:${snap.size}` });
    res.json({ ok: true, data: { items: snap.docs.map((d) => d.data()) } });
  } catch (error) {
    await finishAgentRun(run, { status: "failed", errorMessage: (error as Error).message });
    res.status(400).json({ ok: false, error: (error as Error).message });
  }
});

openclaw.post("/api/openclaw/getProductOverview", async (req, res) => {
  const productId = String(req.body?.productId ?? "").trim();
  const agentId = String(req.body?.agentId ?? "openclaw").trim();
  if (!productId) {
    res.status(400).json({ ok: false, error: "productId is required" });
    return;
  }

  const run = await startAgentRun({ productId, agentId, action: "getProductOverview" });
  try {
    const [kpiSnap, tasksSnap, contactsSnap, activitySnap, blockersSnap] = await Promise.all([
      db.collection(paths.kpis(productId)).where("active", "==", true).limit(6).get(),
      db
        .collection(paths.tasks(productId))
        .where("status", "!=", "done")
        .orderBy("status")
        .orderBy("updatedAt", "desc")
        .limit(5)
        .get(),
      db
        .collection(paths.contacts(productId))
        .where("status", "in", ["contacted", "interested", "customer"])
        .orderBy("updatedAt", "desc")
        .limit(5)
        .get(),
      db.collection(paths.activity(productId)).orderBy("createdAt", "desc").limit(10).get(),
      db.collection(paths.tasks(productId)).where("status", "==", "blocked").limit(10).get(),
    ]);

    await finishAgentRun(run, { status: "success", outputSummary: "overview loaded" });

    res.json({
      ok: true,
      data: {
        kpiSnapshot: kpiSnap.docs.map((d) => d.data()),
        topPriorities: tasksSnap.docs.map((d) => d.data()),
        keyContacts: contactsSnap.docs.map((d) => d.data()),
        recentActivity: activitySnap.docs.map((d) => d.data()),
        blockers: blockersSnap.docs.map((d) => d.data()),
        latestAgentNote:
          activitySnap.docs.map((d) => d.data()).find((item) => item.actorType === "agent") ?? null,
      },
    });
  } catch (error) {
    await finishAgentRun(run, { status: "failed", errorMessage: (error as Error).message });
    res.status(400).json({ ok: false, error: (error as Error).message });
  }
});

openclaw.post("/api/openclaw/listTasks", async (req, res) => {
  const productId = String(req.body?.productId ?? "").trim();
  const agentId = String(req.body?.agentId ?? "openclaw").trim();
  const requestedStatus = String(req.body?.status ?? "").trim();
  const status = String(normalizeTaskStatusInput(requestedStatus) ?? "").trim();
  const take = Math.min(Number(req.body?.limit ?? 20), 100);

  if (!productId) {
    res.status(400).json({ ok: false, error: "productId is required" });
    return;
  }

  const run = await startAgentRun({ productId, agentId, action: "listTasks" });
  try {
    const resolvedProductId = await resolveProductId(productId);
    let q: FirebaseFirestore.Query = db.collection(paths.tasks(resolvedProductId));
    if (status && TASK_STATUSES.includes(status as TaskStatus)) {
      q = q.where("status", "==", status);
    }
    const snap = await q.orderBy("updatedAt", "desc").limit(take).get();
    await finishAgentRun(run, { status: "success", outputSummary: `count:${snap.size}` });
    res.json({
      ok: true,
      data: {
        productId: resolvedProductId,
        requestedProductId: productId,
        items: snap.docs.map((d) => d.data()),
      },
    });
  } catch (error) {
    await finishAgentRun(run, { status: "failed", errorMessage: (error as Error).message });
    res.status(400).json({ ok: false, error: (error as Error).message });
  }
});

openclaw.post("/api/openclaw/getTask", async (req, res) => {
  const taskId = String(req.body?.taskId ?? "").trim();
  const requestedProductId = String(req.body?.productId ?? "").trim();
  const agentId = String(req.body?.agentId ?? "openclaw").trim();
  const includeComments = Boolean(req.body?.includeComments);
  const commentLimit = Math.min(Number(req.body?.commentLimit ?? 20), 100);

  if (!taskId) {
    res.status(400).json({ ok: false, error: "taskId is required" });
    return;
  }

  const run = await startAgentRun({
    productId: requestedProductId || "global",
    agentId,
    action: "getTask",
  });

  try {
    let resolvedProductId = requestedProductId ? await resolveProductId(requestedProductId) : "";
    let taskData: FirebaseFirestore.DocumentData | null = null;

    if (resolvedProductId) {
      const taskSnap = await db.doc(paths.task(resolvedProductId, taskId)).get();
      if (taskSnap.exists) {
        taskData = taskSnap.data() ?? null;
      }
    } else {
      const snap = await db.collectionGroup("tasks").where("id", "==", taskId).limit(1).get();
      if (!snap.empty) {
        const taskDoc = snap.docs[0];
        taskData = taskDoc.data();
        resolvedProductId = String(taskData.productId ?? "").trim();
      }
    }

    if (!taskData || !resolvedProductId) {
      await finishAgentRun(run, { status: "failed", errorMessage: `task:${taskId} not found` });
      res.status(404).json({ ok: false, error: "Task not found" });
      return;
    }

    let comments: FirebaseFirestore.DocumentData[] = [];
    if (includeComments) {
      const commentsSnap = await db
        .collection(paths.taskComments(resolvedProductId, taskId))
        .orderBy("createdAt", "desc")
        .limit(commentLimit)
        .get();
      comments = commentsSnap.docs.map((d) => d.data());
    }

    await finishAgentRun(run, { status: "success", outputSummary: `task:${taskId}` });
    res.json({
      ok: true,
      data: {
        requestedProductId: requestedProductId || null,
        productId: resolvedProductId,
        task: taskData,
        comments,
      },
    });
  } catch (error) {
    await finishAgentRun(run, { status: "failed", errorMessage: (error as Error).message });
    res.status(400).json({ ok: false, error: (error as Error).message });
  }
});

openclaw.post("/api/openclaw/createTask", async (req, res) => {
  let run: FirebaseFirestore.DocumentReference | null = null;
  try {
    const productId = requireString(req.body?.productId, "productId", 2, 120);
    const agentId = requireString(req.body?.agentId, "agentId", 2, 120);
    run = await startAgentRun({ productId, agentId, action: "task.create" });

    const taskId = await createTaskInternal({
      productId,
      actorId: agentId,
      actorType: "agent",
      title: req.body?.title,
      description: req.body?.description,
      type: req.body?.type,
      priority: req.body?.priority,
      dueDate: req.body?.dueDate,
      assignedType: req.body?.assignedType,
      assignedId: req.body?.assignedId,
      linkedContactIds: req.body?.linkedContactIds,
      linkedKpiKeys: req.body?.linkedKpiKeys,
      linkedDocIds: req.body?.linkedDocIds,
      discordChannelId: req.body?.discordChannelId,
      checklist: req.body?.checklist,
      source: "openclaw",
      blockedReason: req.body?.blockedReason,
      attachments: Array.isArray(req.body?.attachments) ? req.body.attachments : [],
    });

    await finishAgentRun(run, { status: "success", outputSummary: `taskId:${taskId}` });
    res.json({ ok: true, data: { taskId } });
  } catch (error) {
    if (run) {
      await finishAgentRun(run, { status: "failed", errorMessage: (error as Error).message });
    }
    res.status(400).json({ ok: false, error: (error as Error).message });
  }
});

openclaw.post("/api/openclaw/updateTask", async (req, res) => {
  let run: FirebaseFirestore.DocumentReference | null = null;
  try {
    const productId = requireString(req.body?.productId, "productId", 2, 120);
    const taskId = requireString(req.body?.taskId, "taskId", 2, 120);
    const agentId = requireString(req.body?.agentId, "agentId", 2, 120);
    run = await startAgentRun({ productId, agentId, action: "task.update" });

    await updateTaskInternal({
      productId,
      taskId,
      patch: (req.body?.patch ?? {}) as Record<string, unknown>,
      actorType: "agent",
      actorId: agentId,
    });

    await finishAgentRun(run, { status: "success", outputSummary: `taskId:${taskId}` });
    res.json({ ok: true, data: { ok: true } });
  } catch (error) {
    if (run) {
      await finishAgentRun(run, { status: "failed", errorMessage: (error as Error).message });
    }
    res.status(400).json({ ok: false, error: (error as Error).message });
  }
});

openclaw.post("/api/openclaw/addTaskComment", async (req, res) => {
  let run: FirebaseFirestore.DocumentReference | null = null;
  try {
    const productId = requireString(req.body?.productId, "productId", 2, 120);
    const taskId = requireString(req.body?.taskId, "taskId", 2, 120);
    const agentId = requireString(req.body?.agentId, "agentId", 2, 120);
    run = await startAgentRun({ productId, agentId, action: "task.comment" });

    const commentId = await addTaskCommentInternal({
      productId,
      taskId,
      body: req.body?.body,
      actorType: "agent",
      actorId: agentId,
      attachments: Array.isArray(req.body?.attachments) ? req.body.attachments : [],
    });

    await finishAgentRun(run, { status: "success", outputSummary: `commentId:${commentId}` });
    res.json({ ok: true, data: { commentId } });
  } catch (error) {
    if (run) {
      await finishAgentRun(run, { status: "failed", errorMessage: (error as Error).message });
    }
    res.status(400).json({ ok: false, error: (error as Error).message });
  }
});

openclaw.post("/api/openclaw/listTaskComments", async (req, res) => {
  let run: FirebaseFirestore.DocumentReference | null = null;
  try {
    const productId = requireString(req.body?.productId, "productId", 2, 120);
    const taskId = requireString(req.body?.taskId, "taskId", 2, 120);
    const agentId = requireString(req.body?.agentId, "agentId", 2, 120);
    const take = Math.min(Number(req.body?.limit ?? 20), 100);

    run = await startAgentRun({ productId, agentId, action: "task.comments.list" });

    const snap = await db
      .collection(paths.taskComments(productId, taskId))
      .orderBy("createdAt", "desc")
      .limit(take)
      .get();

    const items = snap.docs.map((d) => d.data());
    await finishAgentRun(run, { status: "success", outputSummary: `count:${items.length}` });
    res.json({ ok: true, data: { items } });
  } catch (error) {
    if (run) {
      await finishAgentRun(run, { status: "failed", errorMessage: (error as Error).message });
    }
    res.status(400).json({ ok: false, error: (error as Error).message });
  }
});

openclaw.post("/api/openclaw/listContacts", async (req, res) => {
  const productId = String(req.body?.productId ?? "").trim();
  const agentId = String(req.body?.agentId ?? "openclaw").trim();
  const take = Math.min(Number(req.body?.limit ?? 20), 100);

  if (!productId) {
    res.status(400).json({ ok: false, error: "productId is required" });
    return;
  }

  const run = await startAgentRun({ productId, agentId, action: "listContacts" });
  try {
    const snap = await db.collection(paths.contacts(productId)).orderBy("updatedAt", "desc").limit(take).get();
    await finishAgentRun(run, { status: "success", outputSummary: `count:${snap.size}` });
    res.json({ ok: true, data: { items: snap.docs.map((d) => d.data()) } });
  } catch (error) {
    await finishAgentRun(run, { status: "failed", errorMessage: (error as Error).message });
    res.status(400).json({ ok: false, error: (error as Error).message });
  }
});

openclaw.post("/api/openclaw/addKpiEntry", async (req, res) => {
  let run: FirebaseFirestore.DocumentReference | null = null;
  try {
    const productId = requireString(req.body?.productId, "productId", 2, 120);
    const kpiKey = requireString(req.body?.kpiKey, "kpiKey", 2, 120);
    const agentId = requireString(req.body?.agentId, "agentId", 2, 120);

    if (typeof req.body?.value !== "number") {
      throw new Error("value must be a number");
    }

    run = await startAgentRun({ productId, agentId, action: "kpi.entry" });

    const ref = db.collection(paths.kpiEntries(productId, kpiKey)).doc();
    await ref.set({
      id: ref.id,
      productId,
      kpiKey,
      value: req.body.value,
      date: requireDate(req.body?.date, "date"),
      source: "automation",
      note: req.body?.note ?? "",
      createdAt: nowTs(),
    });

    await writeActivity({
      productId,
      type: "kpi.entry_added",
      actorType: "agent",
      actorId: agentId,
      targetType: "kpi",
      targetId: kpiKey,
      message: `OpenClaw added KPI entry for ${kpiKey}: ${req.body.value}`,
    });

    await finishAgentRun(run, { status: "success", outputSummary: `entryId:${ref.id}` });
    res.json({ ok: true, data: { id: ref.id } });
  } catch (error) {
    if (run) {
      await finishAgentRun(run, { status: "failed", errorMessage: (error as Error).message });
    }
    res.status(400).json({ ok: false, error: (error as Error).message });
  }
});

openclaw.post("/api/openclaw/syncSchedules", async (req, res) => {
  let run: FirebaseFirestore.DocumentReference | null = null;
  try {
    const agentId = requireString(req.body?.agentId, "agentId", 2, 120);
    const timezone = String(req.body?.timezone ?? "UTC");
    const generatedAt = String(req.body?.generatedAt ?? new Date().toISOString());
    const jobs = Array.isArray(req.body?.jobs) ? req.body.jobs : [];

    run = await startAgentRun({
      productId: "global",
      agentId,
      action: "summary.write",
      inputSummary: `syncSchedules:${jobs.length}`,
    });

    const schedulesCol = db.collection("openclaw_schedules");
    const existingSnap = await schedulesCol.where("agentId", "==", agentId).get();
    const incomingDocIds = new Set<string>();
    const batch = db.batch();

    for (const rawJob of jobs) {
      const jobId = requireString(rawJob?.id, "job.id", 2, 120);
      const name = requireString(rawJob?.name, "job.name", 2, 160);
      const docId = `${agentId}__${jobId}`;
      incomingDocIds.add(docId);

      const weekSlots = Array.isArray(rawJob?.weekSlots)
        ? rawJob.weekSlots
            .map((slot: unknown) => {
              const day = Number((slot as { day?: number })?.day);
              const time = String((slot as { time?: string })?.time ?? "");
              if (!Number.isInteger(day) || day < 0 || day > 6 || !/^\d{2}:\d{2}$/.test(time)) {
                return null;
              }
              return {
                day,
                time,
                label: String((slot as { label?: string })?.label ?? ""),
              };
            })
            .filter(Boolean)
        : [];

      batch.set(
        schedulesCol.doc(docId),
        {
          id: jobId,
          docId,
          name,
          agentId,
          enabled: rawJob?.enabled !== false,
          alwaysRunning: Boolean(rawJob?.alwaysRunning),
          color: String(rawJob?.color ?? ""),
          timezone: String(rawJob?.timezone ?? timezone),
          productId: rawJob?.productId ? String(rawJob.productId) : null,
          scheduleType: String(rawJob?.scheduleType ?? "other"),
          expression: String(rawJob?.expression ?? ""),
          tags: Array.isArray(rawJob?.tags) ? rawJob.tags.map((tag: unknown) => String(tag)) : [],
          weekSlots,
          nextRuns: Array.isArray(rawJob?.nextRuns) ? rawJob.nextRuns.map((runAt: unknown) => String(runAt)) : [],
          sourceUpdatedAt: String(rawJob?.sourceUpdatedAt ?? generatedAt),
          syncedAt: generatedAt,
          updatedAt: nowTs(),
        },
        { merge: true },
      );
    }

    for (const docSnap of existingSnap.docs) {
      if (!incomingDocIds.has(docSnap.id)) {
        batch.delete(docSnap.ref);
      }
    }

    batch.set(
      db.doc(`system/openclaw_schedule_sync_${agentId}`),
      {
        agentId,
        timezone,
        generatedAt,
        lastSyncedAt: nowTs(),
        count: jobs.length,
      },
      { merge: true },
    );

    await batch.commit();

    await finishAgentRun(run, { status: "success", outputSummary: `schedules:${jobs.length}` });
    res.json({ ok: true, data: { count: jobs.length } });
  } catch (error) {
    if (run) {
      await finishAgentRun(run, { status: "failed", errorMessage: (error as Error).message });
    }
    res.status(400).json({ ok: false, error: (error as Error).message });
  }
});

openclaw.post("/api/openclaw/syncMemory", async (req, res) => {
  let run: FirebaseFirestore.DocumentReference | null = null;
  try {
    const agentId = requireString(req.body?.agentId, "agentId", 2, 120);
    const generatedAt = String(req.body?.generatedAt ?? new Date().toISOString());
    const entries = Array.isArray(req.body?.entries) ? req.body.entries : [];
    const longTerm = req.body?.longTerm ?? null;

    run = await startAgentRun({
      productId: "global",
      agentId,
      action: "summary.write",
      inputSummary: `syncMemory:${entries.length}`,
    });

    const entriesCol = db.collection("openclaw_memory_entries");
    const existingSnap = await entriesCol.where("agentId", "==", agentId).get();
    const incomingIds = new Set<string>();
    const batch = db.batch();

    for (const rawEntry of entries) {
      const id = requireString(rawEntry?.id, "entry.id", 2, 160);
      const title = requireString(rawEntry?.title, "entry.title", 2, 240);
      const content = requireString(rawEntry?.content, "entry.content", 1, 200000);
      incomingIds.add(id);

      batch.set(
        entriesCol.doc(id),
        {
          id,
          title,
          content,
          summary: String(rawEntry?.summary ?? ""),
          tags: Array.isArray(rawEntry?.tags) ? rawEntry.tags.map((tag: unknown) => String(tag)) : [],
          sourceFile: String(rawEntry?.sourceFile ?? ""),
          agentId,
          wordCount: Number(rawEntry?.wordCount ?? 0),
          createdAt: String(rawEntry?.createdAt ?? generatedAt),
          updatedAt: String(rawEntry?.updatedAt ?? generatedAt),
          syncedAt: generatedAt,
        },
        { merge: true },
      );
    }

    for (const docSnap of existingSnap.docs) {
      if (!incomingIds.has(docSnap.id)) {
        batch.delete(docSnap.ref);
      }
    }

    if (longTerm) {
      const title = requireString(longTerm?.title, "longTerm.title", 2, 240);
      const content = requireString(longTerm?.content, "longTerm.content", 1, 500000);
      batch.set(
        db.doc("openclaw_memory/long_term"),
        {
          id: "long_term",
          title,
          content,
          sourceFile: String(longTerm?.sourceFile ?? ""),
          wordCount: Number(longTerm?.wordCount ?? 0),
          updatedAt: String(longTerm?.updatedAt ?? generatedAt),
          syncedAt: generatedAt,
          agentId,
        },
        { merge: true },
      );
    }

    batch.set(
      db.doc("system/openclaw_memory_sync"),
      {
        agentId,
        generatedAt,
        count: entries.length,
        lastSyncedAt: nowTs(),
      },
      { merge: true },
    );

    await batch.commit();
    await finishAgentRun(run, { status: "success", outputSummary: `memory:${entries.length}` });
    res.json({ ok: true, data: { count: entries.length } });
  } catch (error) {
    if (run) {
      await finishAgentRun(run, { status: "failed", errorMessage: (error as Error).message });
    }
    res.status(400).json({ ok: false, error: (error as Error).message });
  }
});

openclaw.post("/api/openclaw/syncDocs", async (req, res) => {
  let run: FirebaseFirestore.DocumentReference | null = null;
  try {
    const agentId = requireString(req.body?.agentId, "agentId", 2, 120);
    const generatedAt = String(req.body?.generatedAt ?? new Date().toISOString());
    const docs = Array.isArray(req.body?.docs) ? req.body.docs : [];

    run = await startAgentRun({
      productId: "global",
      agentId,
      action: "summary.write",
      inputSummary: `syncDocs:${docs.length}`,
    });

    const docsCol = db.collection(paths.openclawDocs);
    const existingSnap = await docsCol.where("agentId", "==", agentId).get();
    const incomingIds = new Set<string>();
    const batch = db.batch();

    for (const rawDoc of docs) {
      const id = requireString(rawDoc?.id, "doc.id", 2, 200);
      const name = requireString(rawDoc?.name, "doc.name", 1, 300);
      const type = String(rawDoc?.type ?? "unknown").trim();
      const sourceFile = String(rawDoc?.sourceFile ?? "").trim();
      const content = String(rawDoc?.content ?? "");
      const contentTypeRaw = String(rawDoc?.contentType ?? "").trim().toLowerCase();
      const isTextDoc = isTextDocType(type, contentTypeRaw);
      const hasDataUrlPayload = isUrlLike(content) && content.trim().toLowerCase().startsWith("data:");

      let persistedContent = content;
      let downloadUrl = String(rawDoc?.downloadUrl ?? rawDoc?.url ?? "").trim();
      let storagePath = String(rawDoc?.storagePath ?? "").trim();
      let resolvedContentType = contentTypeRaw;
      let resolvedSizeBytes = Number(rawDoc?.sizeBytes ?? 0);

      if (!isTextDoc) {
        if (!downloadUrl && hasDataUrlPayload) {
          const uploaded = await uploadOpenClawDocAsset({
            agentId,
            docId: id,
            fileName: name,
            dataUrl: content,
            contentTypeHint: contentTypeRaw || undefined,
          });
          downloadUrl = uploaded.downloadUrl;
          storagePath = uploaded.storagePath;
          resolvedContentType = uploaded.contentType;
          resolvedSizeBytes = uploaded.sizeBytes;
          persistedContent = "";
        } else if (!downloadUrl && isUrlLike(sourceFile)) {
          downloadUrl = sourceFile;
        }
      }

      if (!isTextDoc && !downloadUrl) {
        throw new Error(
          `syncDocs: non-text doc '${id}' requires either content as data URL or a downloadUrl/url`,
        );
      }

      incomingIds.add(id);

      const linkedTasks: Array<{ productId: string; taskId: string; title: string }> = Array.isArray(rawDoc?.linkedTasks)
        ? rawDoc.linkedTasks
            .map((item: unknown) => {
              const productId = String((item as { productId?: string })?.productId ?? "").trim();
              const taskId = String((item as { taskId?: string })?.taskId ?? "").trim();
              const title = String((item as { title?: string })?.title ?? "");
              if (!productId || !taskId) return null;
              return { productId, taskId, title };
            })
            .filter(
              (
                item: { productId: string; taskId: string; title: string } | null,
              ): item is { productId: string; taskId: string; title: string } => Boolean(item),
            )
        : [];

      const linkedTaskKeys = linkedTasks.map((item: { productId: string; taskId: string }) => `${item.productId}:${item.taskId}`);

      batch.set(
        docsCol.doc(id),
        {
          id,
          name,
          type,
          content: persistedContent,
          downloadUrl,
          storagePath,
          contentType: resolvedContentType,
          summary: String(rawDoc?.summary ?? ""),
          tags: Array.isArray(rawDoc?.tags) ? rawDoc.tags.map((tag: unknown) => String(tag)) : [],
          sourceFile,
          agentId,
          productId: rawDoc?.productId ? String(rawDoc.productId) : null,
          sizeBytes: resolvedSizeBytes,
          wordCount: Number(rawDoc?.wordCount ?? 0),
          modifiedAt: String(rawDoc?.modifiedAt ?? generatedAt),
          syncedAt: generatedAt,
          linkedTaskKeys,
          linkedTasks,
          updatedAt: nowTs(),
        },
        { merge: true },
      );
    }

    for (const docSnap of existingSnap.docs) {
      if (!incomingIds.has(docSnap.id)) {
        batch.delete(docSnap.ref);
      }
    }

    batch.set(
      db.doc("system/openclaw_docs_sync"),
      {
        agentId,
        generatedAt,
        count: docs.length,
        lastSyncedAt: nowTs(),
      },
      { merge: true },
    );

    await batch.commit();
    await finishAgentRun(run, { status: "success", outputSummary: `docs:${docs.length}` });
    res.json({ ok: true, data: { count: docs.length } });
  } catch (error) {
    if (run) {
      await finishAgentRun(run, { status: "failed", errorMessage: (error as Error).message });
    }
    res.status(400).json({ ok: false, error: (error as Error).message });
  }
});

openclaw.post("/api/openclaw/syncTeam", async (req, res) => {
  let run: FirebaseFirestore.DocumentReference | null = null;
  try {
    const sourceId = requireString(req.body?.sourceId ?? req.body?.agentId, "sourceId", 2, 120);
    const generatedAt = String(req.body?.generatedAt ?? new Date().toISOString());
    const agents = Array.isArray(req.body?.agents) ? req.body.agents : [];

    run = await startAgentRun({
      productId: "global",
      agentId: sourceId,
      action: "summary.write",
      inputSummary: `syncTeam:${agents.length}`,
    });

    const col = db.collection("openclaw_agents");
    const existingSnap = await col.where("syncSource", "==", sourceId).get();
    const incomingIds = new Set<string>();
    const batch = db.batch();

    for (const raw of agents) {
      const id = requireString(raw?.id, "agent.id", 2, 120);
      const name = requireString(raw?.name, "agent.name", 2, 200);
      const role = requireString(raw?.role, "agent.role", 2, 200);
      const description = String(raw?.description ?? "");
      incomingIds.add(id);

      batch.set(
        col.doc(id),
        {
          id,
          name,
          role,
          description,
          parentId: raw?.parentId ? String(raw.parentId) : null,
          machine: String(raw?.machine ?? ""),
          status: String(raw?.status ?? "active"),
          tags: Array.isArray(raw?.tags) ? raw.tags.map((tag: unknown) => String(tag)) : [],
          avatar: String(raw?.avatar ?? ""),
          order: Number(raw?.order ?? 0),
          syncSource: sourceId,
          syncedAt: generatedAt,
          updatedAt: nowTs(),
        },
        { merge: true },
      );
    }

    for (const docSnap of existingSnap.docs) {
      if (!incomingIds.has(docSnap.id)) {
        batch.delete(docSnap.ref);
      }
    }

    batch.set(
      db.doc("system/openclaw_team_sync"),
      {
        sourceId,
        generatedAt,
        count: agents.length,
        lastSyncedAt: nowTs(),
      },
      { merge: true },
    );

    await batch.commit();
    await finishAgentRun(run, { status: "success", outputSummary: `team:${agents.length}` });
    res.json({ ok: true, data: { count: agents.length } });
  } catch (error) {
    if (run) {
      await finishAgentRun(run, { status: "failed", errorMessage: (error as Error).message });
    }
    res.status(400).json({ ok: false, error: (error as Error).message });
  }
});

openclaw.post("/api/openclaw/addActivityNote", async (req, res) => {
  let run: FirebaseFirestore.DocumentReference | null = null;
  try {
    const productId = requireString(req.body?.productId, "productId", 2, 120);
    const agentId = requireString(req.body?.agentId, "agentId", 2, 120);
    const message = requireString(req.body?.message, "message", 2, 500);

    run = await startAgentRun({ productId, agentId, action: "summary.write" });

    await writeActivity({
      productId,
      type: "agent.note",
      actorType: "agent",
      actorId: agentId,
      targetType: "product",
      targetId: productId,
      message,
    });

    await finishAgentRun(run, { status: "success", outputSummary: "note added" });
    res.json({ ok: true, data: { ok: true } });
  } catch (error) {
    if (run) {
      await finishAgentRun(run, { status: "failed", errorMessage: (error as Error).message });
    }
    res.status(400).json({ ok: false, error: (error as Error).message });
  }
});

export const api = eu.https.onRequest(openclaw);
