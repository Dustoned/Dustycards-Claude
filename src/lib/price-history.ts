export interface CardMarketPriceSnapshot {
  cm_en_lowest_nm: number | null;
  cm_de_lowest_nm: number | null;
  cm_fr_lowest_nm: number | null;
  cm_es_lowest_nm: number | null;
  cm_it_lowest_nm: number | null;
  cm_jp_lowest_nm?: number | null;
}

export interface CardPriceHistorySnapshot extends CardMarketPriceSnapshot {
  fetched_at: Date | string;
  tcp_market: number | null;
  cm_en_avg_7d: number | null;
  cm_en_avg_30d: number | null;
}

export interface CardPriceHistoryPoint {
  date: string;
  label: string;
  cm_market: number | null;
  cm_market_en: number | null;
  cm_market_de: number | null;
  cm_market_fr: number | null;
  cm_market_es: number | null;
  cm_market_it: number | null;
  cm_market_jp: number | null;
  tcp_market: number | null;
  cm_avg_7d: number | null;
  cm_avg_30d: number | null;
}

export interface CardGradedPriceHistorySnapshot {
  fetched_at: Date | string;
  label: string;
  price: number;
}

export interface CardGradedPriceHistoryPoint {
  date: string;
  label: string;
  value: number | null;
}

export interface CardGradedPriceHistorySeries {
  label: string;
  points: CardGradedPriceHistoryPoint[];
}

export interface CardEbaySoldGradedPriceHistorySnapshot {
  fetched_at: Date | string;
  label: string;
  median_price: number;
  currency: string;
  sample_size: number | null;
}

export interface CardEbaySoldGradedPriceHistorySeries {
  label: string;
  currency: "EUR" | "USD";
  points: CardGradedPriceHistoryPoint[];
  latest_sample_size: number | null;
  latest_fetched_at: string | null;
}

export const CARD_MARKET_HISTORY_SERIES = [
  { key: "cm_market_en", label: "EN" },
  { key: "cm_market_de", label: "DE" },
  { key: "cm_market_fr", label: "FR" },
  { key: "cm_market_es", label: "ES" },
  { key: "cm_market_it", label: "IT" },
  { key: "cm_market_jp", label: "JP" },
] as const;

export type CardMarketHistorySeriesKey =
  (typeof CARD_MARKET_HISTORY_SERIES)[number]["key"];

export interface EpisodePriceHistorySnapshot extends CardMarketPriceSnapshot {
  card_id: string;
  fetched_at: Date | string;
  // Current snapshots move fetched_at forward when the quote is observed
  // unchanged. changed_at preserves when that value actually became valid,
  // allowing weekly comparisons to reconstruct the price at the window start.
  changed_at?: Date | string | null;
}

export interface EpisodeSetPriceHistoryPoint {
  date: string;
  label: string;
  total_market: number;
  priced_cards: number;
}

export interface EpisodeSealedPriceHistorySnapshot extends SealedPriceHistorySnapshot {
  product_id: string;
}

export interface SealedMarketPriceSnapshot {
  cm_lowest: number | null;
  cm_lowest_eu: number | null;
  cm_lowest_de: number | null;
  cm_lowest_fr: number | null;
  cm_lowest_es: number | null;
  cm_lowest_it: number | null;
}

/** TCGGo uses 9001 as a no-listing sentinel; it is never a real market quote. */
export function normalizeCardMarketListingValue(
  value: number | null | undefined
): number | null {
  return value != null && Number.isFinite(value) && value > 0 && value !== 9001
    ? value
    : null;
}

export interface SealedPriceHistorySnapshot extends SealedMarketPriceSnapshot {
  fetched_at: Date | string;
  cm_avg_7d: number | null;
  cm_avg_30d: number | null;
}

export interface SealedPriceHistoryPoint {
  date: string;
  label: string;
  cm_market: number | null;
  cm_market_eu: number | null;
  cm_market_de: number | null;
  cm_market_fr: number | null;
  cm_market_es: number | null;
  cm_market_it: number | null;
  cm_avg_7d: number | null;
  cm_avg_30d: number | null;
}

export const SEALED_MARKET_HISTORY_SERIES = [
  { key: "cm_market", label: "Market" },
  { key: "cm_market_eu", label: "EU Market" },
  { key: "cm_market_de", label: "DE" },
  { key: "cm_market_fr", label: "FR" },
  { key: "cm_market_es", label: "ES" },
  { key: "cm_market_it", label: "IT" },
] as const;

export type SealedMarketHistorySeriesKey =
  (typeof SEALED_MARKET_HISTORY_SERIES)[number]["key"];

const SHORT_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  month: "short",
});
const dateLabelCache = new Map<string, string>();

function toMillis(value: Date | string): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

function toDateKey(value: Date | string): string {
  return new Date(toMillis(value)).toISOString().slice(0, 10);
}

function toDateLabel(dateKey: string): string {
  const cached = dateLabelCache.get(dateKey);
  if (cached) return cached;

  const label = SHORT_DATE_FORMATTER.format(new Date(`${dateKey}T00:00:00.000Z`));
  dateLabelCache.set(dateKey, label);
  return label;
}

export function getCardMarketValue(snapshot: CardMarketPriceSnapshot | null | undefined): number | null {
  if (!snapshot) return null;
  return normalizeCardMarketListingValue(snapshot.cm_en_lowest_nm);
}

export function buildCardPriceHistory(
  prices: CardPriceHistorySnapshot[]
): CardPriceHistoryPoint[] {
  const byDay = new Map<string, CardPriceHistoryPoint>();
  const sorted = [...prices].sort((a, b) => toMillis(a.fetched_at) - toMillis(b.fetched_at));

  for (const price of sorted) {
    const date = toDateKey(price.fetched_at);
    const point = byDay.get(date) ?? {
      date,
      label: toDateLabel(date),
      cm_market: null,
      cm_market_en: null,
      cm_market_de: null,
      cm_market_fr: null,
      cm_market_es: null,
      cm_market_it: null,
      cm_market_jp: null,
      tcp_market: null,
      cm_avg_7d: null,
      cm_avg_30d: null,
    };

    // Price providers can write separate source snapshots on the same day.
    // Merge each series independently so a later TCG-only or other-language
    // row never erases the latest usable English/NM point in the default graph.
    const english = normalizeCardMarketListingValue(price.cm_en_lowest_nm);
    if (english != null) {
      point.cm_market = english;
      point.cm_market_en = english;
    }
    const german = normalizeCardMarketListingValue(price.cm_de_lowest_nm);
    if (german != null) point.cm_market_de = german;
    const french = normalizeCardMarketListingValue(price.cm_fr_lowest_nm);
    if (french != null) point.cm_market_fr = french;
    const spanish = normalizeCardMarketListingValue(price.cm_es_lowest_nm);
    if (spanish != null) point.cm_market_es = spanish;
    const italian = normalizeCardMarketListingValue(price.cm_it_lowest_nm);
    if (italian != null) point.cm_market_it = italian;
    const japanese = normalizeCardMarketListingValue(price.cm_jp_lowest_nm);
    if (japanese != null) point.cm_market_jp = japanese;
    if (price.tcp_market != null && Number.isFinite(price.tcp_market) && price.tcp_market > 0) {
      point.tcp_market = price.tcp_market;
    }
    const average7d = normalizeCardMarketListingValue(price.cm_en_avg_7d);
    if (average7d != null) point.cm_avg_7d = average7d;
    const average30d = normalizeCardMarketListingValue(price.cm_en_avg_30d);
    if (average30d != null) point.cm_avg_30d = average30d;

    byDay.set(date, point);
  }

  return [...byDay.values()];
}

export function buildCardGradedPriceHistory(
  snapshots: CardGradedPriceHistorySnapshot[]
): CardGradedPriceHistorySeries[] {
  const snapshotsByLabel = new Map<string, CardGradedPriceHistorySnapshot[]>();

  for (const snapshot of snapshots) {
    const label = snapshot.label.replace(/\s+/g, " ").trim();
    if (!label || snapshot.price == null) continue;

    const existing = snapshotsByLabel.get(label) ?? [];
    existing.push({
      ...snapshot,
      label,
    });
    snapshotsByLabel.set(label, existing);
  }

  return [...snapshotsByLabel.entries()]
    .map(([label, labelSnapshots]) => {
      const byDay = new Map<string, CardGradedPriceHistorySnapshot>();
      const sorted = [...labelSnapshots].sort(
        (a, b) => toMillis(a.fetched_at) - toMillis(b.fetched_at)
      );

      for (const snapshot of sorted) {
        byDay.set(toDateKey(snapshot.fetched_at), snapshot);
      }

      return {
        label,
        points: [...byDay.entries()].map(([date, snapshot]) => ({
          date,
          label: toDateLabel(date),
          value: snapshot.price,
        })),
      };
    })
    .sort((a, b) => {
      const latestA = a.points[a.points.length - 1]?.value ?? 0;
      const latestB = b.points[b.points.length - 1]?.value ?? 0;
      return latestB - latestA || a.label.localeCompare(b.label);
    });
}

function normalizeHistoryCurrency(currency: string | null | undefined): "EUR" | "USD" | null {
  const normalized = currency?.toUpperCase();
  return normalized === "EUR" || normalized === "USD" ? normalized : null;
}

function convertEbaySoldHistoryValue(
  snapshot: CardEbaySoldGradedPriceHistorySnapshot,
  usdToEurRate?: number | null
): { value: number; currency: "EUR" | "USD" } | null {
  const currency = normalizeHistoryCurrency(snapshot.currency);
  if (!currency) return null;

  if (currency === "USD" && usdToEurRate != null) {
    return {
      value: Number((snapshot.median_price * usdToEurRate).toFixed(2)),
      currency: "EUR",
    };
  }

  return {
    value: snapshot.median_price,
    currency,
  };
}

export function buildCardEbaySoldGradedPriceHistory(
  snapshots: CardEbaySoldGradedPriceHistorySnapshot[],
  options: { usdToEurRate?: number | null } = {}
): CardEbaySoldGradedPriceHistorySeries[] {
  const snapshotsByLabel = new Map<
    string,
    Array<CardEbaySoldGradedPriceHistorySnapshot & { displayCurrency: "EUR" | "USD"; displayValue: number }>
  >();

  for (const snapshot of snapshots) {
    const label = snapshot.label.replace(/\s+/g, " ").trim();
    const converted = convertEbaySoldHistoryValue(snapshot, options.usdToEurRate);
    if (!label || !converted) continue;

    const existing = snapshotsByLabel.get(label) ?? [];
    existing.push({
      ...snapshot,
      label,
      displayCurrency: converted.currency,
      displayValue: converted.value,
    });
    snapshotsByLabel.set(label, existing);
  }

  return [...snapshotsByLabel.entries()]
    .map(([label, labelSnapshots]) => {
      const byDay = new Map<string, (typeof labelSnapshots)[number]>();
      const sorted = [...labelSnapshots].sort(
        (a, b) => toMillis(a.fetched_at) - toMillis(b.fetched_at)
      );

      for (const snapshot of sorted) {
        byDay.set(toDateKey(snapshot.fetched_at), snapshot);
      }

      const daySnapshots = [...byDay.entries()];
      const latestSnapshot = daySnapshots[daySnapshots.length - 1]?.[1] ?? null;

      return {
        label,
        currency: latestSnapshot?.displayCurrency ?? "USD",
        latest_sample_size: latestSnapshot?.sample_size ?? null,
        latest_fetched_at: latestSnapshot
          ? new Date(toMillis(latestSnapshot.fetched_at)).toISOString()
          : null,
        points: daySnapshots.map(([date, snapshot]) => ({
          date,
          label: toDateLabel(date),
          value: snapshot.displayValue,
        })),
      };
    })
    .sort((a, b) => {
      const latestA = a.points[a.points.length - 1]?.value ?? 0;
      const latestB = b.points[b.points.length - 1]?.value ?? 0;
      return latestB - latestA || a.label.localeCompare(b.label);
    });
}

export function getCardMarketHistorySeriesValue(
  point: CardPriceHistoryPoint,
  key: CardMarketHistorySeriesKey
): number | null {
  switch (key) {
    case "cm_market_en":
      return normalizeCardMarketListingValue(point.cm_market_en);
    case "cm_market_de":
      return normalizeCardMarketListingValue(point.cm_market_de);
    case "cm_market_fr":
      return normalizeCardMarketListingValue(point.cm_market_fr);
    case "cm_market_es":
      return normalizeCardMarketListingValue(point.cm_market_es);
    case "cm_market_it":
      return normalizeCardMarketListingValue(point.cm_market_it);
    case "cm_market_jp":
      return normalizeCardMarketListingValue(point.cm_market_jp);
  }
}

export function getCardMarketHistorySeriesCurrentValue(
  snapshot: CardMarketPriceSnapshot | null | undefined,
  key: CardMarketHistorySeriesKey
): number | null {
  if (!snapshot) return null;

  switch (key) {
    case "cm_market_en":
      return normalizeCardMarketListingValue(snapshot.cm_en_lowest_nm);
    case "cm_market_de":
      return normalizeCardMarketListingValue(snapshot.cm_de_lowest_nm);
    case "cm_market_fr":
      return normalizeCardMarketListingValue(snapshot.cm_fr_lowest_nm);
    case "cm_market_es":
      return normalizeCardMarketListingValue(snapshot.cm_es_lowest_nm);
    case "cm_market_it":
      return normalizeCardMarketListingValue(snapshot.cm_it_lowest_nm);
    case "cm_market_jp":
      return normalizeCardMarketListingValue(snapshot.cm_jp_lowest_nm);
  }
}

export interface SaneCardMarketCurrentValue {
  value: number | null;
  ignoredValue: number | null;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function isSuspiciousLowCardMarketValue(
  currentValue: number,
  historyValues: number[]
): boolean {
  const baseline = median(historyValues.filter((value) => value >= 1));

  return baseline != null && baseline >= 10 && currentValue < 1 && currentValue < baseline * 0.15;
}

export function getSaneCardMarketHistorySeriesCurrentValue(
  snapshot: CardMarketPriceSnapshot | null | undefined,
  key: CardMarketHistorySeriesKey,
  history: CardPriceHistoryPoint[]
): SaneCardMarketCurrentValue {
  const currentValue = getCardMarketHistorySeriesCurrentValue(snapshot, key);
  if (currentValue == null) {
    const lastKnownValue = [...history]
      .reverse()
      .map((point) => getCardMarketHistorySeriesValue(point, key))
      .find((value): value is number => value != null);
    return { value: lastKnownValue ?? null, ignoredValue: null };
  }

  const historyValues = history
    .map((point) => getCardMarketHistorySeriesValue(point, key))
    .filter((value): value is number => value != null && Number.isFinite(value));

  if (!isSuspiciousLowCardMarketValue(currentValue, historyValues)) {
    return { value: currentValue, ignoredValue: null };
  }

  const fallbackValue =
    [...historyValues]
      .reverse()
      .find((value) => value >= 1 && value >= currentValue * 10) ?? null;

  return {
    value: fallbackValue ?? currentValue,
    ignoredValue: fallbackValue == null ? null : currentValue,
  };
}

export function hasCardMarketHistorySeries(
  points: CardPriceHistoryPoint[],
  key: CardMarketHistorySeriesKey
): boolean {
  return points.some((point) => getCardMarketHistorySeriesValue(point, key) != null);
}

export function buildEpisodeSetPriceHistory(
  prices: EpisodePriceHistorySnapshot[]
): EpisodeSetPriceHistoryPoint[] {
  const sorted = [...prices].sort((a, b) => toMillis(a.fetched_at) - toMillis(b.fetched_at));
  const latestByCard = new Map<string, number>();
  const points: EpisodeSetPriceHistoryPoint[] = [];
  let total = 0;
  let currentDay: string | null = null;

  function commit(day: string) {
    if (latestByCard.size === 0) return;

    points.push({
      date: day,
      label: toDateLabel(day),
      total_market: Number(total.toFixed(2)),
      priced_cards: latestByCard.size,
    });
  }

  for (const price of sorted) {
    const day = toDateKey(price.fetched_at);

    if (currentDay && day !== currentDay) {
      commit(currentDay);
    }

    currentDay = day;

    const nextValue = getCardMarketValue(price);
    // A source-only or sentinel snapshot is not evidence that the last valid
    // English/NM quote disappeared; it must not erase that card from the set
    // total until another valid English/NM quote arrives.
    if (nextValue == null) continue;

    const previousValue = latestByCard.get(price.card_id);
    if (previousValue != null) {
      total -= previousValue;
    }

    latestByCard.set(price.card_id, nextValue);
    total += nextValue;
  }

  if (currentDay) {
    commit(currentDay);
  }

  return points;
}

export function buildEpisodeSealedSetPriceHistory(
  prices: EpisodeSealedPriceHistorySnapshot[]
): EpisodeSetPriceHistoryPoint[] {
  const sorted = [...prices].sort((a, b) => toMillis(a.fetched_at) - toMillis(b.fetched_at));
  const latestByProduct = new Map<string, number>();
  const points: EpisodeSetPriceHistoryPoint[] = [];
  let total = 0;
  let currentDay: string | null = null;

  function commit(day: string) {
    if (latestByProduct.size === 0) return;

    points.push({
      date: day,
      label: toDateLabel(day),
      total_market: Number(total.toFixed(2)),
      priced_cards: latestByProduct.size,
    });
  }

  for (const price of sorted) {
    const day = toDateKey(price.fetched_at);

    if (currentDay && day !== currentDay) {
      commit(currentDay);
    }

    currentDay = day;

    const previousValue = latestByProduct.get(price.product_id);
    if (previousValue != null) {
      total -= previousValue;
    }

    const nextValue = getSealedCardMarketValue(price);
    if (nextValue == null) {
      latestByProduct.delete(price.product_id);
      continue;
    }

    latestByProduct.set(price.product_id, nextValue);
    total += nextValue;
  }

  if (currentDay) {
    commit(currentDay);
  }

  return points;
}

export function getSealedCardMarketValue(
  snapshot: SealedMarketPriceSnapshot | null | undefined
): number | null {
  if (!snapshot) return null;

  return (
    snapshot.cm_lowest_eu ??
    snapshot.cm_lowest ??
    snapshot.cm_lowest_de ??
    snapshot.cm_lowest_fr ??
    snapshot.cm_lowest_es ??
    snapshot.cm_lowest_it ??
    null
  );
}

function getSealedGeneralMarketValue(
  snapshot: SealedMarketPriceSnapshot | null | undefined
): number | null {
  if (!snapshot) return null;

  return (
    snapshot.cm_lowest ??
    snapshot.cm_lowest_eu ??
    snapshot.cm_lowest_de ??
    snapshot.cm_lowest_fr ??
    snapshot.cm_lowest_es ??
    snapshot.cm_lowest_it ??
    null
  );
}

export function buildSealedPriceHistory(
  prices: SealedPriceHistorySnapshot[]
): SealedPriceHistoryPoint[] {
  const byDay = new Map<string, SealedPriceHistorySnapshot>();
  const sorted = [...prices].sort((a, b) => toMillis(a.fetched_at) - toMillis(b.fetched_at));

  for (const price of sorted) {
    byDay.set(toDateKey(price.fetched_at), price);
  }

  return [...byDay.entries()].map(([date, price]) => ({
    date,
    label: toDateLabel(date),
    cm_market: getSealedGeneralMarketValue(price),
    cm_market_eu: price.cm_lowest_eu ?? null,
    cm_market_de: price.cm_lowest_de ?? null,
    cm_market_fr: price.cm_lowest_fr ?? null,
    cm_market_es: price.cm_lowest_es ?? null,
    cm_market_it: price.cm_lowest_it ?? null,
    cm_avg_7d: price.cm_avg_7d ?? null,
    cm_avg_30d: price.cm_avg_30d ?? null,
  }));
}

export function getSealedMarketHistorySeriesValue(
  point: SealedPriceHistoryPoint,
  key: SealedMarketHistorySeriesKey
): number | null {
  switch (key) {
    case "cm_market":
      return point.cm_market ?? null;
    case "cm_market_eu":
      return point.cm_market_eu ?? null;
    case "cm_market_de":
      return point.cm_market_de ?? null;
    case "cm_market_fr":
      return point.cm_market_fr ?? null;
    case "cm_market_es":
      return point.cm_market_es ?? null;
    case "cm_market_it":
      return point.cm_market_it ?? null;
  }
}

export function getSealedMarketHistorySeriesCurrentValue(
  snapshot: SealedMarketPriceSnapshot | null | undefined,
  key: SealedMarketHistorySeriesKey
): number | null {
  if (!snapshot) return null;

  switch (key) {
    case "cm_market":
      return getSealedGeneralMarketValue(snapshot);
    case "cm_market_eu":
      return snapshot.cm_lowest_eu ?? null;
    case "cm_market_de":
      return snapshot.cm_lowest_de ?? null;
    case "cm_market_fr":
      return snapshot.cm_lowest_fr ?? null;
    case "cm_market_es":
      return snapshot.cm_lowest_es ?? null;
    case "cm_market_it":
      return snapshot.cm_lowest_it ?? null;
  }
}

export function hasSealedMarketHistorySeries(
  points: SealedPriceHistoryPoint[],
  key: SealedMarketHistorySeriesKey
): boolean {
  return points.some((point) => getSealedMarketHistorySeriesValue(point, key) != null);
}
