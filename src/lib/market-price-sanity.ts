export interface CardmarketRawPriceFields {
  cm_en_avg_7d?: number | null;
  cm_en_lowest_nm?: number | null;
  cm_de_lowest_nm?: number | null;
  cm_fr_lowest_nm?: number | null;
  cm_es_lowest_nm?: number | null;
  cm_it_lowest_nm?: number | null;
  cm_jp_lowest_nm?: number | null;
}

function positive(value: number | null | undefined): number | null {
  return value != null && Number.isFinite(value) && value > 0 ? value : null;
}

export function medianPositive(values: Array<number | null | undefined>): number | null {
  const sorted = values
    .map(positive)
    .filter((value): value is number => value != null)
    .sort((left, right) => left - right);
  if (sorted.length === 0) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle] ?? null
    : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

export function getCardmarketMedianLow(price: CardmarketRawPriceFields): number | null {
  return medianPositive([
    price.cm_en_lowest_nm,
    price.cm_de_lowest_nm,
    price.cm_fr_lowest_nm,
    price.cm_es_lowest_nm,
    price.cm_it_lowest_nm,
    price.cm_jp_lowest_nm,
  ]);
}

export function getSaneCardmarketAverage7d(price: CardmarketRawPriceFields): number | null {
  const average = positive(price.cm_en_avg_7d);
  if (average == null) return null;
  const anchor = getCardmarketMedianLow(price);
  if (anchor == null) return average;
  const ratio = average / anchor;
  return ratio >= 0.2 && ratio <= 3 ? average : null;
}

/**
 * The visible raw price is a current Near Mint listing, matching normal card detail.
 * A 7-day average is only a last-resort fallback and must agree with independent
 * language listing anchors first.
 */
export function getCurrentRawCardmarketValue(price: CardmarketRawPriceFields): number | null {
  return (
    positive(price.cm_en_lowest_nm) ??
    getCardmarketMedianLow(price) ??
    getSaneCardmarketAverage7d(price)
  );
}
