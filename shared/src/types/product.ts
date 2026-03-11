export type ProductStatus = "active" | "paused" | "archived";

export interface Product {
  id: string;
  name: string;
  slug: string;
  description?: string;
  status: ProductStatus;
  order: number;
  color?: string;
  icon?: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
  lastActivityAt?: string;
}
