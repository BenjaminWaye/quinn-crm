export type AgentRunAction =
  | "task.create"
  | "task.update"
  | "task.comment"
  | "summary.write"
  | "crm.note";

export interface AgentRun {
  id: string;
  productId: string;
  agentId: string;
  action: AgentRunAction;
  status: "started" | "success" | "failed";
  inputSummary?: string;
  outputSummary?: string;
  errorMessage?: string;
  createdAt: string;
  completedAt?: string;
}
