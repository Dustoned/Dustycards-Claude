import { db } from "@/lib/db";

const SQLITE_SAFE_CHUNK_SIZE = 200;

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
 * Only accept a sibling when set, game, normalized name and collector number
 * all agree. This admits provider hand-offs such as 157 -> 157a while keeping
 * unrelated cards that accidentally share a CardMarket id isolated.
 */
export function isSafeCardMarketHistoryAlias(
  identity: CardMarketHistoryIdentity,
  candidate: CardMarketAliasCandidate
): boolean {
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

  const latestRowsByCardId = new Map<string, CardMarketHistoryPriceRow>();
  for (let index = 0; index < allCardIds.length; index += SQLITE_SAFE_CHUNK_SIZE) {
    const cards = await db.card.findMany({
      where: { id: { in: allCardIds.slice(index, index + SQLITE_SAFE_CHUNK_SIZE) } },
      select: {
        id: true,
        prices: {
          where: { cm_en_lowest_nm: { gt: 0, not: 9001 } },
          orderBy: [{ fetched_at: "desc" }, { id: "desc" }],
          take: 1,
          select: {
            fetched_at: true,
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
        },
      },
    });
    for (const card of cards) {
      const row = card.prices[0];
      if (!row || !isUsableEnglishNmValue(row.cm_en_lowest_nm)) continue;
      latestRowsByCardId.set(card.id, { card_id: card.id, ...row });
    }
  }

  for (const identity of uniqueIdentities) {
    const aliases = aliasIdsByIdentity.get(identity.id) ?? new Set([identity.id]);
    let latest: CardMarketHistoryPriceRow | null = null;
    for (const aliasId of aliases) {
      const source = latestRowsByCardId.get(aliasId);
      if (!source) continue;
      const row =
        aliasId === identity.id
          ? source
          : { ...source, tcp_market: null, tcp_mid: null, tcp_low: null };
      const isNewer = !latest || row.fetched_at.getTime() > latest.fetched_at.getTime();
      const isExactTie =
        latest &&
        row.fetched_at.getTime() === latest.fetched_at.getTime() &&
        row.card_id === identity.id &&
        latest.card_id !== identity.id;
      if (isNewer || isExactTie) latest = row;
    }
    result.set(identity.id, latest ? getLatestSafeEnglishNmPrice([latest]) : null);
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
      .map((row) =>
        row.card_id === identity.id
          ? row
          : {
              ...row,
              // The alias is shared only at the CardMarket-product level.
              // Never leak a sibling variant's TCGPlayer series into this card.
              tcp_market: null,
              tcp_mid: null,
              tcp_low: null,
            }
      )
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
