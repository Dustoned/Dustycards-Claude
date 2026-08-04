import type { UpcomingSingleItem, UpcomingSingleStatus } from "@/lib/upcoming-releases";

export interface UpcomingSingleGroup {
  key: string;
  name: string;
  items: UpcomingSingleItem[];
  releaseDate: string | null;
  sources: string[];
  numberedCount: number;
  numberingCeiling: number | null;
  coverage: number | null;
  nearComplete: boolean;
  statuses: Record<UpcomingSingleStatus, number>;
}

export function getUpcomingCardNumber(value: string | null): number | null {
  const match = value?.match(/\d{1,3}/)?.[0];
  if (!match) return null;
  const parsed = Number(match);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function explicitSetSize(value: string | null): number | null {
  const match = value?.match(/\d{1,3}\s*\/\s*(\d{1,3})/)?.[1];
  if (!match) return null;
  const parsed = Number(match);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function compareSingles(left: UpcomingSingleItem, right: UpcomingSingleItem): number {
  const leftNumber = getUpcomingCardNumber(left.cardNumber);
  const rightNumber = getUpcomingCardNumber(right.cardNumber);
  if (leftNumber != null && rightNumber != null && leftNumber !== rightNumber) {
    return rightNumber - leftNumber;
  }
  if (leftNumber != null && rightNumber == null) return -1;
  if (leftNumber == null && rightNumber != null) return 1;
  return left.name.localeCompare(right.name, "en", { sensitivity: "base" });
}

function itemPreference(item: UpcomingSingleItem): number {
  const statusScore: Record<UpcomingSingleStatus, number> = {
    confirmed: 40,
    reveal: 30,
    leak: 20,
    upcoming: 10,
  };
  return (item.cardId ? 100 : 0)
    + statusScore[item.status]
    + (item.sourceName === "Pokemon.com" ? 4 : 0)
    + (item.imageUrl ? 2 : 0)
    + (item.episodeId ? 1 : 0);
}

function uniqueSetItems(rows: UpcomingSingleItem[]): UpcomingSingleItem[] {
  const unique = new Map<string, UpcomingSingleItem>();
  for (const item of rows) {
    const number = getUpcomingCardNumber(item.cardNumber);
    const key = number != null
      ? `number:${number}`
      : `identity:${item.name.trim().toLowerCase()}\u0000${item.imageUrl ?? ""}`;
    const current = unique.get(key);
    if (!current || itemPreference(item) > itemPreference(current)) unique.set(key, item);
  }
  return [...unique.values()];
}

export function groupUpcomingSingles(items: UpcomingSingleItem[]): UpcomingSingleGroup[] {
  const grouped = new Map<string, UpcomingSingleItem[]>();
  for (const item of items) {
    const name = item.episodeName?.trim() || "Other card reveals";
    const rows = grouped.get(name) ?? [];
    rows.push(item);
    grouped.set(name, rows);
  }

  return [...grouped.entries()]
    .map(([name, rows]) => {
      const sorted = uniqueSetItems(rows).sort(compareSingles);
      const cardNumbers = new Set(sorted.flatMap((item) => {
        const number = getUpcomingCardNumber(item.cardNumber);
        return number == null ? [] : [number];
      }));
      const explicitSizes = sorted.flatMap((item) => {
        const size = explicitSetSize(item.cardNumber);
        return size == null ? [] : [size];
      });
      const numberingCeiling = explicitSizes.length
        ? Math.max(...explicitSizes)
        : cardNumbers.size
          ? Math.max(...cardNumbers)
          : null;
      const coverage = numberingCeiling && numberingCeiling > 0
        ? Math.min(1, cardNumbers.size / numberingCeiling)
        : null;
      const nearComplete = sorted.length >= 48 && coverage != null && coverage >= 0.72;
      const releaseDate = sorted
        .map((item) => item.releaseDate)
        .filter((value): value is string => Boolean(value))
        .sort()[0] ?? null;
      const statuses: Record<UpcomingSingleStatus, number> = {
        confirmed: 0,
        reveal: 0,
        leak: 0,
        upcoming: 0,
      };
      for (const item of sorted) statuses[item.status] += 1;

      return {
        key: name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "other",
        name,
        items: sorted,
        releaseDate,
        sources: [...new Set(sorted.flatMap((item) => item.sourceName ? [item.sourceName] : []))],
        numberedCount: cardNumbers.size,
        numberingCeiling,
        coverage,
        nearComplete,
        statuses,
      } satisfies UpcomingSingleGroup;
    })
    .sort((left, right) =>
      Number(right.nearComplete) - Number(left.nearComplete)
      || right.items.length - left.items.length
      || left.name.localeCompare(right.name, "en", { sensitivity: "base" })
    );
}
