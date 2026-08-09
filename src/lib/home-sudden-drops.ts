import type { CurrencyCode } from "@/lib/format";

export const HOME_SUDDEN_DROP_LANE_SIZE = 12;
export const HOME_SUDDEN_DROP_PREVIEW_SIZE = HOME_SUDDEN_DROP_LANE_SIZE * 2;

export interface HomeSuddenDropPreviewItem {
  cardId: string;
  name: string;
  imageUrl: string | null;
  cardNumber: string | null;
  episodeName: string;
  episodeCode: string | null;
  source: string;
  sourceLabel: string;
  currentPrice: number;
  currency: CurrencyCode;
  dropAmount: number;
  dropPercent: number | null;
  coveredDays: number | null;
}

export interface HomeSuddenDropSealedPreviewItem {
  productId: string;
  name: string;
  imageUrl: string | null;
  episodeId: string;
  episodeName: string;
  episodeCode: string | null;
  currentPrice: number;
  currency: CurrencyCode;
  dropAmount: number;
  dropPercent: number | null;
}

export interface HomeSuddenDropsResponse {
  items: HomeSuddenDropPreviewItem[];
  sealedItems?: HomeSuddenDropSealedPreviewItem[];
  sealedTotal?: number;
  total: number;
  threshold: number;
  windowDays: number;
  limit: number;
  refreshStartedAt: string | null;
  refreshFinishedAt: string | null;
  refreshStatus: string | null;
}
