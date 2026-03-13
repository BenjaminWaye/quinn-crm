import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { createTask, listTasks, updateTaskStatus, type TaskAttachmentUpload, type TaskRecord } from "../lib/data";
import { attachmentIconLabel, fileToTaskAttachmentUpload, formatBytes } from "../lib/taskAttachments";
import { formatDateTime } from "../lib/time";

const STATUSES = ["backlog", "in_progress", "blocked", "review", "done"];
const TASK_TYPES = ["dev", "outreach", "content", "seo", "design", "research", "admin", "bug", "other"];
const TASK_PRIORITIES = ["low", "medium", "high", "urgent"];
const TASK_SEEN_COMMENTS_KEY = "task_seen_comments_v1";

function readSeenCommentCounts(): Record<string, number> {
  try {
    const raw = window.localStorage.getItem(TASK_SEEN_COMMENTS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed).map(([key, value]) => [key, Number(value ?? 0)]),
    );
  } catch {
    return {};
  }
}

function taskSeenKey(productId: string, taskId: string): string {
  return `${productId}:${taskId}`;
}

export function ProductTasksPage() {
  const { productId = "" } = useParams();
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [seenCommentCounts, setSeenCommentCounts] = useState<Record<string, number>>({});
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState("other");
  const [priority, setPriority] = useState("medium");
  const [dueDate, setDueDate] = useState("");
  const [assignedType, setAssignedType] = useState<"human" | "agent" | "">("");
  const [assignedId, setAssignedId] = useState("");
  const [linkedContactIdsText, setLinkedContactIdsText] = useState("");
  const [linkedKpiKeysText, setLinkedKpiKeysText] = useState("");
  const [linkedDocIdsText, setLinkedDocIdsText] = useState("");
  const [source, setSource] = useState<"manual" | "automation">("manual");
  const [blockedReason, setBlockedReason] = useState("");
  const [checklistText, setChecklistText] = useState("");
  const [taskAttachments, setTaskAttachments] = useState<TaskAttachmentUpload[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [view, setView] = useState<"list" | "board">("list");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    if (!productId) return;
    setTasks(await listTasks(productId));
  };

  useEffect(() => { void load(); }, [productId]);
  useEffect(() => {
    setSeenCommentCounts(readSeenCommentCounts());
  }, [productId]);

  const onCreate = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!title.trim() || !productId || busy) return;
    const now = new Date().toISOString();
    const optimisticId = `tmp_${crypto.randomUUID()}`;
    const optimisticTask: TaskRecord = {
      id: optimisticId,
      productId,
      title: title.trim(),
      description: description.trim(),
      type,
      status: "backlog",
      priority,
      dueDate: dueDate || null,
      assignedType: assignedType || null,
      assignedId: assignedId.trim() || null,
      linkedContactIds: linkedContactIdsText
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
      linkedKpiKeys: linkedKpiKeysText
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
      linkedDocIds: linkedDocIdsText
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
      checklist: checklistText
        .split("\n")
        .map((item) => item.trim())
        .filter(Boolean)
        .map((text, index) => ({ id: `tmp_cl_${index + 1}`, text, done: false })),
      latestCommentPreview: "",
      commentCount: 0,
      source,
      blockedReason: blockedReason.trim(),
      attachments: taskAttachments.map((attachment, index) => ({
        id: `tmp_${index}_${attachment.name}`,
        name: attachment.name,
        contentType: attachment.contentType,
        sizeBytes: attachment.sizeBytes,
        storagePath: "pending/local",
        downloadUrl: attachment.dataUrl,
      })),
      createdAt: now,
      updatedAt: now,
    };
    try {
      setBusy(true);
      setError("");
      setTasks((current) => [optimisticTask, ...current]);
      const result = await createTask({
        productId,
        title: title.trim(),
        description: description.trim(),
        type,
        priority,
        dueDate: dueDate || null,
        assignedType: assignedType || null,
        assignedId: assignedId.trim() || null,
        linkedContactIds: linkedContactIdsText
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
        linkedKpiKeys: linkedKpiKeysText
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
        linkedDocIds: linkedDocIdsText
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
        checklist: checklistText
          .split("\n")
          .map((item) => item.trim())
          .filter(Boolean)
          .map((text) => ({ text })),
        source,
        blockedReason: blockedReason.trim(),
        attachments: taskAttachments,
      });
      const createdTaskId = result.data.taskId;
      setTasks((current) =>
        current.map((task) =>
          task.id === optimisticId
            ? {
                ...task,
                id: createdTaskId,
              }
            : task,
        ),
      );
      setTitle("");
      setDescription("");
      setType("other");
      setPriority("medium");
      setDueDate("");
      setAssignedType("");
      setAssignedId("");
      setLinkedContactIdsText("");
      setLinkedKpiKeysText("");
      setLinkedDocIdsText("");
      setSource("manual");
      setBlockedReason("");
      setChecklistText("");
      setTaskAttachments([]);
      setShowCreateForm(false);
      void load();
    } catch (nextError) {
      const message = (nextError as Error)?.message || "Failed to create task";
      setError(message);
      console.error("Failed to create task", nextError);
      setTasks((current) => current.filter((task) => task.id !== optimisticId));
    } finally {
      setBusy(false);
    }
  };


  const onPickTaskAttachments = async (files: FileList | null) => {
    if (!files) return;
    const selected = Array.from(files).slice(0, 10 - taskAttachments.length);
    const uploads = await Promise.all(selected.map((file) => fileToTaskAttachmentUpload(file)));
    setTaskAttachments((current) => [...current, ...uploads].slice(0, 10));
  };

  const onStatus = async (taskId: string, status: string) => {
    if (!productId) return;
    const previous = tasks.find((task) => task.id === taskId)?.status ?? "";
    setTasks((current) => current.map((task) => (task.id === taskId ? { ...task, status, updatedAt: new Date().toISOString() } : task)));
    try {
      await updateTaskStatus({ productId, taskId, status });
      void load();
    } catch (error) {
      console.error("Failed to update task status", error);
      setTasks((current) => current.map((task) => (task.id === taskId ? { ...task, status: previous || task.status } : task)));
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 lg:p-6 border-b border-neutral-200 bg-white shrink-0 space-y-3">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Tasks</h1>
          <div className="flex gap-2">
            <button
              className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm"
              onClick={() => setShowCreateForm((current) => !current)}
            >
              {showCreateForm ? "Close new task" : "New task"}
            </button>
            <div className="hidden lg:flex gap-2">
              <button className={`px-3 py-1.5 rounded-lg border ${view === "list" ? "bg-neutral-100" : ""}`} onClick={() => setView("list")}>List</button>
              <button className={`px-3 py-1.5 rounded-lg border ${view === "board" ? "bg-neutral-100" : ""}`} onClick={() => setView("board")}>Board</button>
            </div>
          </div>
        </div>
        {showCreateForm && (
          <form className="space-y-2" onSubmit={(event) => void onCreate(event)}>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              <input className="border border-neutral-300 rounded-lg px-3 py-2" placeholder="Task title" value={title} onChange={(e) => setTitle(e.target.value)} />
              <select className="border border-neutral-300 rounded-lg px-3 py-2" value={type} onChange={(e) => setType(e.target.value)}>
                {TASK_TYPES.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
              <select className="border border-neutral-300 rounded-lg px-3 py-2" value={priority} onChange={(e) => setPriority(e.target.value)}>
                {TASK_PRIORITIES.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
              <input className="border border-neutral-300 rounded-lg px-3 py-2" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              <select className="border border-neutral-300 rounded-lg px-3 py-2" value={assignedType} onChange={(e) => setAssignedType(e.target.value as "human" | "agent" | "")}>
                <option value="">unassigned</option><option value="human">human</option><option value="agent">agent</option>
              </select>
              <input className="border border-neutral-300 rounded-lg px-3 py-2" placeholder="Assigned ID" value={assignedId} onChange={(e) => setAssignedId(e.target.value)} />
            </div>
            <textarea className="w-full border border-neutral-300 rounded-lg px-3 py-2 min-h-[80px]" placeholder="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <input className="border border-neutral-300 rounded-lg px-3 py-2" placeholder="Linked contact IDs (comma separated)" value={linkedContactIdsText} onChange={(e) => setLinkedContactIdsText(e.target.value)} />
              <input className="border border-neutral-300 rounded-lg px-3 py-2" placeholder="Linked KPI keys (comma separated)" value={linkedKpiKeysText} onChange={(e) => setLinkedKpiKeysText(e.target.value)} />
              <input className="border border-neutral-300 rounded-lg px-3 py-2 md:col-span-2" placeholder="Linked doc IDs (comma separated)" value={linkedDocIdsText} onChange={(e) => setLinkedDocIdsText(e.target.value)} />
              <select className="border border-neutral-300 rounded-lg px-3 py-2" value={source} onChange={(e) => setSource(e.target.value as "manual" | "automation")}>
                <option value="manual">manual</option><option value="automation">automation</option>
              </select>
              <input className="border border-neutral-300 rounded-lg px-3 py-2" placeholder="Blocked reason (optional)" value={blockedReason} onChange={(e) => setBlockedReason(e.target.value)} />
            </div>
            <textarea className="w-full border border-neutral-300 rounded-lg px-3 py-2 min-h-[80px]" placeholder="Checklist items (one per line)" value={checklistText} onChange={(e) => setChecklistText(e.target.value)} />
            <div className="space-y-2">
              <label className="text-xs text-neutral-600">Task attachments (max 10 files, 8MB each)</label>
              <input type="file" multiple onChange={(e) => void onPickTaskAttachments(e.target.files)} className="block w-full text-sm" />
              {taskAttachments.length > 0 && (
                <div className="space-y-1">
                  {taskAttachments.map((attachment, index) => (
                    <div key={`${attachment.name}-${index}`} className="flex items-center justify-between text-xs border border-neutral-200 rounded px-2 py-1">
                      <span>{attachmentIconLabel(attachment.contentType)} {attachment.name} • {formatBytes(attachment.sizeBytes)}</span>
                      <button type="button" className="text-red-600" onClick={() => setTaskAttachments((current) => current.filter((_, i) => i !== index))}>Remove</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-60" disabled={busy || !title.trim()}>
              {busy ? "Adding..." : "Add"}
            </button>
          </form>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>

      <div className="flex-1 overflow-y-auto p-4 lg:p-6 pb-20 lg:pb-6">
        {view === "board" && window.innerWidth >= 1024 ? (
          <div className="flex gap-4 overflow-x-auto pb-4">
            {STATUSES.map((status) => (
              <div key={status} className="w-80 shrink-0">
                <div className="bg-neutral-100 rounded-lg p-3 mb-3 font-medium text-sm uppercase">{status.replace("_", " ")}</div>
                <div className="space-y-3">
                  {tasks.filter((t) => t.status === status).map((task) => (
                    (() => {
                      const totalComments = Number(task.commentCount ?? 0);
                      const seenCount = seenCommentCounts[taskSeenKey(productId, task.id)] ?? 0;
                      const newComments = Math.max(0, totalComments - seenCount);
                      const assignedLabel =
                        task.assignedId?.trim() ||
                        (task.assignedType === "agent"
                          ? "Agent"
                          : task.assignedType === "human"
                            ? "Human"
                            : "-");
                      return (
                        <Link key={task.id} to={`/products/${productId}/tasks/${task.id}`} className="block bg-white border border-neutral-200 rounded-lg p-4 hover:shadow-sm space-y-2">
                          <h4 className="font-medium">{task.title}</h4>
                          <p className="text-xs text-neutral-600 line-clamp-2">{task.description?.trim() || "No description"}</p>
                          <div className="flex flex-wrap gap-1.5">
                            <span className="text-xs px-2 py-0.5 rounded bg-neutral-100 capitalize">{task.priority}</span>
                            <span className="text-xs px-2 py-0.5 rounded bg-neutral-100">{assignedLabel}</span>
                            <span className="text-xs px-2 py-0.5 rounded bg-neutral-100">{totalComments} comments</span>
                            {newComments > 0 && <span className="text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-700">+{newComments} new</span>}
                          </div>
                          <p className="text-[11px] text-neutral-500">Created {formatDateTime(task.createdAt)}</p>
                        </Link>
                      );
                    })()
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white border border-neutral-200 rounded-lg overflow-x-auto">
            <table className="min-w-[1050px] w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-left">
                  <th className="px-3 py-2 font-semibold">Task</th>
                  <th className="px-3 py-2 font-semibold">Status</th>
                  <th className="px-3 py-2 font-semibold">Priority</th>
                  <th className="px-3 py-2 font-semibold">Assigned</th>
                  <th className="px-3 py-2 font-semibold">Comments</th>
                  <th className="px-3 py-2 font-semibold">Created</th>
                  <th className="px-3 py-2 font-semibold">Updated</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((task) => {
                  const totalComments = Number(task.commentCount ?? 0);
                  const seenCount = seenCommentCounts[taskSeenKey(productId, task.id)] ?? 0;
                  const newComments = Math.max(0, totalComments - seenCount);
                  const assignedLabel =
                    task.assignedId?.trim() ||
                    (task.assignedType === "agent"
                      ? "Agent"
                      : task.assignedType === "human"
                        ? "Human"
                        : "-");
                  return (
                    <tr key={task.id} className="border-b border-neutral-100 align-top">
                      <td className="px-3 py-3 max-w-[420px]">
                        <Link to={`/products/${productId}/tasks/${task.id}`} className="font-semibold hover:underline">
                          {task.title}
                        </Link>
                        <p className="text-xs text-neutral-600 mt-1 line-clamp-2">{task.description?.trim() || "No description"}</p>
                      </td>
                      <td className="px-3 py-3">
                        <select className="border border-neutral-300 rounded px-2 py-1 text-sm" value={task.status} onChange={(e) => void onStatus(task.id, e.target.value)}>
                          {STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-3">
                        <span className="text-xs px-2 py-1 rounded bg-neutral-100 capitalize">{task.priority}</span>
                      </td>
                      <td className="px-3 py-3 text-xs">{assignedLabel}</td>
                      <td className="px-3 py-3 text-xs">
                        <span>{totalComments}</span>
                        {newComments > 0 && <span className="ml-2 inline-flex px-2 py-0.5 rounded bg-blue-100 text-blue-700">+{newComments} new</span>}
                      </td>
                      <td className="px-3 py-3 text-xs">{formatDateTime(task.createdAt)}</td>
                      <td className="px-3 py-3 text-xs">{formatDateTime(task.updatedAt)}</td>
                    </tr>
                  );
                })}
                {tasks.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-3 py-6 text-center text-neutral-500">
                      No tasks yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
