import { NextRequest, NextResponse } from "next/server";
import { authErrorResponse, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma";
import { buildCardNumberSearchAliases } from "@/lib/card-search";
import {
  HIDDEN_EXPANSION_CODES,
  HIDDEN_EXPANSION_IDS,
  HIDDEN_EXPANSION_NAMES,
} from "@/lib/episodes";

const MAX_RESULTS = 100;
const FUZZY_CARD_CANDIDATE_LIMIT = 180;
const FUZZY_SEALED_CANDIDATE_LIMIT = 80;
const FUZZY_EXPANSION_CANDIDATE_LIMIT = 48;
const FUZZY_CARD_RESULT_LIMIT = Math.min(MAX_RESULTS, 36);
const FUZZY_NUMBER_CARD_CANDIDATE_LIMIT = 900;
const DIRECT_CARD_CANDIDATE_LIMIT = 400;
const DIRECT_SEALED_CANDIDATE_LIMIT = 200;

interface ParsedQuery {
  name: string | null;
  cardNumber: string | null;
  setCode: string | null;
  rawCardRef: string | null;
}

interface SearchCardRecord {
  id: string;
  name: string;
  card_number: string | null;
  rarity: string | null;
  supertype: string | null;
  image_url: string | null;
  episode: {
    id: string;
    name: string;
    code: string | null;
  };
  prices: Array<{
    cm_en_lowest_nm: number | null;
    tcp_market: number | null;
  }>;
}

interface SearchSealedRecord {
  id: string;
  name: string;
  image_url: string | null;
  cardmarket_url: string | null;
  cm_lowest: number | null;
  cm_avg_7d: number | null;
  cm_avg_30d: number | null;
  episode: {
    id: string;
    name: string;
    code: string | null;
  };
}

interface SearchExpansionRecord {
  id: string;
  name: string;
  code: string | null;
  logo_url: string | null;
}

const SET_CODE_RE = /^[a-z]{1,6}\d[\w]*$/i;
const COMPACT_CARD_REF_RE = /^([a-z]{1,8})(\d[\w/-]*)$/i;

function parseCompactCardReference(value: string): {
  setCode: string;
  cardNumber: string;
  rawCardRef: string;
} | null {
  const compact = value.trim().replace(/^#+/, "").replace(/\s+/g, "");
  const match = COMPACT_CARD_REF_RE.exec(compact);
  if (!match) return null;

  return {
    setCode: match[1],
    cardNumber: match[2],
    rawCardRef: compact,
  };
}

function parseSearchQuery(raw: string): ParsedQuery {
  const q = raw.trim();

  if (/^\d+$/.test(q)) {
    return { name: null, cardNumber: q, setCode: null, rawCardRef: null };
  }

  if (/^\d+\/\d+$/.test(q)) {
    return { name: null, cardNumber: q.split("/")[0], setCode: null, rawCardRef: null };
  }

  const withSlash = /^(.+?)\s+(\d+)\/\d+$/.exec(q);
  if (withSlash) {
    const prefix = withSlash[1].trim();
    const cardNumber = withSlash[2];

    if (SET_CODE_RE.test(prefix)) {
      return { name: null, cardNumber, setCode: prefix, rawCardRef: `${prefix}${cardNumber}` };
    }

    return { name: prefix, cardNumber, setCode: null, rawCardRef: null };
  }

  const tokens = q.split(/\s+/);
  const codeIdx = tokens.findIndex((token) => SET_CODE_RE.test(token));

  if (codeIdx !== -1 && tokens.length > 1) {
    const setCode = tokens[codeIdx];
    const nameTokens = tokens.filter((_, index) => index !== codeIdx);
    const lastToken = nameTokens[nameTokens.length - 1];

    if (/^\d+$/.test(lastToken)) {
      return {
        name: nameTokens.slice(0, -1).join(" ") || null,
        cardNumber: lastToken,
        setCode,
        rawCardRef: `${setCode}${lastToken}`,
      };
    }

    return { name: nameTokens.join(" ") || null, cardNumber: null, setCode, rawCardRef: null };
  }

  const withNumber = /^(.+?)\s+(\d+)$/.exec(q);
  if (withNumber) {
    return { name: withNumber[1], cardNumber: withNumber[2], setCode: null, rawCardRef: null };
  }

  const compactReference = parseCompactCardReference(q);
  if (compactReference) {
    return {
      name: null,
      cardNumber: compactReference.cardNumber,
      setCode: compactReference.setCode,
      rawCardRef: compactReference.rawCardRef,
    };
  }

  return { name: q || null, cardNumber: null, setCode: null, rawCardRef: null };
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = value?.trim();
    if (!normalized) continue;

    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    result.push(normalized);
  }

  return result;
}

function nameVariants(name: string): string[] {
  return [...new Set([name, name.replace(/-/g, " "), name.replace(/\s+/g, "-")])];
}

function searchTokens(value: string): string[] {
  const matches = value.match(/[\p{L}\p{N}]+/gu) ?? [];
  const seen = new Set<string>();
  const tokens: string[] = [];

  for (const match of matches) {
    const normalized = match.trim();
    if (!normalized) continue;

    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tokens.push(normalized);
  }

  return tokens;
}

function normalizeSearchText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function combineWhere<TWhere extends Record<string, unknown>>(
  operator: "AND" | "OR",
  conditions: Array<TWhere | undefined>
): TWhere | undefined {
  const filtered = conditions.filter((condition): condition is TWhere => Boolean(condition));

  if (filtered.length === 0) {
    return undefined;
  }

  if (filtered.length === 1) {
    return filtered[0];
  }

  return { [operator]: filtered } as TWhere;
}

function buildVisibleEpisodeWhere(): Prisma.EpisodeWhereInput {
  const hiddenConditions: Prisma.EpisodeWhereInput[] = [];

  if (HIDDEN_EXPANSION_IDS.length > 0) {
    hiddenConditions.push({ id: { in: [...HIDDEN_EXPANSION_IDS] } });
  }

  if (HIDDEN_EXPANSION_CODES.length > 0) {
    hiddenConditions.push({
      OR: HIDDEN_EXPANSION_CODES.map((code) => ({ code: { contains: code } })),
    });
  }

  if (HIDDEN_EXPANSION_NAMES.length > 0) {
    hiddenConditions.push({
      OR: HIDDEN_EXPANSION_NAMES.map((name) => ({ name: { contains: name } })),
    });
  }

  return hiddenConditions.length === 1 ? { NOT: hiddenConditions[0] } : { NOT: hiddenConditions };
}

const VISIBLE_EPISODE_WHERE = buildVisibleEpisodeWhere();

function episodeMatchesSetCode(setCode: string) {
  return {
    OR: [{ code: { equals: setCode } }, { name: { contains: setCode } }],
  } satisfies Prisma.EpisodeWhereInput;
}

function containsCondition(field: string, value: string) {
  return { [field]: { contains: value } } as Record<string, { contains: string }>;
}

function buildCardNumberCondition(
  cardNumber: string,
  options: { looseNumeric?: boolean } = {}
): Prisma.CardWhereInput {
  const aliases = buildCardNumberSearchAliases(cardNumber);
  if (aliases.length === 0) return { card_number: cardNumber };

  if (/^\d+$/.test(cardNumber) && !options.looseNumeric) {
    const conditions = aliases.flatMap((alias) => [
      { card_number: alias },
      { card_number: { startsWith: `${alias}/` } },
    ]);
    return conditions.length === 1 ? conditions[0] : { OR: conditions };
  }

  const conditions = aliases.map((alias) => ({ card_number: { contains: alias } }));
  return conditions.length === 1 ? conditions[0] : { OR: conditions };
}

function buildCardFreeTextCondition(query: string): Prisma.CardWhereInput {
  const conditions: Prisma.CardWhereInput[] = [nameContains<Prisma.CardWhereInput>(query)];

  if (/\d/.test(query)) {
    conditions.push(fieldContains<Prisma.CardWhereInput>(query, "card_number"));

    const compactReference = parseCompactCardReference(query);
    if (compactReference) {
      conditions.push({
        AND: [
          { episode: episodeMatchesSetCode(compactReference.setCode) },
          buildCardNumberCondition(compactReference.cardNumber),
        ],
      });
    }
  }

  return conditions.length === 1 ? conditions[0] : { OR: conditions };
}

function buildCardSearchText(card: {
  name: string;
  card_number: string | null;
  episode_name?: string | null;
  episode_code?: string | null;
  episode?: { name: string; code: string | null };
}): string {
  const episodeName = card.episode?.name ?? card.episode_name ?? "";
  const episodeCode = card.episode?.code ?? card.episode_code ?? "";
  const compactRef = episodeCode && card.card_number ? `${episodeCode}${card.card_number}` : "";
  const cardNumberAliases = buildCardNumberSearchAliases(card.card_number);
  const compactRefAliases = episodeCode
    ? cardNumberAliases.map((cardNumber) => `${episodeCode}${cardNumber}`)
    : [];

  return [card.name, card.card_number ?? "", ...cardNumberAliases, episodeName, episodeCode, compactRef, ...compactRefAliases]
    .filter(Boolean)
    .join(" ");
}

function maxFuzzyDistance(length: number): number {
  if (length <= 4) return 1;
  if (length <= 8) return 2;
  return 3;
}

function damerauLevenshteinDistance(a: string, b: string, maxDistance: number): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  if (Math.abs(a.length - b.length) > maxDistance) return maxDistance + 1;

  const matrix = Array.from({ length: a.length + 1 }, () =>
    Array<number>(b.length + 1).fill(0)
  );

  for (let i = 0; i <= a.length; i += 1) {
    matrix[i][0] = i;
  }

  for (let j = 0; j <= b.length; j += 1) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= a.length; i += 1) {
    let rowMin = maxDistance + 1;

    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;

      let value = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );

      if (
        i > 1 &&
        j > 1 &&
        a[i - 1] === b[j - 2] &&
        a[i - 2] === b[j - 1]
      ) {
        value = Math.min(value, matrix[i - 2][j - 2] + 1);
      }

      matrix[i][j] = value;
      if (value < rowMin) {
        rowMin = value;
      }
    }

    if (rowMin > maxDistance) {
      return maxDistance + 1;
    }
  }

  return matrix[a.length][b.length];
}

function fieldContains<TWhere extends Record<string, unknown>>(
  value: string,
  field = "name"
): TWhere {
  const variants = nameVariants(value);

  if (variants.length === 1) {
    return containsCondition(field, value) as unknown as TWhere;
  }

  return {
    OR: variants.map((variant) => containsCondition(field, variant)),
  } as unknown as TWhere;
}

function nameContains<TWhere extends Record<string, unknown>>(name: string, field = "name"): TWhere {
  const tokens = searchTokens(name);

  if (tokens.length <= 1) {
    return fieldContains<TWhere>(name, field);
  }

  return {
    OR: [
      fieldContains<TWhere>(name, field),
      { AND: tokens.map((token) => fieldContains<Record<string, unknown>>(token, field)) },
    ],
  } as unknown as TWhere;
}

function sealedNameContains(name: string): Prisma.SealedProductWhereInput {
  const tokens = searchTokens(name);

  if (tokens.length <= 1) {
    return {
      OR: [
        fieldContains<Prisma.SealedProductWhereInput>(name),
        { episode: fieldContains<Prisma.EpisodeWhereInput>(name, "name") },
      ],
    };
  }

  return {
    OR: [
      {
        OR: [
          fieldContains<Prisma.SealedProductWhereInput>(name),
          { episode: fieldContains<Prisma.EpisodeWhereInput>(name, "name") },
        ],
      },
      {
        AND: tokens.map((token) => ({
          OR: [
            fieldContains<Prisma.SealedProductWhereInput>(token),
            { episode: fieldContains<Prisma.EpisodeWhereInput>(token, "name") },
          ],
        })),
      },
    ],
  };
}

function relevanceScore(value: string, rawQuery: string): number {
  const query = rawQuery.trim().toLowerCase();
  const valueLower = value.toLowerCase();
  const tokens = searchTokens(rawQuery).map((token) => token.toLowerCase());
  let score = 0;

  if (!query) return score;

  if (valueLower === query) score += 220;
  if (valueLower.startsWith(query)) score += 120;
  else if (valueLower.includes(query)) score += 70;

  for (const token of tokens) {
    if (valueLower.startsWith(token)) score += 18;
    else if (valueLower.includes(token)) score += 8;
  }

  return score;
}

function fuzzyRelevanceScore(value: string, rawQuery: string): number {
  const normalizedValue = normalizeSearchText(value);
  const normalizedQuery = normalizeSearchText(rawQuery);

  if (!normalizedValue || !normalizedQuery) return 0;

  let score = relevanceScore(normalizedValue, normalizedQuery);
  const queryTokens = normalizedQuery.split(" ").filter(Boolean);
  const valueTokens = normalizedValue.split(" ").filter(Boolean);

  if (queryTokens.length === 0 || valueTokens.length === 0) {
    return score;
  }

  let tokenScore = 0;

  for (const queryToken of queryTokens) {
    const maxDistance = maxFuzzyDistance(queryToken.length);
    let bestDistance = maxDistance + 1;
    let bestLengthDiff = Number.POSITIVE_INFINITY;

    for (const valueToken of valueTokens) {
      const lengthDiff = Math.abs(valueToken.length - queryToken.length);
      if (lengthDiff > maxDistance) continue;

      const distance = damerauLevenshteinDistance(queryToken, valueToken, maxDistance);
      if (
        distance < bestDistance ||
        (distance === bestDistance && lengthDiff < bestLengthDiff)
      ) {
        bestDistance = distance;
        bestLengthDiff = lengthDiff;
      }
    }

    if (bestDistance > maxDistance) {
      tokenScore = 0;
      break;
    }

    tokenScore += 115 - bestDistance * 28 - bestLengthDiff * 6;
  }

  if (tokenScore > 0) {
    score = Math.max(score, tokenScore + (queryTokens.length > 1 ? 20 : 0));
  }

  const compactValue = normalizedValue.replace(/\s+/g, "");
  const compactQuery = normalizedQuery.replace(/\s+/g, "");
  const maxWholeDistance = maxFuzzyDistance(compactQuery.length);
  const wholeDistance = damerauLevenshteinDistance(
    compactQuery,
    compactValue,
    maxWholeDistance
  );

  if (wholeDistance <= maxWholeDistance) {
    score = Math.max(
      score,
      170 - wholeDistance * 34 - Math.abs(compactValue.length - compactQuery.length) * 3
    );
  }

  return score;
}

function compareRelevance(aScore: number, bScore: number): number {
  return bScore - aScore;
}

function comparePriceDesc(aPrice: number | null | undefined, bPrice: number | null | undefined) {
  const aValue = aPrice ?? -1;
  const bValue = bPrice ?? -1;
  return bValue - aValue;
}

function compareSingleSearchPriceDesc(
  a: { cm_en_lowest_nm: number | null; tcp_market: number | null },
  b: { cm_en_lowest_nm: number | null; tcp_market: number | null }
) {
  const cardMarketDiff = comparePriceDesc(a.cm_en_lowest_nm, b.cm_en_lowest_nm);
  if (cardMarketDiff !== 0) return cardMarketDiff;

  return comparePriceDesc(a.tcp_market, b.tcp_market);
}

function buildFuzzyTokenFragments(token: string): string[] {
  const normalized = token.trim();
  if (!normalized) return [];

  return uniqueStrings([
    normalized,
    normalized.slice(0, Math.min(4, normalized.length)),
    normalized.slice(0, Math.min(3, normalized.length)),
    normalized.length > 3 ? normalized.slice(0, 2) : null,
  ]).filter((fragment) => fragment.length >= 2);
}

function buildFuzzyTextFragments(rawQuery: string): string[] {
  const tokens = searchTokens(rawQuery);

  return uniqueStrings([
    tokens.length > 1 ? tokens.join(" ") : null,
    ...tokens.flatMap(buildFuzzyTokenFragments),
  ]).filter((fragment) => fragment.length >= 2);
}

function buildFuzzyCardCandidateWhere(
  rawQuery: string,
  parsed: ParsedQuery
): Prisma.CardWhereInput | undefined {
  const textFragments = buildFuzzyTextFragments(rawQuery);
  const conditions: Prisma.CardWhereInput[] = [];

  if (parsed.setCode && parsed.cardNumber) {
    conditions.push({
      AND: [
        { episode: episodeMatchesSetCode(parsed.setCode) },
        buildCardNumberCondition(parsed.cardNumber),
      ],
    });
  } else {
    if (parsed.setCode) {
      conditions.push({ episode: episodeMatchesSetCode(parsed.setCode) });
    }

    if (parsed.cardNumber) {
      conditions.push(buildCardNumberCondition(parsed.cardNumber, { looseNumeric: true }));
    }
  }

  for (const fragment of textFragments) {
    conditions.push(fieldContains<Prisma.CardWhereInput>(fragment));
    conditions.push({ episode: fieldContains<Prisma.EpisodeWhereInput>(fragment, "name") });
    conditions.push({
      episode: fieldContains<Prisma.EpisodeWhereInput>(fragment.toUpperCase(), "code"),
    });
  }

  return combineWhere("OR", conditions);
}

function buildFuzzyNumberCardCandidateWhere(parsed: ParsedQuery): Prisma.CardWhereInput | undefined {
  if (!parsed.name || !parsed.cardNumber) return undefined;

  return buildCardNumberCondition(parsed.cardNumber, { looseNumeric: true });
}

function buildFuzzySealedCandidateWhere(
  rawQuery: string,
  parsed: ParsedQuery
): Prisma.SealedProductWhereInput | undefined {
  const textFragments = buildFuzzyTextFragments(rawQuery);
  const conditions: Prisma.SealedProductWhereInput[] = [];

  if (parsed.setCode) {
    conditions.push({ episode: episodeMatchesSetCode(parsed.setCode) });
  }

  for (const fragment of textFragments) {
    conditions.push(fieldContains<Prisma.SealedProductWhereInput>(fragment));
    conditions.push({ episode: fieldContains<Prisma.EpisodeWhereInput>(fragment, "name") });
    conditions.push({
      episode: fieldContains<Prisma.EpisodeWhereInput>(fragment.toUpperCase(), "code"),
    });
  }

  return combineWhere("OR", conditions);
}

function buildFuzzyExpansionCandidateWhere(rawQuery: string): Prisma.EpisodeWhereInput | undefined {
  const textFragments = buildFuzzyTextFragments(rawQuery);
  const conditions: Prisma.EpisodeWhereInput[] = [];

  for (const fragment of textFragments) {
    conditions.push(fieldContains<Prisma.EpisodeWhereInput>(fragment, "name"));
    conditions.push(fieldContains<Prisma.EpisodeWhereInput>(fragment.toUpperCase(), "code"));
  }

  return combineWhere("OR", conditions);
}

function formatSingleResults(cards: SearchCardRecord[], relevanceQuery: string) {
  return cards
    .map((card) => ({
      id: card.id,
      name: card.name,
      card_number: card.card_number,
      rarity: card.rarity,
      supertype: card.supertype,
      image_url: card.image_url,
      episode_id: card.episode.id,
      episode_name: card.episode.name,
      episode_code: card.episode.code,
      cm_en_lowest_nm: card.prices[0]?.cm_en_lowest_nm ?? null,
      tcp_market: card.prices[0]?.tcp_market ?? null,
    }))
    .sort((a, b) => {
      const priceDiff = compareSingleSearchPriceDesc(a, b);
      if (priceDiff !== 0) return priceDiff;

      if (relevanceQuery.trim()) {
        const scoreDiff = compareRelevance(
          relevanceScore(buildCardSearchText(a), relevanceQuery),
          relevanceScore(buildCardSearchText(b), relevanceQuery)
        );
        if (scoreDiff !== 0) return scoreDiff;
      }

      const nameCmp = a.name.localeCompare(b.name, "nl", { sensitivity: "base" });
      if (nameCmp !== 0) return nameCmp;

      return (a.card_number ?? "").localeCompare(b.card_number ?? "", "nl", {
        numeric: true,
        sensitivity: "base",
      });
    });
}

function formatSealedResults(sealed: SearchSealedRecord[], relevanceQuery: string) {
  return sealed
    .map((product) => ({
      id: product.id,
      name: product.name,
      image_url: product.image_url,
      cardmarket_url: product.cardmarket_url,
      cm_lowest: product.cm_lowest,
      cm_avg_7d: product.cm_avg_7d,
      cm_avg_30d: product.cm_avg_30d,
      episode: product.episode,
    }))
    .sort((a, b) => {
      const priceDiff = comparePriceDesc(a.cm_lowest, b.cm_lowest);
      if (priceDiff !== 0) return priceDiff;

      const aScore =
        relevanceScore(a.name, relevanceQuery) +
        Math.floor(relevanceScore(a.episode.name, relevanceQuery) / 2);
      const bScore =
        relevanceScore(b.name, relevanceQuery) +
        Math.floor(relevanceScore(b.episode.name, relevanceQuery) / 2);
      const scoreDiff = compareRelevance(aScore, bScore);
      if (scoreDiff !== 0) return scoreDiff;

      return a.name.localeCompare(b.name, "nl", { sensitivity: "base" });
    });
}

function formatExpansionResults(expansions: SearchExpansionRecord[], relevanceQuery: string) {
  return expansions.sort((a, b) => {
    const scoreDiff = compareRelevance(
      relevanceScore(a.name, relevanceQuery),
      relevanceScore(b.name, relevanceQuery)
    );
    if (scoreDiff !== 0) return scoreDiff;

    return a.name.localeCompare(b.name, "nl", { sensitivity: "base" });
  });
}

async function runFuzzyFallback(rawQuery: string, parsed: ParsedQuery) {
  const normalizedQuery = normalizeSearchText(rawQuery);
  if (normalizedQuery.length < 4) {
    return { singles: [], sealed: [], expansions: [], total: 0, fuzzy: false };
  }

  const [cardCandidates, sealedCandidates, expansionCandidates] = await Promise.all([
    db.card.findMany({
      where: combineWhere("AND", [
        { episode: VISIBLE_EPISODE_WHERE },
        buildFuzzyCardCandidateWhere(rawQuery, parsed),
      ]),
      take: FUZZY_CARD_CANDIDATE_LIMIT,
      orderBy: [{ episode: { release_date: "desc" } }, { name: "asc" }, { card_number: "asc" }],
      select: {
        id: true,
        name: true,
        card_number: true,
        rarity: true,
        supertype: true,
        image_url: true,
        episode: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
      },
    }),
    db.sealedProduct.findMany({
      where: combineWhere("AND", [
        { episode: VISIBLE_EPISODE_WHERE },
        buildFuzzySealedCandidateWhere(rawQuery, parsed),
      ]),
      take: FUZZY_SEALED_CANDIDATE_LIMIT,
      orderBy: [{ episode: { release_date: "desc" } }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        image_url: true,
        cardmarket_url: true,
        cm_lowest: true,
        cm_avg_7d: true,
        cm_avg_30d: true,
        episode: { select: { id: true, name: true, code: true } },
      },
    }),
    db.episode.findMany({
      where: combineWhere("AND", [
        VISIBLE_EPISODE_WHERE,
        buildFuzzyExpansionCandidateWhere(rawQuery),
      ]),
      select: { id: true, name: true, code: true, logo_url: true },
      take: FUZZY_EXPANSION_CANDIDATE_LIMIT,
      orderBy: { release_date: "desc" },
    }),
  ]);
  const numberCardCandidateWhere = buildFuzzyNumberCardCandidateWhere(parsed);
  const numberCardCandidates = numberCardCandidateWhere
    ? await db.card.findMany({
        where: combineWhere("AND", [
          { episode: VISIBLE_EPISODE_WHERE },
          numberCardCandidateWhere,
        ]),
        take: FUZZY_NUMBER_CARD_CANDIDATE_LIMIT,
        orderBy: [{ name: "asc" }, { episode: { release_date: "desc" } }, { card_number: "asc" }],
        select: {
          id: true,
          name: true,
          card_number: true,
          rarity: true,
          supertype: true,
          image_url: true,
          episode: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
        },
      })
    : [];
  const cardCandidateById = new Map(
    [...cardCandidates, ...numberCardCandidates].map((card) => [card.id, card])
  );

  const topCardIds = [...cardCandidateById.values()]
    .map((card) => ({
      id: card.id,
      score: fuzzyRelevanceScore(buildCardSearchText(card), rawQuery),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => compareRelevance(a.score, b.score))
    .slice(0, FUZZY_CARD_RESULT_LIMIT)
    .map((entry) => entry.id);

  const detailedCards = topCardIds.length
    ? await db.card.findMany({
        where: {
          id: { in: topCardIds },
        },
        select: {
          id: true,
          name: true,
          card_number: true,
          rarity: true,
          supertype: true,
          image_url: true,
          episode: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
          prices: {
            orderBy: { fetched_at: "desc" },
            take: 1,
            select: { cm_en_lowest_nm: true, tcp_market: true },
          },
        },
      })
    : [];
  const detailedCardById = new Map(detailedCards.map((card) => [card.id, card]));
  const singles = topCardIds
    .map((id) => detailedCardById.get(id))
    .filter((card): card is SearchCardRecord => Boolean(card));

  const sealed = sealedCandidates
    .map((product) => ({
      product,
      score:
        fuzzyRelevanceScore(product.name, rawQuery) +
        Math.floor(fuzzyRelevanceScore(product.episode.name, rawQuery) / 2),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => compareRelevance(a.score, b.score))
    .slice(0, 18)
    .map((entry) => entry.product);

  const expansions = expansionCandidates
    .map((episode) => ({
      episode,
      score: fuzzyRelevanceScore(episode.name, rawQuery),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => compareRelevance(a.score, b.score))
    .slice(0, 12)
    .map((entry) => entry.episode);

  const formattedSingles = formatSingleResults(singles, rawQuery);
  const formattedSealed = formatSealedResults(sealed, rawQuery);
  const formattedExpansions = formatExpansionResults(expansions, rawQuery);

  return {
    singles: formattedSingles,
    sealed: formattedSealed,
    expansions: formattedExpansions,
    total:
      formattedSingles.length + formattedSealed.length + formattedExpansions.length,
    fuzzy: true,
  };
}

const SEARCH_QUERY_MAX_LENGTH = 200;

export async function GET(req: NextRequest) {
  try {
    await requireUser();
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: "Authentication failed" }, { status: 500 });
  }

  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";

  if (q.length === 0) {
    return NextResponse.json({ singles: [], sealed: [], expansions: [], total: 0 });
  }

  if (q.length > SEARCH_QUERY_MAX_LENGTH) {
    return NextResponse.json(
      { error: `Query too long (max ${SEARCH_QUERY_MAX_LENGTH} chars)` },
      { status: 400 }
    );
  }

  try {
    const parsed = parseSearchQuery(q);
    const { name, cardNumber, setCode, rawCardRef } = parsed;

    // SQLite LIKE is already case-insensitive for ASCII, so we do not use mode:"insensitive".
    const cardAndConditions: Array<Record<string, unknown>> = [];

    if (name) {
      cardAndConditions.push(buildCardFreeTextCondition(name));
    }

    if (cardNumber) {
      if (setCode) {
        const referenceConditions: Array<Record<string, unknown>> = [
          {
            AND: [
              { episode: episodeMatchesSetCode(setCode) },
              buildCardNumberCondition(cardNumber, { looseNumeric: Boolean(name) }),
            ],
          },
        ];

        if (rawCardRef) {
          referenceConditions.push({ card_number: { contains: rawCardRef } });
        }

        cardAndConditions.push(
          referenceConditions.length === 1 ? referenceConditions[0] : { OR: referenceConditions }
        );
      } else {
        cardAndConditions.push(
          buildCardNumberCondition(cardNumber, { looseNumeric: Boolean(name) })
        );
      }
    } else if (setCode) {
      cardAndConditions.push({ episode: episodeMatchesSetCode(setCode) });
    }

    const cardWhere: Prisma.CardWhereInput | undefined =
      cardAndConditions.length === 0
        ? undefined
        : cardAndConditions.length === 1
          ? (cardAndConditions[0] as Prisma.CardWhereInput)
          : { AND: cardAndConditions as Prisma.CardWhereInput[] };

    const shouldSearchSealed = Boolean((name || setCode) && !cardNumber);
    const shouldSearchExpansions = Boolean(name && !setCode && !cardNumber);
    const expansionQuery = shouldSearchExpansions ? name ?? "" : "";
    const expansionNameVariants = shouldSearchExpansions ? nameVariants(expansionQuery) : [];

    const sealedWhere: Prisma.SealedProductWhereInput | undefined =
      name && setCode
        ? {
            AND: [sealedNameContains(name), { episode: episodeMatchesSetCode(setCode) }],
          }
        : name
          ? sealedNameContains(name)
          : setCode
            ? { episode: episodeMatchesSetCode(setCode) }
            : undefined;

    const visibleCardWhere = combineWhere<Prisma.CardWhereInput>("AND", [
      { episode: VISIBLE_EPISODE_WHERE },
      cardWhere,
    ]);
    const visibleSealedWhere = combineWhere<Prisma.SealedProductWhereInput>("AND", [
      { episode: VISIBLE_EPISODE_WHERE },
      sealedWhere,
    ]);
    const visibleExpansionWhere = shouldSearchExpansions
      ? combineWhere<Prisma.EpisodeWhereInput>("AND", [
          VISIBLE_EPISODE_WHERE,
          expansionNameVariants.length === 1
            ? { name: { contains: expansionQuery } }
            : {
                OR: expansionNameVariants.map((variant) => ({
                  name: { contains: variant },
                })),
              },
        ])
      : undefined;

    const [cards, sealed, expansions] = await Promise.all([
      db.card.findMany({
        where: visibleCardWhere,
        take: DIRECT_CARD_CANDIDATE_LIMIT,
        select: {
          id: true,
          name: true,
          card_number: true,
          rarity: true,
          supertype: true,
          image_url: true,
          episode: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
          prices: {
            orderBy: { fetched_at: "desc" },
            take: 1,
            select: { cm_en_lowest_nm: true, tcp_market: true },
          },
        },
        orderBy: [{ episode: { release_date: "desc" } }, { card_number: "asc" }],
      }),

      shouldSearchSealed
        ? db.sealedProduct.findMany({
            where: visibleSealedWhere,
            take: DIRECT_SEALED_CANDIDATE_LIMIT,
            select: {
              id: true,
              name: true,
              image_url: true,
              cardmarket_url: true,
              cm_lowest: true,
              cm_avg_7d: true,
              cm_avg_30d: true,
              episode: { select: { id: true, name: true, code: true } },
            },
            orderBy: { episode: { release_date: "desc" } },
          })
        : Promise.resolve([]),

      shouldSearchExpansions
        ? db.episode.findMany({
            where: visibleExpansionWhere,
            select: { id: true, name: true, code: true, logo_url: true },
            orderBy: { release_date: "desc" },
            take: 20,
          })
        : Promise.resolve([]),
    ]);

    const relevanceQuery = name ?? q;
    const singles = formatSingleResults(cards, relevanceQuery).slice(0, MAX_RESULTS);
    const sealedResults = formatSealedResults(sealed, relevanceQuery).slice(0, MAX_RESULTS);
    const expansionResults = formatExpansionResults(expansions, relevanceQuery);
    const total = singles.length + sealedResults.length + expansionResults.length;

    if (total === 0) {
      const fuzzyResults = await runFuzzyFallback(q, parsed);

      return NextResponse.json({
        ...fuzzyResults,
        parsed,
      });
    }

    return NextResponse.json({
      singles,
      sealed: sealedResults,
      expansions: expansionResults,
      total,
      fuzzy: false,
      parsed,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[search]", msg);
    return NextResponse.json(
      { singles: [], sealed: [], expansions: [], total: 0, error: msg },
      { status: 500 }
    );
  }
}
