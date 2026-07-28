import { NextRequest, NextResponse } from "next/server";
import { authErrorResponse, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma";
import { buildCardNumberSearchAliases } from "@/lib/card-search";
import {
  HIDDEN_EXPANSION_CODES,
  HIDDEN_EXPANSION_IDS,
  HIDDEN_EXPANSION_NAMES,
  REDUNDANT_SUBSET_PATTERNS,
} from "@/lib/episodes";
import {
  ALL_GAMES,
  GAME_SEARCH_PARAM,
  ONE_PIECE_GAME,
  POKEMON_GAME,
  parseVisibleGameFilter,
  type TradingCardGame,
  type TradingCardGameFilter,
} from "@/lib/games";
import { getServerUserSettings } from "@/lib/user-settings-server";
import { getDisplayCardNumber } from "@/lib/card-number-display";

const MAX_RESULTS = 100;
const FUZZY_CARD_CANDIDATE_LIMIT = 180;
const FUZZY_SEALED_CANDIDATE_LIMIT = 80;
const FUZZY_EXPANSION_CANDIDATE_LIMIT = 48;
const FUZZY_CARD_RESULT_LIMIT = Math.min(MAX_RESULTS, 36);
const FUZZY_NUMBER_CARD_CANDIDATE_LIMIT = 900;
const DIRECT_CARD_CANDIDATE_LIMIT = 400;
const DIRECT_SEALED_CANDIDATE_LIMIT = 200;
const FUZZY_EXPANSION_MULTI_TOKEN_MIN_SCORE = 60;

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
  printed_card_number: string | null;
  rarity: string | null;
  supertype: string | null;
  image_url: string | null;
  episode: {
    id: string;
    name: string;
    code: string | null;
    release_date: string | null;
  };
  prices: Array<{
    cm_en_lowest_nm: number | null;
    cm_jp_lowest_nm: number | null;
    tcp_market: number | null;
  }>;
  wants: Array<{
    id: string;
    created_at: Date;
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
    release_date: string | null;
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
const ONE_PIECE_DIRECT_CARD_REF_RE = /^#?\s*((?:(?:op|st|eb|prb)\d{1,2})|p)\s*[-\s]\s*([a-z]?\d{1,4}[a-z]?)\s*$/i;
const ONE_PIECE_COMPACT_CARD_REF_RE = /^#?\s*([a-z]{1,4}\d{0,2})(\d{3}[a-z]?)\s*$/i;
const ONE_PIECE_SET_CODE_RE = /^#?\s*(op|st|eb|prb)\s*[-_\s]?\s*(\d{1,2})\s*$/i;
const PLAIN_SET_CODE_RE = /^[a-z]{2,4}$/i;
// Letter prefixes used inside stored Pokemon card numbers, either compact
// ("SWSH209", "TG12", "SV105") or space-separated ("SVP 209", "MEP 001").
const LETTER_PREFIXED_NUMBER_PREFIXES = [
  "BW",
  "DP",
  "GG",
  "H",
  "HGSS",
  "MEP",
  "RC",
  "RT",
  "SH",
  "SL",
  "SM",
  "SV",
  "SWSH",
  "TG",
  "XY",
];
// These read as set codes even when typed in lowercase ("svp 209"); they are
// number prefixes, never Pokemon name words.
const PROMO_SET_CODE_TOKENS = new Set([
  "bw",
  "dp",
  "gg",
  "hgss",
  "mep",
  "sm",
  "sv",
  "svp",
  "swsh",
  "tg",
  "xy",
]);
const NON_SET_CODE_TOKENS = new Set([
  "and",
  "card",
  "ex",
  "gx",
  "set",
  "star",
  "the",
  "v",
  "vmax",
  "vstar",
]);

function extractSearchableInput(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";

  try {
    const url = new URL(trimmed);
    const segments = url.pathname.split("/").filter(Boolean);
    const lastSegment = segments[segments.length - 1];
    if (lastSegment) return decodeURIComponent(lastSegment);
  } catch {
    // Plain search text, not a URL.
  }

  return trimmed;
}

function normalizeSlugSeparators(value: string): string {
  return value.trim().replace(/[-_]+/g, " ").replace(/\s+/g, " ");
}

function isLikelySetCodeToken(value: string): boolean {
  const token = value.trim();
  if (!token) return false;

  const normalized = token.toLowerCase();
  if (NON_SET_CODE_TOKENS.has(normalized)) return false;
  if (PROMO_SET_CODE_TOKENS.has(normalized)) return true;

  // Plain words such as Mew, Mega, Iron, Team and Dark are card-name tokens,
  // not set codes. An alphabetic code is only safe as a structured hint when
  // the user wrote it explicitly in uppercase (for example "SHF 73").
  return SET_CODE_RE.test(token) || (PLAIN_SET_CODE_RE.test(token) && token === token.toUpperCase());
}

type SearchRankingMode = "direct" | "fuzzy";

function isUnambiguousSetCodeToken(value: string): boolean {
  return SET_CODE_RE.test(value.trim());
}

function parseCompactCardReference(value: string): {
  setCode: string;
  cardNumber: string;
  rawCardRef: string;
} | null {
  const compact = value.trim().replace(/^#+/, "").replace(/\s+/g, "");
  const match = COMPACT_CARD_REF_RE.exec(compact);
  if (!match) return null;

  // Compact references are useful (for example swsh001), but long prefixes
  // are overwhelmingly card names such as Porygon2 rather than set codes.
  const prefix = match[1];
  const isKnownShortPrefix = /^(?:op|st|eb|prb)$/i.test(prefix);
  if ((!isKnownShortPrefix && prefix.length < 3) || prefix.length > 5) return null;

  return {
    setCode: match[1],
    cardNumber: match[2],
    rawCardRef: compact,
  };
}

function normalizeOnePieceSetCode(value: string): string {
  const cleaned = value.trim().replace(/^#+/, "").replace(/[-_\s]+/g, "").toUpperCase();
  const match = /^(OP|ST|EB|PRB)(\d{1,2})$/.exec(cleaned);
  if (!match) return cleaned;

  return `${match[1]}${match[2].padStart(2, "0")}`;
}

function parseOnePieceSetCode(raw: string): string | null {
  const q = extractSearchableInput(raw).trim();
  const match = ONE_PIECE_SET_CODE_RE.exec(q);
  if (!match) return null;

  return `${match[1].toUpperCase()}${match[2].padStart(2, "0")}`;
}

function parseOnePieceCardReference(raw: string): ParsedQuery | null {
  const q = extractSearchableInput(raw).trim();
  if (!q) return null;

  const directMatch = ONE_PIECE_DIRECT_CARD_REF_RE.exec(q);
  if (directMatch) {
    const setCode = normalizeOnePieceSetCode(directMatch[1]);
    const cardNumber = directMatch[2].toUpperCase();
    return {
      name: null,
      cardNumber,
      setCode,
      rawCardRef: `${setCode}-${cardNumber}`,
    };
  }

  const compactMatch = ONE_PIECE_COMPACT_CARD_REF_RE.exec(q.replace(/[-\s_]+/g, ""));
  if (compactMatch) {
    const setCode = normalizeOnePieceSetCode(compactMatch[1]);
    const cardNumber = compactMatch[2].toUpperCase();
    return {
      name: null,
      cardNumber,
      setCode,
      rawCardRef: `${setCode}-${cardNumber}`,
    };
  }

  return null;
}

function parseCompactPrintedCardNumber(value: string): string | null {
  const normalized = value.trim().replace(/^#+/, "");
  if (!/^\d{4,6}$/.test(normalized)) return null;

  const totalDigits = normalized.slice(-3);
  const cardDigits = normalized.slice(0, -3);
  if (!cardDigits || totalDigits === "000") return null;

  return `${cardDigits}/${totalDigits}`;
}

function parseSearchQuery(raw: string, game: TradingCardGame = POKEMON_GAME): ParsedQuery {
  if (game === ONE_PIECE_GAME) {
    const onePieceReference = parseOnePieceCardReference(raw);
    if (onePieceReference) return onePieceReference;

    const onePieceSetCode = parseOnePieceSetCode(raw);
    if (onePieceSetCode) {
      return { name: null, cardNumber: null, setCode: onePieceSetCode, rawCardRef: null };
    }
  }

  const q = extractSearchableInput(raw);
  const spacedQ = normalizeSlugSeparators(q).replace(/\s*\/\s*/g, "/");

  const compactPrintedNumber = parseCompactPrintedCardNumber(spacedQ);
  if (compactPrintedNumber) {
    return { name: null, cardNumber: compactPrintedNumber, setCode: null, rawCardRef: null };
  }

  const plainNumber = /^#?(\d+)$/.exec(spacedQ);
  if (plainNumber) {
    return { name: null, cardNumber: plainNumber[1], setCode: null, rawCardRef: null };
  }

  const slashNumber = /^#?(\d+\/\d+)$/.exec(spacedQ);
  if (slashNumber) {
    return { name: null, cardNumber: slashNumber[1], setCode: null, rawCardRef: null };
  }

  const spacedPrintedNumber = /^#?(\d+)\s+(\d+)$/.exec(spacedQ);
  if (spacedPrintedNumber) {
    return {
      name: null,
      cardNumber: `${spacedPrintedNumber[1]}/${spacedPrintedNumber[2]}`,
      setCode: null,
      rawCardRef: null,
    };
  }

  const withSlash = /^(.+?)\s+#?(\d+\/\d+)$/.exec(spacedQ);
  if (withSlash) {
    const prefix = withSlash[1].trim();
    const cardNumber = withSlash[2];

    if (isLikelySetCodeToken(prefix)) {
      return { name: null, cardNumber, setCode: prefix, rawCardRef: `${prefix}${cardNumber}` };
    }

    return { name: prefix, cardNumber, setCode: null, rawCardRef: null };
  }

  const withSpacedPrintedNumber = /^(.+?)\s+#?(\d+)\s+(\d+)$/.exec(spacedQ);
  if (withSpacedPrintedNumber) {
    const prefix = withSpacedPrintedNumber[1].trim();
    const cardNumber = `${withSpacedPrintedNumber[2]}/${withSpacedPrintedNumber[3]}`;

    if (isLikelySetCodeToken(prefix)) {
      return { name: null, cardNumber, setCode: prefix, rawCardRef: `${prefix}${cardNumber}` };
    }

    return { name: prefix, cardNumber, setCode: null, rawCardRef: null };
  }

  const withCompactPrintedNumber = /^(.+?)\s+#?(\d{4,6})$/.exec(spacedQ);
  if (withCompactPrintedNumber) {
    const cardNumber = parseCompactPrintedCardNumber(withCompactPrintedNumber[2]);
    if (cardNumber) {
      const prefix = withCompactPrintedNumber[1].trim();
      if (isLikelySetCodeToken(prefix)) {
        return { name: null, cardNumber, setCode: prefix, rawCardRef: `${prefix}${cardNumber}` };
      }

      return { name: prefix, cardNumber, setCode: null, rawCardRef: null };
    }
  }

  const tokens = spacedQ.split(/\s+/);
  const trailingNumber = /^(.+?)\s+(\d+)$/.exec(spacedQ);
  if (trailingNumber) {
    const prefixTokens = trailingNumber[1].trim().split(/\s+/).filter(Boolean);
    const possibleSetCode = prefixTokens[prefixTokens.length - 1];

    if (possibleSetCode && isLikelySetCodeToken(possibleSetCode)) {
      const name = prefixTokens.slice(0, -1).join(" ");
      const cardNumber = trailingNumber[2];

      return {
        name: name || null,
        cardNumber,
        setCode: possibleSetCode,
        rawCardRef: `${possibleSetCode}${cardNumber}`,
      };
    }
  }

  const codeIdx = tokens.findIndex((token) => isUnambiguousSetCodeToken(token));

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

  const withNumber = /^(.+?)\s+(\d+)$/.exec(spacedQ);
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

  return { name: spacedQ || null, cardNumber: null, setCode: null, rawCardRef: null };
}

function isExactOnePieceReferenceSearch(
  parsed: ParsedQuery,
  game: TradingCardGame
): boolean {
  return game === ONE_PIECE_GAME && Boolean(parsed.setCode && parsed.cardNumber && parsed.rawCardRef);
}

function isExactPrintedCardNumberSearch(parsed: ParsedQuery): boolean {
  return Boolean(parsed.cardNumber?.includes("/"));
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

function buildVisibleEpisodeWhere(
  game: TradingCardGame = POKEMON_GAME,
  options?: { includeGame?: boolean }
): Prisma.EpisodeWhereInput {
  const hiddenConditions: Prisma.EpisodeWhereInput[] = [];
  const visibleGameWhere: Prisma.EpisodeWhereInput | undefined =
    options?.includeGame === false ? undefined : { game };

  if (HIDDEN_EXPANSION_IDS.length > 0) {
    hiddenConditions.push({ id: { in: [...HIDDEN_EXPANSION_IDS] } });
  }

  if (HIDDEN_EXPANSION_CODES.length > 0) {
    hiddenConditions.push({
      AND: [
        { code: { not: null } },
        { OR: HIDDEN_EXPANSION_CODES.map((code) => ({ code: { contains: code } })) },
      ],
    });
  }

  if (HIDDEN_EXPANSION_NAMES.length > 0) {
    hiddenConditions.push({
      OR: HIDDEN_EXPANSION_NAMES.map((name) => ({ name: { contains: name } })),
    });
  }

  if (REDUNDANT_SUBSET_PATTERNS.length > 0) {
    hiddenConditions.push({
      OR: REDUNDANT_SUBSET_PATTERNS.map((name) => ({ name: { contains: name } })),
    });
  }

  const hiddenWhere =
    hiddenConditions.length === 1 ? { NOT: hiddenConditions[0] } : { NOT: hiddenConditions };

  return (
    combineWhere<Prisma.EpisodeWhereInput>("AND", [visibleGameWhere, hiddenWhere]) ??
    visibleGameWhere ??
    hiddenWhere
  );
}

function episodeMatchesSetCode(setCode: string) {
  return {
    code: { contains: setCode },
  } satisfies Prisma.EpisodeWhereInput;
}

function buildSetCodeCondition(
  game: TradingCardGame,
  setCode: string
): Prisma.CardWhereInput {
  if (game !== ONE_PIECE_GAME) {
    return { episode: episodeMatchesSetCode(setCode) };
  }

  const normalizedSetCode = normalizeOnePieceSetCode(setCode);
  const prefixes = uniqueStrings([
    `${normalizedSetCode}-`,
    `${normalizedSetCode.toLowerCase()}-`,
  ]);

  return {
    OR: [
      { episode: episodeMatchesSetCode(normalizedSetCode) },
      ...prefixes.map((prefix) => ({ card_number: { startsWith: prefix } })),
    ],
  };
}

function containsCondition(field: string, value: string) {
  return { [field]: { contains: value } } as Record<string, { contains: string }>;
}

function buildCardNumberCondition(
  cardNumber: string,
  options?: { matchNumericPrefix?: boolean }
): Prisma.CardWhereInput {
  const aliases = buildCardNumberSearchAliases(cardNumber);
  if (aliases.length === 0) return { card_number: cardNumber };

  if (cardNumber.includes("/")) {
    // A partially typed total such as "185/19" must already match "185/196".
    const conditions = aliases.flatMap((alias): Prisma.CardWhereInput[] =>
      alias.includes("/")
        ? [
            { card_number: { startsWith: alias } },
            { printed_card_number: { startsWith: alias } },
          ]
        : [{ card_number: alias }, { printed_card_number: alias }]
    );
    return conditions.length === 1 ? conditions[0] : { OR: conditions };
  }

  if (/^\d+$/.test(cardNumber)) {
    const conditions: Prisma.CardWhereInput[] = aliases.flatMap((alias) => [
      { card_number: alias },
      { card_number: { startsWith: `${alias}/` } },
      { printed_card_number: alias },
      { printed_card_number: { startsWith: `${alias}/` } },
    ]);

    // Promo and subset numbers such as "SVP 209", "SWSH209" or "TG12" must
    // surface for a plain "209" search too.
    conditions.push(
      ...aliases.map((alias) => ({ card_number: { endsWith: ` ${alias}` } })),
      {
        card_number: {
          in: LETTER_PREFIXED_NUMBER_PREFIXES.flatMap((prefix) =>
            aliases.map((alias) => `${prefix}${alias}`)
          ),
        },
      }
    );

    if (options?.matchNumericPrefix) {
      // Name-plus-number searches keep matching while the number is still
      // being typed ("umbreon 16" already finds 161/131).
      conditions.push(
        ...aliases.flatMap((alias) => [
          { card_number: { startsWith: alias } },
          { printed_card_number: { startsWith: alias } },
        ])
      );
    }

    return conditions.length === 1 ? conditions[0] : { OR: conditions };
  }

  const conditions = aliases.flatMap((alias) => [
    { card_number: { contains: alias } },
    { printed_card_number: { contains: alias } },
  ]);
  return conditions.length === 1 ? conditions[0] : { OR: conditions };
}

function buildOnePieceCardReferenceCondition(
  setCode: string,
  cardNumber: string,
  rawCardRef: string | null
): Prisma.CardWhereInput {
  const normalizedSetCode = setCode.trim().replace(/^#+/, "");
  const normalizedCardNumber = cardNumber.trim().replace(/^#+/, "");
  const cardNumberAliases = buildCardNumberSearchAliases(normalizedCardNumber);
  const exactRefs = cardNumberAliases.flatMap((alias) => [
    `${normalizedSetCode.toUpperCase()}-${alias.toUpperCase()}`,
    `${normalizedSetCode.toLowerCase()}-${alias.toLowerCase()}`,
  ]);
  const refs = uniqueStrings([
    ...exactRefs,
    rawCardRef?.trim(),
    rawCardRef?.trim().toUpperCase(),
    rawCardRef?.trim().toLowerCase(),
  ]);

  return refs.length === 1
    ? { card_number: refs[0] }
    : { OR: refs.map((ref) => ({ card_number: ref })) };
}

function buildSetScopedCardNumberCondition(
  game: TradingCardGame,
  setCode: string,
  cardNumber: string,
  rawCardRef: string | null
): Prisma.CardWhereInput {
  if (game === ONE_PIECE_GAME) {
    return buildOnePieceCardReferenceCondition(setCode, cardNumber, rawCardRef);
  }

  const referenceConditions: Prisma.CardWhereInput[] = [
    {
      AND: [
        { episode: episodeMatchesSetCode(setCode) },
        buildCardNumberCondition(cardNumber),
      ],
    },
  ];

  if (rawCardRef) {
    referenceConditions.push({
      OR: [
        { card_number: { contains: rawCardRef } },
        { printed_card_number: { contains: rawCardRef } },
      ],
    });
  }

  // Promo numbers are stored with a space ("SVP 209"), so "svp 209" and
  // "svp209" must both reach them even though the episode code is "PR-SV".
  referenceConditions.push({
    OR: buildCardNumberSearchAliases(cardNumber).map((alias) => ({
      card_number: { contains: `${setCode} ${alias}` },
    })),
  });

  return referenceConditions.length === 1 ? referenceConditions[0] : { OR: referenceConditions };
}

function buildCardFreeTextCondition(query: string): Prisma.CardWhereInput {
  const tokens = searchTokens(query);
  const conditions: Prisma.CardWhereInput[] = [
    nameContains<Prisma.CardWhereInput>(query),
    { episode: nameContains<Prisma.EpisodeWhereInput>(query, "name") },
    { episode: fieldContains<Prisma.EpisodeWhereInput>(query, "code") },
  ];

  if (tokens.length > 1) {
    conditions.push({
      AND: tokens.map((token) => ({
        OR: [
          fieldContains<Prisma.CardWhereInput>(token),
          { episode: fieldContains<Prisma.EpisodeWhereInput>(token, "name") },
          { episode: fieldContains<Prisma.EpisodeWhereInput>(token, "code") },
        ],
      })),
    });
  }

  if (/\d/.test(query)) {
    conditions.push(fieldContains<Prisma.CardWhereInput>(query, "card_number"));
    conditions.push(fieldContains<Prisma.CardWhereInput>(query, "printed_card_number"));

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

function buildEpisodeFreeTextCondition(query: string): Prisma.EpisodeWhereInput {
  const tokens = searchTokens(query);
  const conditions: Prisma.EpisodeWhereInput[] = [
    fieldContains<Prisma.EpisodeWhereInput>(query, "name"),
    fieldContains<Prisma.EpisodeWhereInput>(query, "code"),
  ];

  if (tokens.length > 1) {
    conditions.push({
      AND: tokens.map((token) => ({
        OR: [
          fieldContains<Prisma.EpisodeWhereInput>(token, "name"),
          fieldContains<Prisma.EpisodeWhereInput>(token, "code"),
        ],
      })),
    });
  }

  return { OR: conditions };
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
  const displayCardNumber = getDisplayCardNumber(card);
  const compactRef = episodeCode && displayCardNumber ? `${episodeCode}${displayCardNumber}` : "";
  const cardNumberAliases = buildCardNumberSearchAliases(displayCardNumber);
  const compactRefAliases = episodeCode
    ? cardNumberAliases.map((cardNumber) => `${episodeCode}${cardNumber}`)
    : [];

  return [card.name, displayCardNumber ?? "", ...cardNumberAliases, episodeName, episodeCode, compactRef, ...compactRefAliases]
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
        { episode: fieldContains<Prisma.EpisodeWhereInput>(name, "code") },
      ],
    };
  }

  return {
    OR: [
      {
        OR: [
          fieldContains<Prisma.SealedProductWhereInput>(name),
          { episode: fieldContains<Prisma.EpisodeWhereInput>(name, "name") },
          { episode: fieldContains<Prisma.EpisodeWhereInput>(name, "code") },
        ],
      },
      {
        AND: tokens.map((token) => ({
          OR: [
            fieldContains<Prisma.SealedProductWhereInput>(token),
            { episode: fieldContains<Prisma.EpisodeWhereInput>(token, "name") },
            { episode: fieldContains<Prisma.EpisodeWhereInput>(token, "code") },
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

function getTextRelevanceScore(
  value: string,
  query: string,
  mode: SearchRankingMode
): number {
  return mode === "fuzzy"
    ? fuzzyRelevanceScore(value, query)
    : relevanceScore(value, query);
}

function getCardResultRelevanceScore(
  card: {
    name: string;
    card_number: string | null;
    episode_name?: string | null;
    episode_code?: string | null;
    episode?: { name: string; code: string | null };
  },
  query: string,
  mode: SearchRankingMode
): number {
  // Name identity is the strongest signal. The combined text still makes set
  // codes, card numbers and expansion names rank correctly.
  return (
    getTextRelevanceScore(card.name, query, mode) * 3 +
    getTextRelevanceScore(buildCardSearchText(card), query, mode)
  );
}

function getFuzzyExpansionMinScore(rawQuery: string): number {
  return searchTokens(rawQuery).length > 1 ? FUZZY_EXPANSION_MULTI_TOKEN_MIN_SCORE : 1;
}

function buildFuzzyTokenFragments(token: string): string[] {
  const normalized = token.trim();
  if (!normalized) return [];

  return uniqueStrings([
    normalized,
    normalized.slice(0, Math.min(4, normalized.length)),
    normalized.slice(0, Math.min(3, normalized.length)),
    normalized.length > 3 ? normalized.slice(0, 2) : null,
    // A typo in the first letters ("tundurus") must still reach candidates
    // whose name only matches further into the word ("Thundurus").
    normalized.length > 4 ? normalized.slice(1, 5) : null,
    normalized.length > 5 ? normalized.slice(2, 6) : null,
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
  parsed: ParsedQuery,
  activeGame: TradingCardGame
): Prisma.CardWhereInput | undefined {
  const textFragments = buildFuzzyTextFragments(rawQuery);
  const conditions: Prisma.CardWhereInput[] = [];

  if (parsed.setCode && parsed.cardNumber) {
    conditions.push(
      buildSetScopedCardNumberCondition(
        activeGame,
        parsed.setCode,
        parsed.cardNumber,
        parsed.rawCardRef
      )
    );
  } else {
    if (parsed.setCode) {
      conditions.push(buildSetCodeCondition(activeGame, parsed.setCode));
    }

    if (parsed.cardNumber) {
      conditions.push(buildCardNumberCondition(parsed.cardNumber));
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

  return buildCardNumberCondition(parsed.cardNumber, { matchNumericPrefix: true });
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

function cardNumberExactlyMatches(
  cardNumber: string | null,
  queriedCardNumber: string | null | undefined
): boolean {
  if (!cardNumber || !queriedCardNumber) return false;

  const aliases = new Set([
    ...buildCardNumberSearchAliases(cardNumber),
    // A plain "161" query must count "161/131" as an exact hit too.
    ...buildCardNumberSearchAliases(cardNumber.split("/")[0]),
    // And "209" must count "SVP 209" or "SWSH209" as an exact hit.
    ...buildCardNumberSearchAliases(cardNumber.split("/")[0].replace(/^[a-z]+[\s-]*/i, "")),
  ]);
  return buildCardNumberSearchAliases(queriedCardNumber).some((alias) => aliases.has(alias));
}

function formatSingleResults(
  cards: SearchCardRecord[],
  relevanceQuery: string,
  rankingMode: SearchRankingMode = "direct",
  queriedCardNumber: string | null = null
) {
  return cards
    .map((card) => {
      const wantItem = card.wants?.[0] ?? null;

      return {
        id: card.id,
        name: card.name,
        card_number: getDisplayCardNumber(card),
        rarity: card.rarity,
        supertype: card.supertype,
        image_url: card.image_url,
        episode_id: card.episode.id,
        episode_name: card.episode.name,
        episode_code: card.episode.code,
        episode_release_date: card.episode.release_date,
        cm_en_lowest_nm: card.prices[0]?.cm_en_lowest_nm ?? null,
        tcp_market: card.prices[0]?.tcp_market ?? null,
        want_item: wantItem
          ? {
              id: wantItem.id,
              created_at: wantItem.created_at.toISOString(),
            }
          : null,
      };
    })
    .sort((a, b) => {
      if (relevanceQuery.trim()) {
        const scoreDiff = compareRelevance(
          getCardResultRelevanceScore(a, relevanceQuery, rankingMode),
          getCardResultRelevanceScore(b, relevanceQuery, rankingMode)
        );
        if (scoreDiff !== 0) return scoreDiff;
      }

      if (queriedCardNumber) {
        // With prefix number matching, "umbreon 16" also returns 160-169;
        // the exact number the user typed must stay on top.
        const exactDiff =
          Number(cardNumberExactlyMatches(b.card_number, queriedCardNumber)) -
          Number(cardNumberExactlyMatches(a.card_number, queriedCardNumber));
        if (exactDiff !== 0) return exactDiff;
      }

      const priceDiff = compareSingleSearchPriceDesc(a, b);
      if (priceDiff !== 0) return priceDiff;

      const nameCmp = a.name.localeCompare(b.name, "nl", { sensitivity: "base" });
      if (nameCmp !== 0) return nameCmp;

      return (a.card_number ?? "").localeCompare(b.card_number ?? "", "nl", {
        numeric: true,
        sensitivity: "base",
      });
    });
}

function formatSealedResults(
  sealed: SearchSealedRecord[],
  relevanceQuery: string,
  rankingMode: SearchRankingMode = "direct"
) {
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
      const aScore =
        getTextRelevanceScore(a.name, relevanceQuery, rankingMode) * 2 +
        getTextRelevanceScore(a.episode.name, relevanceQuery, rankingMode) +
        getTextRelevanceScore(a.episode.code ?? "", relevanceQuery, rankingMode);
      const bScore =
        getTextRelevanceScore(b.name, relevanceQuery, rankingMode) * 2 +
        getTextRelevanceScore(b.episode.name, relevanceQuery, rankingMode) +
        getTextRelevanceScore(b.episode.code ?? "", relevanceQuery, rankingMode);
      const scoreDiff = compareRelevance(aScore, bScore);
      if (scoreDiff !== 0) return scoreDiff;

      const priceDiff = comparePriceDesc(a.cm_lowest, b.cm_lowest);
      if (priceDiff !== 0) return priceDiff;

      return a.name.localeCompare(b.name, "nl", { sensitivity: "base" });
    });
}

function formatExpansionResults(
  expansions: SearchExpansionRecord[],
  relevanceQuery: string,
  rankingMode: SearchRankingMode = "direct"
) {
  return expansions.sort((a, b) => {
    const scoreDiff = compareRelevance(
      getTextRelevanceScore(a.name, relevanceQuery, rankingMode) * 2 +
        getTextRelevanceScore(a.code ?? "", relevanceQuery, rankingMode),
      getTextRelevanceScore(b.name, relevanceQuery, rankingMode) * 2 +
        getTextRelevanceScore(b.code ?? "", relevanceQuery, rankingMode)
    );
    if (scoreDiff !== 0) return scoreDiff;

    return a.name.localeCompare(b.name, "nl", { sensitivity: "base" });
  });
}

async function runFuzzyFallback(
  rawQuery: string,
  parsed: ParsedQuery,
  activeGame: TradingCardGame,
  itemEpisodeWhere: Prisma.EpisodeWhereInput,
  visibleExpansionWhere: Prisma.EpisodeWhereInput,
  userId: string
) {
  const normalizedQuery = normalizeSearchText(rawQuery);
  if (normalizedQuery.length < 4) {
    return { singles: [], sealed: [], expansions: [], total: 0, fuzzy: false };
  }

  const [cardCandidates, sealedCandidates, expansionCandidates] = await Promise.all([
    db.card.findMany({
      where: combineWhere("AND", [
        { game: activeGame },
        { episode: itemEpisodeWhere },
        buildFuzzyCardCandidateWhere(rawQuery, parsed, activeGame),
      ]),
      take: FUZZY_CARD_CANDIDATE_LIMIT,
      orderBy: [{ episode: { release_date: "desc" } }, { name: "asc" }, { card_number: "asc" }],
      select: {
        id: true,
        name: true,
        card_number: true,
        printed_card_number: true,
        rarity: true,
        supertype: true,
        image_url: true,
        episode: {
          select: {
            id: true,
            name: true,
            code: true,
            release_date: true,
          },
        },
      },
    }),
    db.sealedProduct.findMany({
      where: combineWhere("AND", [
        { game: activeGame },
        { episode: itemEpisodeWhere },
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
        episode: { select: { id: true, name: true, code: true, release_date: true } },
      },
    }),
    db.episode.findMany({
      where: combineWhere("AND", [
        visibleExpansionWhere,
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
          { game: activeGame },
          { episode: itemEpisodeWhere },
          numberCardCandidateWhere,
        ]),
        take: FUZZY_NUMBER_CARD_CANDIDATE_LIMIT,
        orderBy: [{ name: "asc" }, { episode: { release_date: "desc" } }, { card_number: "asc" }],
        select: {
          id: true,
          name: true,
          card_number: true,
          printed_card_number: true,
          rarity: true,
          supertype: true,
          image_url: true,
          episode: {
            select: {
              id: true,
              name: true,
              code: true,
              release_date: true,
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
          printed_card_number: true,
          rarity: true,
          supertype: true,
          image_url: true,
          episode: {
            select: {
              id: true,
              name: true,
              code: true,
              release_date: true,
            },
          },
          prices: {
            // Search tiles must use the same latest usable English Near Mint
            // quote as card detail and Signal Radar. The newest snapshot can
            // legitimately contain only TCGPlayer or another language.
            where: { cm_en_lowest_nm: { gt: 0, not: 9001 } },
            orderBy: [{ fetched_at: "desc" }, { id: "desc" }],
            take: 1,
            select: { cm_en_lowest_nm: true, cm_jp_lowest_nm: true, tcp_market: true },
          },
          wants: {
            where: { user_id: userId },
            take: 1,
            select: { id: true, created_at: true },
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
    .filter((entry) => entry.score >= getFuzzyExpansionMinScore(rawQuery))
    .sort((a, b) => compareRelevance(a.score, b.score))
    .slice(0, 12)
    .map((entry) => entry.episode);

  const formattedSingles = formatSingleResults(singles, rawQuery, "fuzzy", parsed.cardNumber);
  const formattedSealed = formatSealedResults(sealed, rawQuery, "fuzzy");
  const formattedExpansions = formatExpansionResults(expansions, rawQuery, "fuzzy");

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
const AUTO_SWITCH_SEARCH_PARAM = "autoswitch";

function getAutoSwitchGame(
  activeGame: TradingCardGame,
  onePieceEnabled: boolean
): TradingCardGame | null {
  if (!onePieceEnabled) return null;
  return activeGame === ONE_PIECE_GAME ? POKEMON_GAME : ONE_PIECE_GAME;
}

async function runDirectSearch(
  q: string,
  activeGame: TradingCardGame,
  itemEpisodeWhere: Prisma.EpisodeWhereInput,
  userId: string
) {
  const parsed = parseSearchQuery(q, activeGame);
  const { name, cardNumber, setCode, rawCardRef } = parsed;

  // SQLite LIKE is already case-insensitive for ASCII, so we do not use mode:"insensitive".
  const cardAndConditions: Array<Record<string, unknown>> = [];

  if (name) {
    cardAndConditions.push(buildCardFreeTextCondition(name));
  }

  if (cardNumber) {
    if (setCode) {
      cardAndConditions.push(
        buildSetScopedCardNumberCondition(activeGame, setCode, cardNumber, rawCardRef)
      );
    } else {
      cardAndConditions.push(
        buildCardNumberCondition(cardNumber, { matchNumericPrefix: Boolean(name) })
      );
    }
  } else if (setCode) {
    cardAndConditions.push(buildSetCodeCondition(activeGame, setCode));
  }

  const cardWhere: Prisma.CardWhereInput | undefined =
    cardAndConditions.length === 0
      ? undefined
      : cardAndConditions.length === 1
        ? (cardAndConditions[0] as Prisma.CardWhereInput)
        : { AND: cardAndConditions as Prisma.CardWhereInput[] };

  const shouldSearchSealed = Boolean((name || setCode) && !cardNumber);
  const shouldSearchExpansions = Boolean(
    (name && !setCode && !cardNumber) || (setCode && !cardNumber)
  );
  const isSetOnlyCardSearch = Boolean(setCode && !cardNumber && !name);
  const singleResultLimit = isSetOnlyCardSearch ? DIRECT_CARD_CANDIDATE_LIMIT : MAX_RESULTS;
  const expansionQuery = shouldSearchExpansions ? name ?? "" : "";

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
    { game: activeGame },
    { episode: itemEpisodeWhere },
    cardWhere,
  ]);
  const visibleSealedWhere = combineWhere<Prisma.SealedProductWhereInput>("AND", [
    { game: activeGame },
    { episode: itemEpisodeWhere },
    sealedWhere,
  ]);
  const visibleExpansionWhere = shouldSearchExpansions
    ? combineWhere<Prisma.EpisodeWhereInput>("AND", [
        buildVisibleEpisodeWhere(activeGame),
        setCode && !cardNumber
          ? episodeMatchesSetCode(setCode)
          : buildEpisodeFreeTextCondition(expansionQuery),
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
        printed_card_number: true,
        rarity: true,
        supertype: true,
        image_url: true,
        episode: {
          select: {
            id: true,
            name: true,
            code: true,
            release_date: true,
          },
        },
        prices: {
          // Never turn an older valid EN/NM price into "No price" merely
          // because the latest multi-source snapshot has no English listing.
          where: { cm_en_lowest_nm: { gt: 0, not: 9001 } },
          orderBy: [{ fetched_at: "desc" }, { id: "desc" }],
          take: 1,
          select: { cm_en_lowest_nm: true, cm_jp_lowest_nm: true, tcp_market: true },
        },
        wants: {
          where: { user_id: userId },
          take: 1,
          select: { id: true, created_at: true },
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
            episode: { select: { id: true, name: true, code: true, release_date: true } },
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
  const singles = formatSingleResults(cards, relevanceQuery, "direct", cardNumber).slice(
    0,
    singleResultLimit
  );
  const sealedResults = formatSealedResults(sealed, relevanceQuery).slice(0, MAX_RESULTS);
  const expansionResults = formatExpansionResults(expansions, relevanceQuery);
  const total = singles.length + sealedResults.length + expansionResults.length;

  return {
    singles,
    sealed: sealedResults,
    expansions: expansionResults,
    total,
    fuzzy: false,
    parsed,
    game: activeGame,
    exactOnePieceReferenceSearch: isExactOnePieceReferenceSearch(parsed, activeGame),
    exactPrintedCardNumberSearch: isExactPrintedCardNumberSearch(parsed),
  };
}

type DirectSearchResults = Awaited<ReturnType<typeof runDirectSearch>>;
type SearchResponsePayload = {
  singles: DirectSearchResults["singles"];
  sealed: DirectSearchResults["sealed"];
  expansions: DirectSearchResults["expansions"];
  total: number;
  fuzzy: boolean;
  parsed: ParsedQuery;
  game: TradingCardGameFilter;
};

function toDirectSearchResponse(results: DirectSearchResults) {
  return {
    singles: results.singles,
    sealed: results.sealed,
    expansions: results.expansions,
    total: results.total,
    fuzzy: results.fuzzy,
    parsed: results.parsed,
    game: results.game,
  };
}

async function runFuzzySearchForDirectResults(
  q: string,
  directResults: DirectSearchResults,
  itemEpisodeWhere: Prisma.EpisodeWhereInput,
  userId: string
): Promise<SearchResponsePayload> {
  const fuzzyResults = await runFuzzyFallback(
    q,
    directResults.parsed,
    directResults.game,
    itemEpisodeWhere,
    buildVisibleEpisodeWhere(directResults.game),
    userId
  );

  return {
    ...fuzzyResults,
    parsed: directResults.parsed,
    game: directResults.game,
  };
}

async function runAllGameSearch(q: string, userId: string): Promise<SearchResponsePayload> {
  const pokemonEpisodeWhere = buildVisibleEpisodeWhere(POKEMON_GAME, { includeGame: false });
  const onePieceEpisodeWhere = buildVisibleEpisodeWhere(ONE_PIECE_GAME, { includeGame: false });
  const [pokemonDirectResults, onePieceDirectResults] = await Promise.all([
    runDirectSearch(q, POKEMON_GAME, pokemonEpisodeWhere, userId),
    runDirectSearch(q, ONE_PIECE_GAME, onePieceEpisodeWhere, userId),
  ]);
  const directResponses = [
    toDirectSearchResponse(pokemonDirectResults),
    toDirectSearchResponse(onePieceDirectResults),
  ];
  const hasDirectResults = directResponses.some((response) => response.total > 0);
  const hasExactReferenceSearch = [
    pokemonDirectResults,
    onePieceDirectResults,
  ].some((result) => result.exactOnePieceReferenceSearch || result.exactPrintedCardNumberSearch);

  if (hasDirectResults || hasExactReferenceSearch) {
    return mergeSearchResponses(directResponses);
  }

  const fuzzyResponses = await Promise.all([
    runFuzzySearchForDirectResults(q, pokemonDirectResults, pokemonEpisodeWhere, userId),
    runFuzzySearchForDirectResults(q, onePieceDirectResults, onePieceEpisodeWhere, userId),
  ]);

  return mergeSearchResponses(fuzzyResponses);
}

function uniqueById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const unique: T[] = [];

  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    unique.push(item);
  }

  return unique;
}

function mergeSearchResponses(results: SearchResponsePayload[]): SearchResponsePayload {
  const singles = uniqueById(results.flatMap((result) => result.singles));
  const sealed = uniqueById(results.flatMap((result) => result.sealed));
  const expansions = uniqueById(results.flatMap((result) => result.expansions));

  return {
    singles,
    sealed,
    expansions,
    total: singles.length + sealed.length + expansions.length,
    fuzzy: results.some((result) => result.fuzzy),
    parsed: results[0]?.parsed ?? parseSearchQuery("", POKEMON_GAME),
    game: ALL_GAMES,
  };
}

export async function GET(req: NextRequest) {
  let user: Awaited<ReturnType<typeof requireUser>>;
  try {
    user = await requireUser();
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: "Authentication failed" }, { status: 500 });
  }

  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  const settings = await getServerUserSettings(user.id);
  const activeGame = parseVisibleGameFilter(req.nextUrl.searchParams.get(GAME_SEARCH_PARAM), {
    onePieceEnabled: settings.onePieceLibraryEnabled,
  });
  const allowAutoSwitch = req.nextUrl.searchParams.get(AUTO_SWITCH_SEARCH_PARAM) !== "0";

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
    if (activeGame === ALL_GAMES) {
      return NextResponse.json(await runAllGameSearch(q, user.id));
    }

    const itemEpisodeWhere = buildVisibleEpisodeWhere(activeGame, { includeGame: false });
    const directResults = await runDirectSearch(q, activeGame, itemEpisodeWhere, user.id);
    const autoSwitchGame = allowAutoSwitch
      ? getAutoSwitchGame(activeGame, settings.onePieceLibraryEnabled)
      : null;

    if (
      directResults.total === 0 &&
      !directResults.exactOnePieceReferenceSearch &&
      !directResults.exactPrintedCardNumberSearch &&
      autoSwitchGame
    ) {
      const alternateResults = await runDirectSearch(
        q,
        autoSwitchGame,
        buildVisibleEpisodeWhere(autoSwitchGame, { includeGame: false }),
        user.id
      );

      if (alternateResults.total > 0) {
        return NextResponse.json({
          ...toDirectSearchResponse(alternateResults),
          autoSwitchedFrom: activeGame,
        });
      }
    }

    if (
      directResults.total === 0 &&
      !directResults.exactOnePieceReferenceSearch &&
      !directResults.exactPrintedCardNumberSearch
    ) {
      const fuzzyResults = await runFuzzyFallback(
        q,
        directResults.parsed,
        activeGame,
        itemEpisodeWhere,
        buildVisibleEpisodeWhere(activeGame),
        user.id
      );

      return NextResponse.json({
        ...fuzzyResults,
        parsed: directResults.parsed,
        game: activeGame,
      });
    }

    return NextResponse.json({
      ...toDirectSearchResponse(directResults),
    });
  } catch (e) {
    console.error("[search]", e);
    return NextResponse.json(
      { singles: [], sealed: [], expansions: [], total: 0, error: "Search failed" },
      { status: 500 }
    );
  }
}
