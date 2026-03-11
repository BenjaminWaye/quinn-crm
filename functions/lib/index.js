"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.api = exports.addKpiEntry = exports.createKpi = exports.addTaskComment = exports.deleteTask = exports.updateTask = exports.createTask = exports.deleteContact = exports.updateContact = exports.createContact = exports.updateProduct = exports.createProduct = void 0;
const admin = __importStar(require("firebase-admin"));
const functions = __importStar(require("firebase-functions"));
const express_1 = __importDefault(require("express"));
admin.initializeApp();
const db = admin.firestore();
const eu = functions.region("europe-west1");
const runtimeConfig = functions.config();
const OWNER_UID = process.env.OWNER_UID ?? runtimeConfig?.app?.owner_uid ?? "";
const OPENCLOW_SECRET = process.env.OPENCLOW_SECRET ??
    process.env.OPENCLOW_KEY ??
    runtimeConfig?.openclaw?.secret ??
    runtimeConfig?.openclow?.secret ??
    "";
const TASK_STATUSES = ["backlog", "in_progress", "blocked", "review", "done"];
const TASK_PRIORITIES = ["low", "medium", "high", "urgent"];
const TASK_TYPES = ["dev", "outreach", "content", "seo", "design", "research", "admin", "bug", "other"];
const CONTACT_STATUSES = ["new", "contacted", "interested", "follow_up", "customer", "inactive"];
const CONTACT_KINDS = ["lead", "customer", "partner", "investor", "vendor", "other"];
const paths = {
    product: (productId) => `products/${productId}`,
    contacts: (productId) => `products/${productId}/contacts`,
    contact: (productId, contactId) => `products/${productId}/contacts/${contactId}`,
    contactActivity: (productId, contactId) => `products/${productId}/contacts/${contactId}/activity`,
    tasks: (productId) => `products/${productId}/tasks`,
    task: (productId, taskId) => `products/${productId}/tasks/${taskId}`,
    taskComments: (productId, taskId) => `products/${productId}/tasks/${taskId}/comments`,
    kpis: (productId) => `products/${productId}/kpis`,
    kpi: (productId, key) => `products/${productId}/kpis/${key}`,
    kpiEntries: (productId, key) => `products/${productId}/kpis/${key}/entries`,
    activity: (productId) => `products/${productId}/activity`,
    settings: (productId) => `products/${productId}/settings/config`,
    agentRuns: "agent_runs",
    openclawDocs: "openclaw_docs",
};
function nowTs() {
    return admin.firestore.FieldValue.serverTimestamp();
}
function requireOwner(context) {
    if (!context.auth?.uid) {
        throw new functions.https.HttpsError("unauthenticated", "Sign-in required");
    }
    if (!OWNER_UID) {
        throw new functions.https.HttpsError("failed-precondition", "OWNER_UID is not configured on the server");
    }
    if (context.auth.uid !== OWNER_UID) {
        throw new functions.https.HttpsError("permission-denied", "Owner access required");
    }
    return context.auth.uid;
}
function assertOpenClawSecret(req, res) {
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
function slugify(input) {
    return input
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 64);
}
function requireString(value, field, min = 1, max = 5000) {
    if (typeof value !== "string") {
        throw new Error(`${field} must be a string`);
    }
    const normalized = value.trim();
    if (normalized.length < min || normalized.length > max) {
        throw new Error(`${field} must be ${min}-${max} chars`);
    }
    return normalized;
}
function requireDate(value, field) {
    const date = requireString(value, field, 10, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        throw new Error(`${field} must be YYYY-MM-DD`);
    }
    return date;
}
function enumOrDefault(value, allowed, fallback) {
    if (typeof value !== "string") {
        return fallback;
    }
    return allowed.includes(value) ? value : fallback;
}
function normalizeTaskStatusInput(value) {
    return value === "todo" ? "backlog" : value;
}
function assertEnum(value, allowed, field) {
    if (typeof value !== "string" || !allowed.includes(value)) {
        throw new Error(`${field} must be one of: ${allowed.join(", ")}`);
    }
    return value;
}
async function writeActivity(params) {
    await db.collection(paths.activity(params.productId)).add({
        ...params,
        createdAt: nowTs(),
    });
    await db.doc(paths.product(params.productId)).set({
        lastActivityAt: nowTs(),
        updatedAt: nowTs(),
    }, { merge: true });
}
const CONTACT_CHANGE_LABELS = {
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
function contactValueForLog(value) {
    if (value === undefined || value === null || value === "")
        return "empty";
    if (Array.isArray(value))
        return value.map((item) => String(item)).join(", ") || "empty";
    if (typeof value === "object")
        return JSON.stringify(value);
    return String(value);
}
function buildContactChanges(before, patch) {
    const changes = [];
    for (const [field, label] of Object.entries(CONTACT_CHANGE_LABELS)) {
        if (!(field in patch))
            continue;
        const previous = contactValueForLog(before[field]);
        const next = contactValueForLog(patch[field]);
        if (previous === next)
            continue;
        changes.push({ field, label, before: previous, after: next });
    }
    return changes;
}
async function writeContactActivity(params) {
    await db.collection(paths.contactActivity(params.productId, params.contactId)).add({
        ...params,
        changes: params.changes ?? [],
        createdAt: nowTs(),
    });
}
async function startAgentRun(params) {
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
async function finishAgentRun(runRef, result) {
    await runRef.set({
        status: result.status,
        outputSummary: result.outputSummary ?? "",
        errorMessage: result.errorMessage ?? "",
        completedAt: nowTs(),
    }, { merge: true });
}
async function syncTaskDocumentLinks(params) {
    const taskKey = `${params.productId}:${params.taskId}`;
    const normalized = Array.from(new Set(params.linkedDocIds
        .map((id) => String(id).trim())
        .filter(Boolean)));
    const docsCol = db.collection(paths.openclawDocs);
    const currentSnap = await docsCol.where("linkedTaskKeys", "array-contains", taskKey).get();
    const currentlyLinkedIds = new Set(currentSnap.docs.map((docSnap) => docSnap.id));
    const toRemove = currentSnap.docs.filter((docSnap) => !normalized.includes(docSnap.id));
    const toAdd = normalized.filter((docId) => !currentlyLinkedIds.has(docId));
    const batch = db.batch();
    for (const docSnap of toRemove) {
        const data = docSnap.data();
        const nextKeys = (data.linkedTaskKeys ?? []).filter((key) => key !== taskKey);
        const nextTasks = (data.linkedTasks ?? []).filter((item) => !(item.productId === params.productId && item.taskId === params.taskId));
        batch.set(docSnap.ref, {
            linkedTaskKeys: nextKeys,
            linkedTasks: nextTasks,
            updatedAt: nowTs(),
        }, { merge: true });
    }
    for (const docId of toAdd) {
        const docRef = docsCol.doc(docId);
        const docSnap = await docRef.get();
        const data = (docSnap.data() ?? {});
        const nextKeys = Array.from(new Set([...(data.linkedTaskKeys ?? []), taskKey]));
        const nextTasks = [
            ...(data.linkedTasks ?? []).filter((item) => !(item.productId === params.productId && item.taskId === params.taskId)),
            { productId: params.productId, taskId: params.taskId, title: params.taskTitle },
        ];
        batch.set(docRef, {
            id: docId,
            name: docId,
            type: "unknown",
            content: docSnap.exists ? data.content ?? "" : "",
            linkedTaskKeys: nextKeys,
            linkedTasks: nextTasks,
            updatedAt: nowTs(),
        }, { merge: true });
    }
    await batch.commit();
}
async function createTaskInternal(input) {
    const taskRef = db.collection(paths.tasks(input.productId)).doc();
    const task = {
        id: taskRef.id,
        productId: input.productId,
        title: requireString(input.title, "title", 3, 120),
        description: input.description?.trim() || "",
        type: enumOrDefault(input.type, TASK_TYPES, "other"),
        status: "backlog",
        priority: enumOrDefault(input.priority, TASK_PRIORITIES, "medium"),
        dueDate: input.dueDate ?? null,
        assignedType: input.assignedType ?? null,
        assignedId: input.assignedId ?? null,
        linkedContactIds: Array.isArray(input.linkedContactIds) ? input.linkedContactIds : [],
        linkedKpiKeys: Array.isArray(input.linkedKpiKeys) ? input.linkedKpiKeys : [],
        linkedDocIds: Array.isArray(input.linkedDocIds) ? input.linkedDocIds : [],
        checklist: (input.checklist ?? []).map((item, index) => ({
            id: `item_${index + 1}`,
            text: String(item.text ?? ""),
            done: false,
        })),
        latestCommentPreview: "",
        commentCount: 0,
        source: input.source ?? "manual",
        blockedReason: input.blockedReason?.trim() || "",
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
async function updateTaskInternal(input) {
    const taskRef = db.doc(paths.task(input.productId, input.taskId));
    const current = await taskRef.get();
    if (!current.exists) {
        throw new Error("Task not found");
    }
    const currentData = current.data() ?? {};
    const nextStatusRaw = normalizeTaskStatusInput(input.patch.status);
    const previousStatus = String(currentData.status ?? "");
    const updatePayload = {
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
    let nextStatus;
    if (typeof nextStatusRaw === "string") {
        nextStatus = assertEnum(nextStatusRaw, TASK_STATUSES, "status");
        updatePayload.status = nextStatus;
    }
    if (nextStatus === "done") {
        updatePayload.completedAt = nowTs();
    }
    else if (previousStatus === "done" && nextStatus) {
        updatePayload.completedAt = null;
    }
    await taskRef.set(updatePayload, { merge: true });
    if (Array.isArray(updatePayload.linkedDocIds)) {
        await syncTaskDocumentLinks({
            productId: input.productId,
            taskId: input.taskId,
            taskTitle: String(updatePayload.title ?? currentData.title ?? input.taskId),
            linkedDocIds: updatePayload.linkedDocIds,
        });
    }
    await writeActivity({
        productId: input.productId,
        type: nextStatus && nextStatus !== previousStatus ? "task.status_changed" : "task.updated",
        actorType: input.actorType,
        actorId: input.actorId,
        targetType: "task",
        targetId: input.taskId,
        message: nextStatus && nextStatus !== previousStatus
            ? `Task moved from ${previousStatus || "unknown"} to ${nextStatus}`
            : `Task updated: ${String(currentData.title ?? input.taskId)}`,
    });
}
async function addTaskCommentInternal(input) {
    const body = requireString(input.body, "body", 1, 3000);
    const commentsRef = db.collection(paths.taskComments(input.productId, input.taskId));
    const commentRef = commentsRef.doc();
    const taskRef = db.doc(paths.task(input.productId, input.taskId));
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
            createdAt: nowTs(),
        });
        tx.set(taskRef, {
            commentCount: currentCount + 1,
            latestCommentPreview: body.slice(0, 160),
            updatedAt: nowTs(),
        }, { merge: true });
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
exports.createProduct = eu.https.onCall(async (data, context) => {
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
    }
    catch (error) {
        throw new functions.https.HttpsError("invalid-argument", error.message);
    }
});
exports.updateProduct = eu.https.onCall(async (data, context) => {
    const ownerUid = requireOwner(context);
    const productId = requireString(data?.productId, "productId", 2, 120);
    const patch = (data?.patch ?? {});
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
exports.createContact = eu.https.onCall(async (data, context) => {
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
    }
    catch (error) {
        throw new functions.https.HttpsError("invalid-argument", error.message);
    }
});
exports.updateContact = eu.https.onCall(async (data, context) => {
    const ownerUid = requireOwner(context);
    const productId = requireString(data?.productId, "productId", 2, 120);
    const contactId = requireString(data?.contactId, "contactId", 2, 120);
    const patch = (data?.patch ?? {});
    if (typeof patch.status === "string") {
        patch.status = assertEnum(patch.status, CONTACT_STATUSES, "status");
    }
    if (typeof patch.kind === "string") {
        patch.kind = assertEnum(patch.kind, CONTACT_KINDS, "kind");
    }
    const contactRef = db.doc(paths.contact(productId, contactId));
    const beforeSnap = await contactRef.get();
    const before = (beforeSnap.data() ?? {});
    const changes = buildContactChanges(before, patch);
    await contactRef.set({ ...patch, updatedAt: nowTs() }, { merge: true });
    await writeActivity({
        productId,
        type: "contact.updated",
        actorType: "owner",
        actorId: ownerUid,
        targetType: "contact",
        targetId: contactId,
        message: `Contact updated: ${String(patch.name || before.name || contactId)}`,
    });
    const changeSummary = changes.length > 0
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
exports.deleteContact = eu.https.onCall(async (data, context) => {
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
exports.createTask = eu.https.onCall(async (data, context) => {
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
            checklist: data?.checklist,
            source: data?.source,
            blockedReason: data?.blockedReason,
        });
        return { taskId };
    }
    catch (error) {
        throw new functions.https.HttpsError("invalid-argument", error.message);
    }
});
exports.updateTask = eu.https.onCall(async (data, context) => {
    try {
        const ownerUid = requireOwner(context);
        const productId = requireString(data?.productId, "productId", 2, 120);
        const taskId = requireString(data?.taskId, "taskId", 2, 120);
        await updateTaskInternal({
            productId,
            taskId,
            patch: (data?.patch ?? {}),
            actorType: "owner",
            actorId: ownerUid,
        });
        return { ok: true };
    }
    catch (error) {
        throw new functions.https.HttpsError("invalid-argument", error.message);
    }
});
exports.deleteTask = eu.https.onCall(async (data, context) => {
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
exports.addTaskComment = eu.https.onCall(async (data, context) => {
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
        });
        return { commentId };
    }
    catch (error) {
        throw new functions.https.HttpsError("invalid-argument", error.message);
    }
});
exports.createKpi = eu.https.onCall(async (data, context) => {
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
    }
    catch (error) {
        throw new functions.https.HttpsError("invalid-argument", error.message);
    }
});
exports.addKpiEntry = eu.https.onCall(async (data, context) => {
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
    }
    catch (error) {
        throw new functions.https.HttpsError("invalid-argument", error.message);
    }
});
const openclaw = (0, express_1.default)();
openclaw.use(express_1.default.json());
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
    }
    catch (error) {
        await finishAgentRun(run, { status: "failed", errorMessage: error.message });
        res.status(400).json({ ok: false, error: error.message });
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
                latestAgentNote: activitySnap.docs.map((d) => d.data()).find((item) => item.actorType === "agent") ?? null,
            },
        });
    }
    catch (error) {
        await finishAgentRun(run, { status: "failed", errorMessage: error.message });
        res.status(400).json({ ok: false, error: error.message });
    }
});
openclaw.post("/api/openclaw/listTasks", async (req, res) => {
    const productId = String(req.body?.productId ?? "").trim();
    const agentId = String(req.body?.agentId ?? "openclaw").trim();
    const status = String(req.body?.status ?? "").trim();
    const take = Math.min(Number(req.body?.limit ?? 20), 100);
    if (!productId) {
        res.status(400).json({ ok: false, error: "productId is required" });
        return;
    }
    const run = await startAgentRun({ productId, agentId, action: "listTasks" });
    try {
        let q = db.collection(paths.tasks(productId));
        if (status) {
            q = q.where("status", "==", status);
        }
        const snap = await q.orderBy("updatedAt", "desc").limit(take).get();
        await finishAgentRun(run, { status: "success", outputSummary: `count:${snap.size}` });
        res.json({ ok: true, data: { items: snap.docs.map((d) => d.data()) } });
    }
    catch (error) {
        await finishAgentRun(run, { status: "failed", errorMessage: error.message });
        res.status(400).json({ ok: false, error: error.message });
    }
});
openclaw.post("/api/openclaw/createTask", async (req, res) => {
    let run = null;
    try {
        const productId = requireString(req.body?.productId, "productId", 2, 120);
        const agentId = requireString(req.body?.agentId, "agentId", 2, 120);
        run = await startAgentRun({ productId, agentId, action: "task.create" });
        const rawTitle = requireString(req.body?.title, "title", 3, 120);
        const prefixedTitle = rawTitle.startsWith(`[${productId}]`) ? rawTitle : `[${productId}] ${rawTitle}`;
        const taskId = await createTaskInternal({
            productId,
            actorId: agentId,
            actorType: "agent",
            title: prefixedTitle,
            description: req.body?.description,
            type: req.body?.type,
            priority: req.body?.priority,
            dueDate: req.body?.dueDate,
            assignedType: req.body?.assignedType,
            assignedId: req.body?.assignedId,
            linkedContactIds: req.body?.linkedContactIds,
            linkedKpiKeys: req.body?.linkedKpiKeys,
            linkedDocIds: req.body?.linkedDocIds,
            checklist: req.body?.checklist,
            source: "openclaw",
            blockedReason: req.body?.blockedReason,
        });
        await finishAgentRun(run, { status: "success", outputSummary: `taskId:${taskId}` });
        res.json({ ok: true, data: { taskId } });
    }
    catch (error) {
        if (run) {
            await finishAgentRun(run, { status: "failed", errorMessage: error.message });
        }
        res.status(400).json({ ok: false, error: error.message });
    }
});
openclaw.post("/api/openclaw/updateTask", async (req, res) => {
    let run = null;
    try {
        const productId = requireString(req.body?.productId, "productId", 2, 120);
        const taskId = requireString(req.body?.taskId, "taskId", 2, 120);
        const agentId = requireString(req.body?.agentId, "agentId", 2, 120);
        run = await startAgentRun({ productId, agentId, action: "task.update" });
        await updateTaskInternal({
            productId,
            taskId,
            patch: (req.body?.patch ?? {}),
            actorType: "agent",
            actorId: agentId,
        });
        await finishAgentRun(run, { status: "success", outputSummary: `taskId:${taskId}` });
        res.json({ ok: true, data: { ok: true } });
    }
    catch (error) {
        if (run) {
            await finishAgentRun(run, { status: "failed", errorMessage: error.message });
        }
        res.status(400).json({ ok: false, error: error.message });
    }
});
openclaw.post("/api/openclaw/addTaskComment", async (req, res) => {
    let run = null;
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
        });
        await finishAgentRun(run, { status: "success", outputSummary: `commentId:${commentId}` });
        res.json({ ok: true, data: { commentId } });
    }
    catch (error) {
        if (run) {
            await finishAgentRun(run, { status: "failed", errorMessage: error.message });
        }
        res.status(400).json({ ok: false, error: error.message });
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
    }
    catch (error) {
        await finishAgentRun(run, { status: "failed", errorMessage: error.message });
        res.status(400).json({ ok: false, error: error.message });
    }
});
openclaw.post("/api/openclaw/createContact", async (req, res) => {
    let run = null;
    try {
        const productId = requireString(req.body?.productId, "productId", 2, 120);
        const agentId = requireString(req.body?.agentId, "agentId", 2, 120);
        const name = requireString(req.body?.name, "name", 2, 120);
        run = await startAgentRun({ productId, agentId, action: "contact.create" });
        const ref = db.collection(paths.contacts(productId)).doc();
        await ref.set({
            id: ref.id,
            productId,
            kind: enumOrDefault(req.body?.kind, CONTACT_KINDS, "lead"),
            name,
            company: req.body?.company ?? "",
            title: req.body?.title ?? "",
            email: req.body?.email ?? "",
            phone: req.body?.phone ?? "",
            linkedin: req.body?.linkedin ?? "",
            website: req.body?.website ?? "",
            location: req.body?.location ?? "",
            status: enumOrDefault(req.body?.status, CONTACT_STATUSES, "new"),
            tags: Array.isArray(req.body?.tags) ? req.body.tags : [],
            notes: req.body?.notes ?? "",
            linkedTaskIds: Array.isArray(req.body?.linkedTaskIds) ? req.body.linkedTaskIds : [],
            createdBy: agentId,
            createdAt: nowTs(),
            updatedAt: nowTs(),
            archivedAt: null,
        });
        await writeActivity({
            productId,
            type: "contact.created",
            actorType: "agent",
            actorId: agentId,
            targetType: "contact",
            targetId: ref.id,
            message: `OpenClaw created contact: ${name}`,
        });
        await writeContactActivity({
            productId,
            contactId: ref.id,
            actorType: "agent",
            actorId: agentId,
            type: "contact.created",
            message: "Contact created",
            changes: [],
        });
        await finishAgentRun(run, { status: "success", outputSummary: `contactId:${ref.id}` });
        res.json({ ok: true, data: { contactId: ref.id } });
    }
    catch (error) {
        if (run) {
            await finishAgentRun(run, { status: "failed", errorMessage: error.message });
        }
        res.status(400).json({ ok: false, error: error.message });
    }
});
openclaw.post("/api/openclaw/updateContact", async (req, res) => {
    let run = null;
    try {
        const productId = requireString(req.body?.productId, "productId", 2, 120);
        const contactId = requireString(req.body?.contactId, "contactId", 2, 120);
        const agentId = requireString(req.body?.agentId, "agentId", 2, 120);
        const patch = (req.body?.patch ?? {});
        if (typeof patch.status === "string") {
            patch.status = assertEnum(patch.status, CONTACT_STATUSES, "status");
        }
        if (typeof patch.kind === "string") {
            patch.kind = assertEnum(patch.kind, CONTACT_KINDS, "kind");
        }
        run = await startAgentRun({ productId, agentId, action: "contact.update" });
        const contactRef = db.doc(paths.contact(productId, contactId));
        const beforeSnap = await contactRef.get();
        if (!beforeSnap.exists)
            throw new Error("Contact not found");
        const before = (beforeSnap.data() ?? {});
        const changes = buildContactChanges(before, patch);
        await contactRef.set({ ...patch, updatedAt: nowTs() }, { merge: true });
        await writeActivity({
            productId,
            type: "contact.updated",
            actorType: "agent",
            actorId: agentId,
            targetType: "contact",
            targetId: contactId,
            message: `OpenClaw updated contact: ${String(patch.name || before.name || contactId)}`,
        });
        const changeSummary = changes.length > 0
            ? changes
                .slice(0, 3)
                .map((item) => `${item.label}: ${item.before} -> ${item.after}`)
                .join(" • ")
            : "No field changes";
        await writeContactActivity({
            productId,
            contactId,
            actorType: "agent",
            actorId: agentId,
            type: "contact.updated",
            message: changeSummary,
            changes,
        });
        await finishAgentRun(run, { status: "success", outputSummary: `contactId:${contactId}` });
        res.json({ ok: true, data: { ok: true } });
    }
    catch (error) {
        if (run) {
            await finishAgentRun(run, { status: "failed", errorMessage: error.message });
        }
        res.status(400).json({ ok: false, error: error.message });
    }
});
openclaw.post("/api/openclaw/deleteContact", async (req, res) => {
    let run = null;
    try {
        const productId = requireString(req.body?.productId, "productId", 2, 120);
        const contactId = requireString(req.body?.contactId, "contactId", 2, 120);
        const agentId = requireString(req.body?.agentId, "agentId", 2, 120);
        run = await startAgentRun({ productId, agentId, action: "contact.delete" });
        const contactRef = db.doc(paths.contact(productId, contactId));
        const contactSnap = await contactRef.get();
        if (!contactSnap.exists)
            throw new Error("Contact not found");
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
            actorType: "agent",
            actorId: agentId,
            targetType: "contact",
            targetId: contactId,
            message: `OpenClaw deleted contact: ${contactName}`,
        });
        await finishAgentRun(run, { status: "success", outputSummary: `contactId:${contactId}` });
        res.json({ ok: true, data: { ok: true } });
    }
    catch (error) {
        if (run) {
            await finishAgentRun(run, { status: "failed", errorMessage: error.message });
        }
        res.status(400).json({ ok: false, error: error.message });
    }
});
openclaw.post("/api/openclaw/addKpiEntry", async (req, res) => {
    let run = null;
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
    }
    catch (error) {
        if (run) {
            await finishAgentRun(run, { status: "failed", errorMessage: error.message });
        }
        res.status(400).json({ ok: false, error: error.message });
    }
});
openclaw.post("/api/openclaw/syncSchedules", async (req, res) => {
    let run = null;
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
        const incomingIds = new Set();
        const batch = db.batch();
        for (const rawJob of jobs) {
            const jobId = requireString(rawJob?.id, "job.id", 2, 120);
            const name = requireString(rawJob?.name, "job.name", 2, 160);
            incomingIds.add(jobId);
            const weekSlots = Array.isArray(rawJob?.weekSlots)
                ? rawJob.weekSlots
                    .map((slot) => {
                    const day = Number(slot?.day);
                    const time = String(slot?.time ?? "");
                    if (!Number.isInteger(day) || day < 0 || day > 6 || !/^\d{2}:\d{2}$/.test(time)) {
                        return null;
                    }
                    return {
                        day,
                        time,
                        label: String(slot?.label ?? ""),
                    };
                })
                    .filter(Boolean)
                : [];
            batch.set(schedulesCol.doc(jobId), {
                id: jobId,
                name,
                agentId,
                enabled: rawJob?.enabled !== false,
                alwaysRunning: Boolean(rawJob?.alwaysRunning),
                color: String(rawJob?.color ?? ""),
                timezone: String(rawJob?.timezone ?? timezone),
                productId: rawJob?.productId ? String(rawJob.productId) : null,
                scheduleType: String(rawJob?.scheduleType ?? "other"),
                expression: String(rawJob?.expression ?? ""),
                tags: Array.isArray(rawJob?.tags) ? rawJob.tags.map((tag) => String(tag)) : [],
                weekSlots,
                nextRuns: Array.isArray(rawJob?.nextRuns) ? rawJob.nextRuns.map((runAt) => String(runAt)) : [],
                sourceUpdatedAt: String(rawJob?.sourceUpdatedAt ?? generatedAt),
                syncedAt: generatedAt,
                updatedAt: nowTs(),
            }, { merge: true });
        }
        for (const docSnap of existingSnap.docs) {
            if (!incomingIds.has(docSnap.id)) {
                batch.delete(docSnap.ref);
            }
        }
        batch.set(db.doc("system/openclaw_schedule_sync"), {
            agentId,
            timezone,
            generatedAt,
            lastSyncedAt: nowTs(),
            count: jobs.length,
        }, { merge: true });
        await batch.commit();
        await finishAgentRun(run, { status: "success", outputSummary: `schedules:${jobs.length}` });
        res.json({ ok: true, data: { count: jobs.length } });
    }
    catch (error) {
        if (run) {
            await finishAgentRun(run, { status: "failed", errorMessage: error.message });
        }
        res.status(400).json({ ok: false, error: error.message });
    }
});
openclaw.post("/api/openclaw/syncMemory", async (req, res) => {
    let run = null;
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
        const incomingIds = new Set();
        const batch = db.batch();
        for (const rawEntry of entries) {
            const id = requireString(rawEntry?.id, "entry.id", 2, 160);
            const title = requireString(rawEntry?.title, "entry.title", 2, 240);
            const content = requireString(rawEntry?.content, "entry.content", 1, 200000);
            incomingIds.add(id);
            batch.set(entriesCol.doc(id), {
                id,
                title,
                content,
                summary: String(rawEntry?.summary ?? ""),
                tags: Array.isArray(rawEntry?.tags) ? rawEntry.tags.map((tag) => String(tag)) : [],
                sourceFile: String(rawEntry?.sourceFile ?? ""),
                agentId,
                wordCount: Number(rawEntry?.wordCount ?? 0),
                createdAt: String(rawEntry?.createdAt ?? generatedAt),
                updatedAt: String(rawEntry?.updatedAt ?? generatedAt),
                syncedAt: generatedAt,
            }, { merge: true });
        }
        for (const docSnap of existingSnap.docs) {
            if (!incomingIds.has(docSnap.id)) {
                batch.delete(docSnap.ref);
            }
        }
        if (longTerm) {
            const title = requireString(longTerm?.title, "longTerm.title", 2, 240);
            const content = requireString(longTerm?.content, "longTerm.content", 1, 500000);
            batch.set(db.doc("openclaw_memory/long_term"), {
                id: "long_term",
                title,
                content,
                sourceFile: String(longTerm?.sourceFile ?? ""),
                wordCount: Number(longTerm?.wordCount ?? 0),
                updatedAt: String(longTerm?.updatedAt ?? generatedAt),
                syncedAt: generatedAt,
                agentId,
            }, { merge: true });
        }
        batch.set(db.doc("system/openclaw_memory_sync"), {
            agentId,
            generatedAt,
            count: entries.length,
            lastSyncedAt: nowTs(),
        }, { merge: true });
        await batch.commit();
        await finishAgentRun(run, { status: "success", outputSummary: `memory:${entries.length}` });
        res.json({ ok: true, data: { count: entries.length } });
    }
    catch (error) {
        if (run) {
            await finishAgentRun(run, { status: "failed", errorMessage: error.message });
        }
        res.status(400).json({ ok: false, error: error.message });
    }
});
openclaw.post("/api/openclaw/syncDocs", async (req, res) => {
    let run = null;
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
        const incomingIds = new Set();
        const batch = db.batch();
        for (const rawDoc of docs) {
            const id = requireString(rawDoc?.id, "doc.id", 2, 200);
            const name = requireString(rawDoc?.name, "doc.name", 1, 300);
            const type = String(rawDoc?.type ?? "unknown");
            const content = String(rawDoc?.content ?? "");
            incomingIds.add(id);
            const linkedTasks = Array.isArray(rawDoc?.linkedTasks)
                ? rawDoc.linkedTasks
                    .map((item) => {
                    const productId = String(item?.productId ?? "").trim();
                    const taskId = String(item?.taskId ?? "").trim();
                    const title = String(item?.title ?? "");
                    if (!productId || !taskId)
                        return null;
                    return { productId, taskId, title };
                })
                    .filter((item) => Boolean(item))
                : [];
            const linkedTaskKeys = linkedTasks.map((item) => `${item.productId}:${item.taskId}`);
            batch.set(docsCol.doc(id), {
                id,
                name,
                type,
                content,
                summary: String(rawDoc?.summary ?? ""),
                tags: Array.isArray(rawDoc?.tags) ? rawDoc.tags.map((tag) => String(tag)) : [],
                sourceFile: String(rawDoc?.sourceFile ?? ""),
                agentId,
                productId: rawDoc?.productId ? String(rawDoc.productId) : null,
                sizeBytes: Number(rawDoc?.sizeBytes ?? 0),
                wordCount: Number(rawDoc?.wordCount ?? 0),
                modifiedAt: String(rawDoc?.modifiedAt ?? generatedAt),
                syncedAt: generatedAt,
                linkedTaskKeys,
                linkedTasks,
                updatedAt: nowTs(),
            }, { merge: true });
        }
        for (const docSnap of existingSnap.docs) {
            if (!incomingIds.has(docSnap.id)) {
                batch.delete(docSnap.ref);
            }
        }
        batch.set(db.doc("system/openclaw_docs_sync"), {
            agentId,
            generatedAt,
            count: docs.length,
            lastSyncedAt: nowTs(),
        }, { merge: true });
        await batch.commit();
        await finishAgentRun(run, { status: "success", outputSummary: `docs:${docs.length}` });
        res.json({ ok: true, data: { count: docs.length } });
    }
    catch (error) {
        if (run) {
            await finishAgentRun(run, { status: "failed", errorMessage: error.message });
        }
        res.status(400).json({ ok: false, error: error.message });
    }
});
openclaw.post("/api/openclaw/syncTeam", async (req, res) => {
    let run = null;
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
        const incomingIds = new Set();
        const batch = db.batch();
        for (const raw of agents) {
            const id = requireString(raw?.id, "agent.id", 2, 120);
            const name = requireString(raw?.name, "agent.name", 2, 200);
            const role = requireString(raw?.role, "agent.role", 2, 200);
            const description = String(raw?.description ?? "");
            incomingIds.add(id);
            batch.set(col.doc(id), {
                id,
                name,
                role,
                description,
                parentId: raw?.parentId ? String(raw.parentId) : null,
                machine: String(raw?.machine ?? ""),
                status: String(raw?.status ?? "active"),
                tags: Array.isArray(raw?.tags) ? raw.tags.map((tag) => String(tag)) : [],
                avatar: String(raw?.avatar ?? ""),
                order: Number(raw?.order ?? 0),
                syncSource: sourceId,
                syncedAt: generatedAt,
                updatedAt: nowTs(),
            }, { merge: true });
        }
        for (const docSnap of existingSnap.docs) {
            if (!incomingIds.has(docSnap.id)) {
                batch.delete(docSnap.ref);
            }
        }
        batch.set(db.doc("system/openclaw_team_sync"), {
            sourceId,
            generatedAt,
            count: agents.length,
            lastSyncedAt: nowTs(),
        }, { merge: true });
        await batch.commit();
        await finishAgentRun(run, { status: "success", outputSummary: `team:${agents.length}` });
        res.json({ ok: true, data: { count: agents.length } });
    }
    catch (error) {
        if (run) {
            await finishAgentRun(run, { status: "failed", errorMessage: error.message });
        }
        res.status(400).json({ ok: false, error: error.message });
    }
});
openclaw.post("/api/openclaw/addActivityNote", async (req, res) => {
    let run = null;
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
    }
    catch (error) {
        if (run) {
            await finishAgentRun(run, { status: "failed", errorMessage: error.message });
        }
        res.status(400).json({ ok: false, error: error.message });
    }
});
exports.api = eu.https.onRequest(openclaw);
