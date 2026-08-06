import "server-only";
import { db } from "@/lib/db";

export const STALE_PRICE_AGE_MS = 1000 * 60 * 60 * 24 * 14;

// Cards the price source (TCGgo) explicitly has no price for. These are an
// upstream limitation, not fixable data debt, so quality signals exclude them.
export const KNOWN_UNAVAILABLE_PRICE_STATUS = "unavailable";

export interface DataQualityItem {
  id: string;
  name: string;
  detail: string | null;
  game: string;
  episodeId: string;
  episodeName: string;
  kind: "card" | "sealed";
}

const EMPTY_CARD_HISTORY_COUNT_KEY = "data-quality-empty-card-history-count-v1";

async function persistEmptyCardHistoryCount(count: number): Promise<void> {
  try {
    await db.appSetting.upsert({
      where: { key: EMPTY_CARD_HISTORY_COUNT_KEY },
      create: { key: EMPTY_CARD_HISTORY_COUNT_KEY, value: String(count) },
      update: { value: String(count) },
    });
  } catch (error) {
    console.warn(
      "[data-quality] could not persist empty-history count:",
      error instanceof Error ? error.message : String(error)
    );
  }
}

export async function refreshEmptyCardHistoryCount(): Promise<number> {
  const rows = await db.$queryRaw<Array<{ empty_history: bigint | number }>>`
    SELECT COUNT(*) AS empty_history
    FROM (
      SELECT card_id FROM "Price" GROUP BY card_id HAVING COUNT(*) = 1
    )
  `;
  const count = Number(rows[0]?.empty_history ?? 0);
  await persistEmptyCardHistoryCount(count);
  return count;
}

export async function getEmptyCardHistoryCountSnapshot(): Promise<number> {
  const stored = await db.appSetting.findUnique({
    where: { key: EMPTY_CARD_HISTORY_COUNT_KEY },
    select: { value: true },
  });
  if (stored) {
    const count = Number(stored.value);
    if (Number.isInteger(count) && count >= 0) return count;
  }
  return refreshEmptyCardHistoryCount();
}
