import { db } from "@/lib/db";

const SQLITE_SAFE_CHUNK_SIZE = 200;

/**
 * Cross-card history is dangerous even when the upstream CardMarket id, set,
 * name and collector number all match: One Piece base and alternate-art cards
 * can share every one of those fields. Keep hand-offs explicit and audited.
 */
const SAFE_CARDMARKET_HISTORY_HANDOFF_GROUPS: readonly ReadonlySet<string>[] = [
  new Set(["9907", "9908"]),
];

export interface CardMarketHistoryIdentity {
  id: string;
  game: string;
  episodeId: string;
  name: string;
  cardNumber: string | null;
  printedCardNumber: string | null;
  cardmarketId: string | null;
  cardmarketUrl?: string | null;
}

export interface CardMarketHistoryPriceRow {
  card_id: string;
  fetched_at: Date;
  cm_fetched_at?: Date | null;
  tcp_fetched_at?: Date | null;
  cm_en_avg_7d_fetched_at?: Date | null;
  cm_en_avg_30d_fetched_at?: Date | null;
  source?: string | null;
  source_provider?: string | null;
  source_url?: string | null;
  cm_en_lowest_nm: number | null;
  cm_de_lowest_nm: number | null;
  cm_fr_lowest_nm: number | null;
  cm_es_lowest_nm: number | null;
  cm_it_lowest_nm: number | null;
  cm_jp_lowest_nm: number | null;
  cm_en_avg_7d: number | null;
  cm_en_avg_30d: number | null;
  tcp_market: number | null;
  tcp_mid: number | null;
  tcp_low: number | null;
}

export interface LatestSafeEnglishNmPrice {
  value: number;
  fetchedAt: Date;
  row: CardMarketHistoryPriceRow;
}

export interface CardMarketAliasCandidate {
  id: string;
  game: string;
  episode_id: string;
  name: string;
  card_number: string | null;
  printed_card_number: string | null;
  cardmarket_id: string | null;
  cardmarket_url: string | null;
}

function normalizeName(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en")
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * TCGGo occasionally moves one CardMarket instrument from e.g. `157` to
 * `157a`. Strip only that provider-style trailing variant letter; do not
 * collapse arbitrary promo prefixes or unrelated collector numbers.
 */
export function normalizeCardMarketCollectorNumber(
  value: string | null | undefined
): string | null {
  const numerator = value?.split("/", 1)[0]?.trim().toLocaleLowerCase("en") ?? "";
  if (!numerator) return null;
  const numericVariant = numerator.match(/^(\d+)[a-z]$/i);
  if (numericVariant) return String(Number(numericVariant[1]));
  if (/^\d+$/.test(numerator)) return String(Number(numerator));
  return numerator;
}

function collectorNumbers(identity: {
  cardNumber: string | null;
  printedCardNumber: string | null;
}): Set<string> {
  return new Set(
    [identity.cardNumber, identity.printedCardNumber]
      .map(normalizeCardMarketCollectorNumber)
      .filter((value): value is string => Boolean(value))
  );
}

function cardMarketProductIdFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const productId = new URL(url).searchParams.get("idProduct")?.trim() ?? "";
    return productId || null;
  } catch {
    return null;
  }
}

/**
 * CardMarket ids in the upstream catalogue are not globally trustworthy.
 * Cross-card history is therefore accepted only for an explicitly audited
 * provider hand-off, after which the identity fields below still have to
 * agree. Exact-card history is always loaded independently of this function.
 */
export function isSafeCardMarketHistoryAlias(
  identity: CardMarketHistoryIdentity,
  candidate: CardMarketAliasCandidate
): boolean {
  if (
    identity.id !== candidate.id &&
    !SAFE_CARDMARKET_HISTORY_HANDOFF_GROUPS.some(
      (group) => group.has(identity.id) && group.has(candidate.id)
    )
  ) {
    return false;
  }
  if (!identity.cardmarketId || candidate.cardmarket_id !== identity.cardmarketId) {
    return false;
  }
  if (candidate.game !== identity.game || candidate.episode_id !== identity.episodeId) {
    return false;
  }
  if (normalizeName(candidate.name) !== normalizeName(identity.name)) return false;

  const sourceNumbers = collectorNumbers(identity);
  const candidateNumbers = collectorNumbers({
    cardNumber: candidate.card_number,
    printedCardNumber: candidate.printed_card_number,
  });
  if (
    sourceNumbers.size > 0 &&
    candidateNumbers.size > 0 &&
    ![...sourceNumbers].some((number) => candidateNumbers.has(number))
  ) {
    return false;
  }

  const identityUrlProduct = cardMarketProductIdFromUrl(identity.cardmarketUrl);
  const candidateUrlProduct = cardMarketProductIdFromUrl(candidate.cardmarket_url);
  if (
    identityUrlProduct &&
    candidateUrlProduct &&
    identityUrlProduct !== candidateUrlProduct
  ) {
    return false;
  }
  return true;
}

function uniqueHistoryIdentities(
  identities: readonly CardMarketHistoryIdentity[]
): CardMarketHistoryIdentity[] {
  return [...new Map(identities.map((item) => [item.id, item])).values()];
}

async function resolveSafeAliasIds(
  identities: readonly CardMarketHistoryIdentity[]
): Promise<Map<string, Set<string>>> {
  const candidates: CardMarketAliasCandidate[] = [];
  const marketIds = [
    ...new Set(
      identities
        .map((identity) => identity.cardmarketId)
        .filter((value): value is string => Boolean(value))
    ),
  ];
  for (let index = 0; index < marketIds.length; index += SQLITE_SAFE_CHUNK_SIZE) {
    candidates.push(
      ...(await db.card.findMany({
        where: { cardmarket_id: { in: marketIds.slice(index, index + SQLITE_SAFE_CHUNK_SIZE) } },
        select: {
          id: true,
          game: true,
          episode_id: true,
          name: true,
          card_number: true,
          printed_card_number: true,
          cardmarket_id: true,
          cardmarket_url: true,
        },
      }))
    );
  }

  const candidatesByMarketId = new Map<string, CardMarketAliasCandidate[]>();
  for (const candidate of candidates) {
    if (!candidate.cardmarket_id) continue;
    const matching = candidatesByMarketId.get(candidate.cardmarket_id) ?? [];
    matching.push(candidate);
    candidatesByMarketId.set(candidate.cardmarket_id, matching);
  }

  const aliasIdsByIdentity = new Map<string, Set<string>>();
  for (const identity of identities) {
    const ids = new Set<string>([identity.id]);
    for (const candidate of
      (identity.cardmarketId
        ? candidatesByMarketId.get(identity.cardmarketId)
        : null) ?? []) {
      if (isSafeCardMarketHistoryAlias(identity, candidate)) ids.add(candidate.id);
    }
    aliasIdsByIdentity.set(identity.id, ids);
  }
  return aliasIdsByIdentity;
}

function isUsableEnglishNmValue(value: number | null): value is number {
  return value != null && Number.isFinite(value) && value > 0 && value !== 9001;
}

function sanitizeMarketHistoryRow(
  row: CardMarketHistoryPriceRow
): CardMarketHistoryPriceRow {
  const usable = (value: number | null) =>
    isUsableEnglishNmValue(value) ? value : null;
  return {
    ...row,
    cm_en_lowest_nm: usable(row.cm_en_lowest_nm),
    cm_de_lowest_nm: usable(row.cm_de_lowest_nm),
    cm_fr_lowest_nm: usable(row.cm_fr_lowest_nm),
    cm_es_lowest_nm: usable(row.cm_es_lowest_nm),
    cm_it_lowest_nm: usable(row.cm_it_lowest_nm),
    cm_jp_lowest_nm: usable(row.cm_jp_lowest_nm),
    cm_en_avg_7d: usable(row.cm_en_avg_7d),
    cm_en_avg_30d: usable(row.cm_en_avg_30d),
    tcp_market: usable(row.tcp_market),
    tcp_mid: usable(row.tcp_mid),
    tcp_low: usable(row.tcp_low),
  };
}

const CURRENT_MARKET_FIELDS = [
  "cm_en_lowest_nm",
  "cm_de_lowest_nm",
  "cm_fr_lowest_nm",
  "cm_es_lowest_nm",
  "cm_it_lowest_nm",
  "cm_jp_lowest_nm",
  "cm_en_avg_7d",
  "cm_en_avg_30d",
  "tcp_market",
  "tcp_mid",
  "tcp_low",
] as const;

type CurrentMarketField = (typeof CURRENT_MARKET_FIELDS)[number];
type CurrentMarketFetchedAtField = `${CurrentMarketField}_fetched_at`;
type LatestCurrentMarketRow = {
  card_id: string;
  source: string | null;
  source_provider: string | null;
  source_url: string | null;
} & Record<CurrentMarketField, number | null> &
  Record<CurrentMarketFetchedAtField, Date | string | null>;

type LatestFieldCandidate = {
  cardId: string;
  value: number;
  fetchedAt: Date;
  row: LatestCurrentMarketRow;
};

function latestCurrentFieldSql(field: CurrentMarketField, select: "value" | "fetched_at") {
  const selectedColumn = select === "value" ? `p."${field}"` : `p."fetched_at"`;
  const alias = select === "value" ? field : `${field}_fetched_at`;
  return `(
    SELECT ${selectedColumn}
    FROM "Price" p
    WHERE p."card_id" = requested."id"
      AND p."${field}" > 0
      AND p."${field}" <> 9001
    ORDER BY p."fetched_at" DESC, p."id" DESC
    LIMIT 1
  ) AS "${alias}"`;
}

function latestEnglishNmMetadataSql(field: "source" | "source_provider" | "source_url") {
  return `(
    SELECT p."${field}"
    FROM "Price" p
    WHERE p."card_id" = requested."id"
      AND p."cm_en_lowest_nm" > 0
      AND p."cm_en_lowest_nm" <> 9001
    ORDER BY p."fetched_at" DESC, p."id" DESC
    LIMIT 1
  ) AS "${field}"`;
}

function asValidDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

async function loadLatestCurrentMarketRows(
  cardIds: readonly string[]
): Promise<Map<string, LatestCurrentMarketRow>> {
  const latestByCardId = new Map<string, LatestCurrentMarketRow>();

  for (let index = 0; index < cardIds.length; index += SQLITE_SAFE_CHUNK_SIZE) {
    const chunk = cardIds.slice(index, index + SQLITE_SAFE_CHUNK_SIZE);
    const placeholders = chunk.map(() => "(?)").join(", ");
    const fieldSelections = CURRENT_MARKET_FIELDS.flatMap((field) => [
      latestCurrentFieldSql(field, "value"),
      latestCurrentFieldSql(field, "fetched_at"),
    ]);
    const rows = await db.$queryRawUnsafe<LatestCurrentMarketRow[]>(
      `
      WITH requested("id") AS (VALUES ${placeholders})
      SELECT
        requested."id" AS "card_id",
        ${latestEnglishNmMetadataSql("source")},
        ${latestEnglishNmMetadataSql("source_provider")},
        ${latestEnglishNmMetadataSql("source_url")},
        ${fieldSelections.join(",\n        ")}
      FROM requested
      `,
      ...chunk
    );
    for (const row of rows) latestByCardId.set(row.card_id, row);
  }

  return latestByCardId;
}

function getLatestFieldCandidate(input: {
  field: CurrentMarketField;
  cardIds: Iterable<string>;
  exactCardId: string;
  rowsByCardId: Map<string, LatestCurrentMarketRow>;
}): LatestFieldCandidate | null {
  let latest: LatestFieldCandidate | null = null;

  for (const cardId of input.cardIds) {
    const row = input.rowsByCardId.get(cardId);
    const value = row?.[input.field] ?? null;
    const fetchedAt = row
      ? asValidDate(row[`${input.field}_fetched_at` as CurrentMarketFetchedAtField])
      : null;
    if (!row || !isUsableEnglishNmValue(value) || !fetchedAt) continue;

    const candidate = { cardId, value, fetchedAt, row };
    const isNewer = !latest || candidate.fetchedAt.getTime() > latest.fetchedAt.getTime();
    const isExactTie =
      latest &&
      candidate.fetchedAt.getTime() === latest.fetchedAt.getTime() &&
      candidate.cardId === input.exactCardId &&
      latest.cardId !== input.exactCardId;
    if (isNewer || isExactTie) latest = candidate;
  }

  return latest;
}

/** Returns the newest usable EN/NM row from an ascending safe history. */
export function getLatestSafeEnglishNmPrice(
  rows: readonly CardMarketHistoryPriceRow[]
): LatestSafeEnglishNmPrice | null {
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const row = rows[index];
    if (row && isUsableEnglishNmValue(row.cm_en_lowest_nm)) {
      return {
        value: row.cm_en_lowest_nm,
        fetchedAt: row.fetched_at,
        row,
      };
    }
  }
  return null;
}

/**
 * Loads one current EN/NM quote per card using the same guarded CardMarket
 * identity rules as the full history loader. This keeps lists and snapshots
 * aligned with the graph without loading every historical row.
 */
export async function loadLatestSafeEnglishNmPrices(
  identities: readonly CardMarketHistoryIdentity[]
): Promise<Map<string, LatestSafeEnglishNmPrice | null>> {
  const result = new Map<string, LatestSafeEnglishNmPrice | null>();
  if (identities.length === 0) return result;

  const uniqueIdentities = uniqueHistoryIdentities(identities);
  for (const identity of uniqueIdentities) result.set(identity.id, null);
  const aliasIdsByIdentity = await resolveSafeAliasIds(uniqueIdentities);
  const allCardIds = [
    ...new Set([...aliasIdsByIdentity.values()].flatMap((ids) => [...ids])),
  ];

  const latestRowsByCardId = await loadLatestCurrentMarketRows(allCardIds);

  for (const identity of uniqueIdentities) {
    const aliases = aliasIdsByIdentity.get(identity.id) ?? new Set([identity.id]);
    const latestEnglish = getLatestFieldCandidate({
      field: "cm_en_lowest_nm",
      cardIds: aliases,
      exactCardId: identity.id,
      rowsByCardId: latestRowsByCardId,
    });
    if (!latestEnglish) continue;

    const latestAliasField = (field: CurrentMarketField) =>
      getLatestFieldCandidate({
        field,
        cardIds: aliases,
        exactCardId: identity.id,
        rowsByCardId: latestRowsByCardId,
      });
    const latestExactField = (field: CurrentMarketField) =>
      getLatestFieldCandidate({
        field,
        cardIds: [identity.id],
        exactCardId: identity.id,
        rowsByCardId: latestRowsByCardId,
      });

    const cmDe = latestAliasField("cm_de_lowest_nm");
    const cmFr = latestAliasField("cm_fr_lowest_nm");
    const cmEs = latestAliasField("cm_es_lowest_nm");
    const cmIt = latestAliasField("cm_it_lowest_nm");
    const cmJp = latestAliasField("cm_jp_lowest_nm");
    const average7d = latestAliasField("cm_en_avg_7d");
    const average30d = latestAliasField("cm_en_avg_30d");
    const tcpMarket = latestExactField("tcp_market");
    const tcpMid = latestExactField("tcp_mid");
    const tcpLow = latestExactField("tcp_low");
    const row: CardMarketHistoryPriceRow = {
      card_id: latestEnglish.cardId,
      fetched_at: latestEnglish.fetchedAt,
      cm_fetched_at: latestEnglish.fetchedAt,
      tcp_fetched_at:
        tcpMarket?.fetchedAt ?? tcpMid?.fetchedAt ?? tcpLow?.fetchedAt ?? null,
      cm_en_avg_7d_fetched_at: average7d?.fetchedAt ?? null,
      cm_en_avg_30d_fetched_at: average30d?.fetchedAt ?? null,
      source: latestEnglish.row.source,
      source_provider: latestEnglish.row.source_provider,
      source_url: latestEnglish.row.source_url,
      cm_en_lowest_nm: latestEnglish.value,
      cm_de_lowest_nm: cmDe?.value ?? null,
      cm_fr_lowest_nm: cmFr?.value ?? null,
      cm_es_lowest_nm: cmEs?.value ?? null,
      cm_it_lowest_nm: cmIt?.value ?? null,
      cm_jp_lowest_nm: cmJp?.value ?? null,
      cm_en_avg_7d: average7d?.value ?? null,
      cm_en_avg_30d: average30d?.value ?? null,
      // TCGPlayer is exact-card only. A CardMarket alias may be a sibling
      // rendering with a different TCGPlayer instrument.
      tcp_market: tcpMarket?.value ?? null,
      tcp_mid: tcpMid?.value ?? null,
      tcp_low: tcpLow?.value ?? null,
    };
    result.set(identity.id, getLatestSafeEnglishNmPrice([row]));
  }

  return result;
}

export async function loadSafeCardMarketHistoryRows(
  identities: readonly CardMarketHistoryIdentity[],
  options: { fetchedAtGte?: Date; fetchedAtLte?: Date } = {}
): Promise<Map<string, CardMarketHistoryPriceRow[]>> {
  const result = new Map<string, CardMarketHistoryPriceRow[]>();
  if (identities.length === 0) return result;

  const uniqueIdentities = uniqueHistoryIdentities(identities);
  for (const identity of uniqueIdentities) {
    result.set(identity.id, []);
  }

  const aliasIdsByIdentity = await resolveSafeAliasIds(uniqueIdentities);

  const allCardIds = [
    ...new Set([...aliasIdsByIdentity.values()].flatMap((ids) => [...ids])),
  ];
  const allRows: CardMarketHistoryPriceRow[] = [];
  for (let index = 0; index < allCardIds.length; index += SQLITE_SAFE_CHUNK_SIZE) {
    const chunk = allCardIds.slice(index, index + SQLITE_SAFE_CHUNK_SIZE);
    allRows.push(
      ...(await db.price.findMany({
        where: {
          card_id: { in: chunk },
          ...(options.fetchedAtGte || options.fetchedAtLte
            ? {
                fetched_at: {
                  ...(options.fetchedAtGte ? { gte: options.fetchedAtGte } : {}),
                  ...(options.fetchedAtLte ? { lte: options.fetchedAtLte } : {}),
                },
              }
            : {}),
        },
        orderBy: [{ fetched_at: "asc" }, { id: "asc" }],
        select: {
          card_id: true,
          fetched_at: true,
          source: true,
          source_provider: true,
          source_url: true,
          cm_en_lowest_nm: true,
          cm_de_lowest_nm: true,
          cm_fr_lowest_nm: true,
          cm_es_lowest_nm: true,
          cm_it_lowest_nm: true,
          cm_jp_lowest_nm: true,
          cm_en_avg_7d: true,
          cm_en_avg_30d: true,
          tcp_market: true,
          tcp_mid: true,
          tcp_low: true,
        },
      }))
    );
  }

  for (const identity of uniqueIdentities) {
    const aliases = aliasIdsByIdentity.get(identity.id) ?? new Set([identity.id]);
    const rows = allRows
      .filter((row) => aliases.has(row.card_id))
      .map((rawRow) => {
        const row = sanitizeMarketHistoryRow(rawRow);
        return row.card_id === identity.id
          ? row
          : {
              ...row,
              // The alias is shared only at the CardMarket-product level.
              // Never leak a sibling variant's TCGPlayer series into this card.
              tcp_market: null,
              tcp_mid: null,
              tcp_low: null,
            };
      })
      .sort((left, right) => {
        const time = left.fetched_at.getTime() - right.fetched_at.getTime();
        if (time !== 0) return time;
        if (left.card_id === identity.id && right.card_id !== identity.id) return 1;
        if (right.card_id === identity.id && left.card_id !== identity.id) return -1;
        return left.card_id.localeCompare(right.card_id);
      });
    result.set(identity.id, rows);
  }

  return result;
}
