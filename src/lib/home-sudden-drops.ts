import type { CurrencyCode } from "@/lib/format";

export interface HomeSuddenDropPreviewItem {
  cardId: string;
  name: string;
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

export interface HomeSuddenDropsResponse {
  items: HomeSuddenDropPreviewItem[];
  total: number;
  threshold: number;
  windowDays: number;
  limit: number;
  refreshStartedAt: string | null;
  refreshFinishedAt: string | null;
  refreshStatus: string | null;
}
