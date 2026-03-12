import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { addTaskComment, deleteTask, getTask, listTaskComments, updateTask, type TaskCommentRecord, type TaskRecord } from "../lib/data";
import { formatDateTime } from "../lib/time";

const TASK_TYPES = ["dev", "outreach", "content", "seo", "design", "research", "admin", "bug", "other"];
const TASK_PRIORITIES = ["low", "medium", "high", "urgent"];
const TASK_SEEN_COMMENTS_KEY = "task_seen_comments_v1";

function setSeenCommentCount(productId: string, taskId: string, count: number) {
  try {
    const raw = window.localStorage.getItem(TASK_SEEN_COMMENTS_KEY);
    const current = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    current[`${productId}:${taskId}`] = Number(count ?? 0);
    window.localStorage.setItem(TASK_SEEN_COMMENTS_KEY, JSON.stringify(current));
  } catch {
    // no-op
  }
}

export function ProductTaskPage() {
  const { productId = "", taskId = "" } = useParams();
  const navigate = useNavigate();
  const [task, setTask] = useState<TaskRecord | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState("other");
  const [status, setStatus] = useState("backlog");
  const [priority, setPriority] = useState("medium");
  const [dueDate, setDueDate] = useState("");
  const [assignedType, setAssignedType] = useState<"human" | "agent" | "">("");
  const [assignedId, setAssignedId] = useState("");
  const [linkedContactIdsText, setLinkedContactIdsText] = useState("");
  const [linkedKpiKeysText, setLinkedKpiKeysText] = useState("");
  const [linkedDocIdsText, setLinkedDocIdsText] = useState("");
  const [blockedReason, setBlockedReason] = useState("");
  const [checklistText, setChecklistText] = useState("");
  const [initialSnapshot, setInitialSnapshot] = useState("");
  const [comments, setComments] = useState<TaskCommentRecord[]>([]);
  const [savingTask, setSavingTask] = useState(false);
  const [deletingTask, setDeletingTask] = useState(false);
  const [taskError, setTaskError] = useState("");
  const [body, setBody] = useState("");
  const [savingComment, setSavingComment] = useState(false);
  const [commentError, setCommentError] = useState("");
  const [shareMessage, setShareMessage] = useState("");

  const buildPatch = () => ({
    title: title.trim(),
    description: description.trim(),
    type,
    status,
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
      .map((row) => row.trim())
      .filter(Boolean)
      .map((row, index) => ({
        id: `cl_${index + 1}`,
        text: row.replace(/^\[(x| )\]\s*/i, "").trim(),
        done: /^\[x\]\s*/i.test(row),
      })),
    blockedReason: blockedReason.trim(),
  });

  const load = async () => {
    if (!productId || !taskId) return;
    const [nextTask, nextComments] = await Promise.all([getTask(productId, taskId), listTaskComments(productId, taskId)]);
    setTask(nextTask);
    setTitle(nextTask?.title ?? "");
    setDescription(nextTask?.description ?? "");
    setType(nextTask?.type ?? "other");
    setStatus(nextTask?.status === "todo" ? "backlog" : (nextTask?.status ?? "backlog"));
    setPriority(nextTask?.priority ?? "medium");
    setDueDate(typeof nextTask?.dueDate === "string" ? nextTask.dueDate : "");
    setAssignedType((nextTask?.assignedType as "human" | "agent" | undefined) ?? "");
    setAssignedId(nextTask?.assignedId ?? "");
    setLinkedContactIdsText((nextTask?.linkedContactIds ?? []).join(", "));
    setLinkedKpiKeysText((nextTask?.linkedKpiKeys ?? []).join(", "));
    setLinkedDocIdsText((nextTask?.linkedDocIds ?? []).join(", "));
    setBlockedReason(nextTask?.blockedReason ?? "");
    setChecklistText((nextTask?.checklist ?? []).map((item) => (item.done ? `[x] ${item.text}` : `[ ] ${item.text}`)).join("\n"));
    setComments(nextComments);
    if (nextTask) {
      setSeenCommentCount(productId, taskId, Number(nextTask.commentCount ?? 0));
    }
    if (nextTask) {
      const snapshot = {
        title: (nextTask.title ?? "").trim(),
        description: (nextTask.description ?? "").trim(),
        type: nextTask.type ?? "other",
        status: nextTask.status === "todo" ? "backlog" : (nextTask.status ?? "backlog"),
        priority: nextTask.priority ?? "medium",
        dueDate: typeof nextTask.dueDate === "string" ? nextTask.dueDate : null,
        assignedType: nextTask.assignedType ?? null,
        assignedId: nextTask.assignedId ?? null,
        linkedContactIds: nextTask.linkedContactIds ?? [],
        linkedKpiKeys: nextTask.linkedKpiKeys ?? [],
        linkedDocIds: nextTask.linkedDocIds ?? [],
        checklist: (nextTask.checklist ?? []).map((item, index) => ({
          id: `cl_${index + 1}`,
          text: String(item.text ?? ""),
          done: Boolean(item.done),
        })),
        blockedReason: (nextTask.blockedReason ?? "").trim(),
      };
      setInitialSnapshot(JSON.stringify(snapshot));
    }
  };

  useEffect(() => { void load(); }, [productId, taskId]);

  const hasChanges = useMemo(() => {
    if (!initialSnapshot) return false;
    return JSON.stringify(buildPatch()) !== initialSnapshot;
  }, [
    assignedId,
    assignedType,
    blockedReason,
    checklistText,
    description,
    dueDate,
    initialSnapshot,
    linkedContactIdsText,
    linkedDocIdsText,
    linkedKpiKeysText,
    priority,
    status,
    title,
    type,
  ]);

  const onComment = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!productId || !taskId || !body.trim() || savingComment) return;
    const trimmedBody = body.trim();
    const optimisticComment: TaskCommentRecord = {
      id: `tmp_${crypto.randomUUID()}`,
      body: trimmedBody,
      authorType: "owner",
      authorId: "you",
      createdAt: new Date().toISOString(),
    };
    try {
      setSavingComment(true);
      setCommentError("");
      setComments((current) => [optimisticComment, ...current]);
      setTask((current) =>
        current
          ? {
              ...current,
              latestCommentPreview: trimmedBody.slice(0, 160),
              commentCount: Number(current.commentCount ?? 0) + 1,
              updatedAt: new Date().toISOString(),
            }
          : current,
      );
      setBody("");
      await addTaskComment({ productId, taskId, body: trimmedBody });
      const shouldMoveToInProgress = window.confirm(
        "Move this task back to in_progress and assign it to agent?",
      );
      if (shouldMoveToInProgress) {
        setStatus("in_progress");
        setAssignedType("agent");
        setTask((current) =>
          current
            ? {
                ...current,
                status: "in_progress",
                assignedType: "agent",
                updatedAt: new Date().toISOString(),
              }
            : current,
        );
        await updateTask({
          productId,
          taskId,
          patch: {
            status: "in_progress",
            assignedType: "agent",
          },
        });
      }
      void load();
    } catch (nextError) {
      setCommentError((nextError as Error)?.message || "Failed to save comment");
      console.error("Failed to save comment", nextError);
      void load();
    } finally {
      setSavingComment(false);
    }
  };

  const onSaveTask = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!productId || !taskId || !title.trim() || savingTask || !hasChanges) return;
    const patch = buildPatch();
    setTask((current) =>
      current
        ? {
            ...current,
            ...patch,
            updatedAt: new Date().toISOString(),
          }
        : current,
    );
    setInitialSnapshot(JSON.stringify(patch));
    try {
      setSavingTask(true);
      setTaskError("");
      await updateTask({
        productId,
        taskId,
        patch,
      });
      void load();
    } catch (nextError) {
      setTaskError((nextError as Error)?.message || "Failed to save task");
      console.error("Failed to save task", nextError);
      void load();
    } finally {
      setSavingTask(false);
    }
  };

  const onDeleteTask = async () => {
    if (!productId || !taskId || deletingTask) return;
    if (!window.confirm("Delete this task permanently?")) return;
    try {
      setDeletingTask(true);
      setTaskError("");
      await deleteTask({ productId, taskId });
      navigate(`/products/${productId}/tasks`);
    } catch (nextError) {
      setTaskError((nextError as Error)?.message || "Failed to delete task");
      console.error("Failed to delete task", nextError);
    } finally {
      setDeletingTask(false);
    }
  };

  const taskSharePayload = useMemo(
    () =>
      JSON.stringify(
        {
          endpoint: "/api/openclaw/getTask",
          method: "POST",
          headers: {
            "x-openclaw-key": "<secret>",
            "content-type": "application/json",
          },
          body: {
            productId,
            taskId,
            agentId: "quinn-main",
            includeComments: true,
            commentLimit: 20,
          },
        },
        null,
        2,
      ),
    [productId, taskId],
  );

  const clearShareMessageSoon = () => {
    window.setTimeout(() => setShareMessage(""), 2500);
  };

  const onCopyTaskId = async () => {
    try {
      await navigator.clipboard.writeText(taskId);
      setShareMessage("Task ID copied");
      clearShareMessageSoon();
    } catch (error) {
      console.error("Failed to copy task id", error);
      setShareMessage("Could not copy task ID");
      clearShareMessageSoon();
    }
  };

  const onShareWithOpenClaw = async () => {
    const shareText = `Task reference\nproductId=${productId}\ntaskId=${taskId}\n\n${taskSharePayload}`;
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({
          title: `Task ${taskId}`,
          text: shareText,
        });
        setShareMessage("Shared with OpenClaw reference");
      } else {
        await navigator.clipboard.writeText(shareText);
        setShareMessage("OpenClaw task payload copied");
      }
      clearShareMessageSoon();
    } catch (error) {
      console.error("Failed to share task", error);
      setShareMessage("Could not share task reference");
      clearShareMessageSoon();
    }
  };

  if (!task) return <div className="p-6">Task not found.</div>;

  return (
    <div className="p-4 lg:p-8 max-w-4xl mx-auto space-y-4">
      <form className="bg-white border border-neutral-200 rounded-lg p-4 space-y-3" onSubmit={(event) => void onSaveTask(event)}>
        <h1 className="text-2xl font-bold">Task details</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <input className="border border-neutral-300 rounded-lg px-3 py-2" placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <input className="border border-neutral-300 rounded-lg px-3 py-2" placeholder="Due date" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          <select className="border border-neutral-300 rounded-lg px-3 py-2" value={type} onChange={(e) => setType(e.target.value)}>
            {TASK_TYPES.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <select className="border border-neutral-300 rounded-lg px-3 py-2" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="backlog">backlog</option><option value="in_progress">in_progress</option><option value="blocked">blocked</option><option value="review">review</option><option value="done">done</option>
          </select>
          <select className="border border-neutral-300 rounded-lg px-3 py-2" value={priority} onChange={(e) => setPriority(e.target.value)}>
            {TASK_PRIORITIES.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <select className="border border-neutral-300 rounded-lg px-3 py-2" value={assignedType} onChange={(e) => setAssignedType(e.target.value as "human" | "agent" | "")}>
            <option value="">unassigned</option><option value="human">human</option><option value="agent">agent</option>
          </select>
          <input className="border border-neutral-300 rounded-lg px-3 py-2" placeholder="Assigned ID" value={assignedId} onChange={(e) => setAssignedId(e.target.value)} />
          <input className="border border-neutral-300 rounded-lg px-3 py-2" placeholder="Blocked reason" value={blockedReason} onChange={(e) => setBlockedReason(e.target.value)} />
        </div>
        <textarea className="w-full border border-neutral-300 rounded-lg px-3 py-2 min-h-[100px]" placeholder="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <input className="border border-neutral-300 rounded-lg px-3 py-2" placeholder="Linked contact IDs (comma separated)" value={linkedContactIdsText} onChange={(e) => setLinkedContactIdsText(e.target.value)} />
          <input className="border border-neutral-300 rounded-lg px-3 py-2" placeholder="Linked KPI keys (comma separated)" value={linkedKpiKeysText} onChange={(e) => setLinkedKpiKeysText(e.target.value)} />
          <input className="border border-neutral-300 rounded-lg px-3 py-2 md:col-span-2" placeholder="Linked doc IDs (comma separated)" value={linkedDocIdsText} onChange={(e) => setLinkedDocIdsText(e.target.value)} />
        </div>
        <textarea className="w-full border border-neutral-300 rounded-lg px-3 py-2 min-h-[100px]" placeholder="Checklist rows, one per line. Prefix with [x] for done." value={checklistText} onChange={(e) => setChecklistText(e.target.value)} />
        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-60" disabled={savingTask || deletingTask || !title.trim() || !hasChanges}>
            {savingTask ? "Saving..." : "Save task"}
          </button>
          <button type="button" onClick={() => void onDeleteTask()} className="px-4 py-2 bg-red-600 text-white rounded-lg disabled:opacity-60" disabled={deletingTask || savingTask}>
            {deletingTask ? "Deleting..." : "Delete task"}
          </button>
        </div>
        {taskError && <p className="text-sm text-red-600">{taskError}</p>}
      </form>

      <div className="bg-white border border-neutral-200 rounded-lg p-4 space-y-2">
        <h3 className="font-semibold">Task metadata</h3>
        <div className="flex flex-wrap items-center gap-2 pb-2">
          <button type="button" className="px-3 py-1.5 border border-neutral-300 rounded-lg text-sm" onClick={() => void onCopyTaskId()}>
            Copy Task ID
          </button>
          <button
            type="button"
            className="px-3 py-1.5 bg-neutral-900 text-white rounded-lg text-sm"
            onClick={() => void onShareWithOpenClaw()}
          >
            Share with OpenClaw
          </button>
          {shareMessage ? <span className="text-xs text-neutral-600">{shareMessage}</span> : null}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-neutral-700">
          <p>taskId: {task.id ?? taskId}</p>
          <p>productId: {productId}</p>
          <p>source: {task.source ?? "-"}</p>
          <p>commentCount: {task.commentCount ?? 0}</p>
          <p>latestCommentPreview: {task.latestCommentPreview || "-"}</p>
          <p>linkedDocIds: {(task.linkedDocIds ?? []).join(", ") || "-"}</p>
          <p>createdBy: {task.createdBy ?? "-"}</p>
          <p>createdAt: {formatDateTime(task.createdAt)}</p>
          <p>updatedAt: {formatDateTime(task.updatedAt)}</p>
          <p>completedAt: {formatDateTime(task.completedAt)}</p>
        </div>
      </div>

      <div className="bg-white border border-neutral-200 rounded-lg p-4 space-y-3">
        <h3 className="font-semibold">Add comment</h3>
        <form className="space-y-3" onSubmit={(event) => void onComment(event)}>
          <textarea className="w-full border border-neutral-300 rounded-lg px-3 py-2 min-h-[100px]" value={body} onChange={(e) => setBody(e.target.value)} />
          <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-60" disabled={savingComment || !body.trim()}>
            {savingComment ? "Saving..." : "Save comment"}
          </button>
        </form>
        {commentError && <p className="text-sm text-red-600">{commentError}</p>}
      </div>

      <div className="bg-white border border-neutral-200 rounded-lg">
        <div className="p-4 border-b border-neutral-100 font-semibold">Comments</div>
        {comments.map((comment) => (
          <div key={comment.id} className="p-4 border-t border-neutral-100">
            <p className="text-xs text-neutral-500 mb-1">
              {comment.authorType} • {formatDateTime(comment.createdAt)}
            </p>
            <p>{comment.body}</p>
          </div>
        ))}
        {comments.length === 0 ? <p className="p-4 text-neutral-500">No comments yet.</p> : null}
      </div>
    </div>
  );
}
