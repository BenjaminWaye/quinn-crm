export type TaskType =
  | "dev"
  | "outreach"
  | "content"
  | "seo"
  | "design"
  | "research"
  | "admin"
  | "bug"
  | "other";

export type TaskStatus =
  | "backlog"
  | "in_progress"
  | "blocked"
  | "review"
  | "done";

export type TaskPriority = "low" | "medium" | "high" | "urgent";

export interface TaskChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export interface Task {
  id: string;
  productId: string;
  title: string;
  description?: string;
  type: TaskType;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate?: string | null;
  assignedType?: "human" | "agent" | null;
  assignedId?: string | null;
  linkedContactIds: string[];
  linkedKpiKeys: string[];
  checklist: TaskChecklistItem[];
  latestCommentPreview?: string;
  commentCount: number;
  source: "manual" | "openclaw" | "automation";
  blockedReason?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string | null;
}
