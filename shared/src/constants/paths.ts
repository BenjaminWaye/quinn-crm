export const paths = {
  user: (userId: string) => `users/${userId}`,
  product: (productId: string) => `products/${productId}`,
  contacts: (productId: string) => `products/${productId}/contacts`,
  contact: (productId: string, contactId: string) =>
    `products/${productId}/contacts/${contactId}`,
  tasks: (productId: string) => `products/${productId}/tasks`,
  task: (productId: string, taskId: string) => `products/${productId}/tasks/${taskId}`,
  taskComments: (productId: string, taskId: string) =>
    `products/${productId}/tasks/${taskId}/comments`,
  taskComment: (productId: string, taskId: string, commentId: string) =>
    `products/${productId}/tasks/${taskId}/comments/${commentId}`,
  kpis: (productId: string) => `products/${productId}/kpis`,
  kpi: (productId: string, kpiKey: string) => `products/${productId}/kpis/${kpiKey}`,
  kpiEntries: (productId: string, kpiKey: string) =>
    `products/${productId}/kpis/${kpiKey}/entries`,
  activity: (productId: string) => `products/${productId}/activity`,
  productSettings: (productId: string) => `products/${productId}/settings/config`,
  agentRun: (runId: string) => `agent_runs/${runId}`,
};
