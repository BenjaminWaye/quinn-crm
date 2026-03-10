export type ContactKind =
  | "lead"
  | "customer"
  | "partner"
  | "investor"
  | "vendor"
  | "other";

export type ContactStatus =
  | "new"
  | "contacted"
  | "interested"
  | "follow_up"
  | "customer"
  | "inactive";

export interface Contact {
  id: string;
  productId: string;
  kind: ContactKind;
  name: string;
  company?: string;
  title?: string;
  email?: string;
  phone?: string;
  website?: string;
  location?: string;
  status: ContactStatus;
  tags: string[];
  notes?: string;
  linkedTaskIds: string[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string | null;
}
