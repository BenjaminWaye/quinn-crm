export type KpiUnit = "number" | "percent" | "currency" | "text";
export type KpiTargetDirection = "up" | "down" | "flat";

export interface KpiDefinition {
  key: string;
  productId: string;
  name: string;
  description?: string;
  unit: KpiUnit;
  targetDirection: KpiTargetDirection;
  targetValue?: number | null;
  active: boolean;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface KpiEntry {
  id: string;
  productId: string;
  kpiKey: string;
  value: number;
  date: string;
  source: "manual" | "import" | "automation";
  note?: string;
  createdAt: string;
}
