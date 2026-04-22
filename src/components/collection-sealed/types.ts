import type { ReactNode } from "react";
import type { CollectionSealedViewItem } from "@/types/collection-view";

export type { CollectionSealedViewItem } from "@/types/collection-view";

export interface CollectionSealedViewProps {
  items: CollectionSealedViewItem[];
  emptyTitle: string;
  emptyText: string;
  sectionTitle?: string;
  sectionCount?: ReactNode;
  sectionTrailing?: ReactNode;
}

export interface RemoveDialogState {
  itemIds: string[];
  title: string;
  description: string;
}
