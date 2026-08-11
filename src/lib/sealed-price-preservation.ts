const SEALED_PRICE_FIELDS = [
  "cm_lowest",
  "cm_lowest_eu",
  "cm_lowest_de",
  "cm_lowest_fr",
  "cm_lowest_es",
  "cm_lowest_it",
  "cm_avg_7d",
  "cm_avg_30d",
] as const;
const SEALED_CURRENT_PRICE_FIELDS = SEALED_PRICE_FIELDS.slice(0, 6);
const SEALED_AVERAGE_FIELDS = SEALED_PRICE_FIELDS.slice(6);

export type SealedPriceFields = Record<(typeof SEALED_PRICE_FIELDS)[number], number | null>;

function validSealedPrice(value: number | null | undefined): number | null {
  return value != null && Number.isFinite(value) && value > 0 && value !== 9001
    ? value
    : null;
}

/**
 * A catalog response with a missing market field means "no quote returned in
 * this response", not "erase the last known quote". Prisma ignores undefined
 * update fields, so this object preserves the stored value until a later sync
 * supplies a genuine replacement.
 */
export function buildPreservingSealedPriceUpdate(price: SealedPriceFields) {
  const normalized = buildNormalizedSealedPriceFields(price);
  const hasCurrent = SEALED_CURRENT_PRICE_FIELDS.some(
    (field) => normalized[field] != null
  );
  const hasAverage = SEALED_AVERAGE_FIELDS.some((field) => normalized[field] != null);
  return Object.fromEntries([
    ...SEALED_CURRENT_PRICE_FIELDS.map((field) => [
      field,
      hasCurrent ? normalized[field] : undefined,
    ]),
    ...SEALED_AVERAGE_FIELDS.map((field) => [
      field,
      hasAverage ? normalized[field] : undefined,
    ]),
  ]) as Record<(typeof SEALED_PRICE_FIELDS)[number], number | null | undefined>;
}

/** New records/snapshots store null for absent/sentinel values, never 9001. */
export function buildNormalizedSealedPriceFields(price: SealedPriceFields): SealedPriceFields {
  return Object.fromEntries(
    SEALED_PRICE_FIELDS.map((field) => [field, validSealedPrice(price[field])])
  ) as SealedPriceFields;
}

export function hasValidSealedCurrentPrice(
  price: Pick<
    SealedPriceFields,
    | "cm_lowest"
    | "cm_lowest_eu"
    | "cm_lowest_de"
    | "cm_lowest_fr"
    | "cm_lowest_es"
    | "cm_lowest_it"
  >
): boolean {
  return [
    price.cm_lowest,
    price.cm_lowest_eu,
    price.cm_lowest_de,
    price.cm_lowest_fr,
    price.cm_lowest_es,
    price.cm_lowest_it,
  ].some((value) => validSealedPrice(value) != null);
}

export function getLatestValidSealedPriceAt(
  snapshots: Array<
    Pick<
      SealedPriceFields,
      | "cm_lowest"
      | "cm_lowest_eu"
      | "cm_lowest_de"
      | "cm_lowest_fr"
      | "cm_lowest_es"
      | "cm_lowest_it"
    > & { fetched_at: Date | string }
  >
): string | null {
  let latest: Date | null = null;
  for (const snapshot of snapshots) {
    if (!hasValidSealedCurrentPrice(snapshot)) continue;
    const observedAt = new Date(snapshot.fetched_at);
    if (!Number.isFinite(observedAt.getTime())) continue;
    if (!latest || observedAt > latest) latest = observedAt;
  }
  return latest?.toISOString() ?? null;
}
