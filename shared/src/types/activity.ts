export type ActivityType =
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

export interface ActivityItem {
  id: string;
  productId: string;
  type: ActivityType;
  actorType: "owner" | "agent" | "system";
  actorId: string;
  targetType: "product" | "contact" | "task" | "kpi";
  targetId: string;
  message: string;
  createdAt: string;
}
