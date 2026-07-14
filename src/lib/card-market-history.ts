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

export async function loadSafeCardMarketHistoryRows(
  identities: readonly CardMarketHistoryIdentity[],
  options: { fetchedAtGte?: Date; fetchedAtLte?: Date } = {}
): Promise<Map<string, CardMarketHistoryPriceRow[]>> {
  const result = new Map<string, CardMarketHistoryPriceRow[]>();
  if (identities.length === 0) return result;

  const uniqueIdentities = [...new Map(identities.map((item) => [item.id, item])).values()];
  for (const identity of uniqueIdentities) {
    result.set(identity.id, []);
  }

  const candidates: CardMarketAliasCandidate[] = [];
  const withMarketId = uniqueIdentities.filter((identity) => identity.cardmarketId);
  for (let index = 0; index < withMarketId.length; index += 50) {
    const chunk = withMarketId.slice(index, index + 50);
    candidates.push(
      ...(await db.card.findMany({
        where: {
          OR: chunk.map((identity) => ({
            game: identity.game,
            episode_id: identity.episodeId,
            cardmarket_id: identity.cardmarketId,
          })),
        },
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

  const aliasIdsByIdentity = new Map<string, Set<string>>();
  for (const identity of uniqueIdentities) {
    const ids = new Set<string>([identity.id]);
    for (const candidate of candidates) {
      if (isSafeCardMarketHistoryAlias(identity, candidate)) ids.add(candidate.id);
    }
    aliasIdsByIdentity.set(identity.id, ids);
  }

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
