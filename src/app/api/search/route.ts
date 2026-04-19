import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isHiddenExpansion } from "@/lib/episodes";

const MAX_RESULTS = 100;

interface ParsedQuery {
  name: string | null;
  cardNumber: string | null;
  setCode: string | null;
}

const SET_CODE_RE = /^[a-z]{1,6}\d[\w]*$/i;

function parseSearchQuery(raw: string): ParsedQuery {
  const q = raw.trim();

  if (/^\d+$/.test(q)) {
    return { name: null, cardNumber: q, setCode: null };
  }

  if (/^\d+\/\d+$/.test(q)) {
    return { name: null, cardNumber: q.split("/")[0], setCode: null };
  }

  const withSlash = /^(.+?)\s+(\d+)\/\d+$/.exec(q);
  if (withSlash) {
    const prefix = withSlash[1].trim();
    const cardNumber = withSlash[2];

    if (SET_CODE_RE.test(prefix)) {
      return { name: null, cardNumber, setCode: prefix };
    }

    return { name: prefix, cardNumber, setCode: null };
  }

  const tokens = q.split(/\s+/);
  const codeIdx = tokens.findIndex((token) => SET_CODE_RE.test(token));

  if (codeIdx !== -1 && tokens.length > 1) {
    const setCode = tokens[codeIdx];
    const nameTokens = tokens.filter((_, index) => index !== codeIdx);
    const lastToken = nameTokens[nameTokens.length - 1];

    if (/^\d+$/.test(lastToken) && nameTokens.length > 1) {
      return { name: nameTokens.slice(0, -1).join(" "), cardNumber: lastToken, setCode };
    }

    return { name: nameTokens.join(" ") || null, cardNumber: null, setCode };
  }

  const withNumber = /^(.+?)\s+(\d+)$/.exec(q);
  if (withNumber) {
    return { name: withNumber[1], cardNumber: withNumber[2], setCode: null };
  }

  return { name: q || null, cardNumber: null, setCode: null };
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fieldContains(value: string, field = "name"): any {
  const variants = nameVariants(value);

  if (variants.length === 1) {
    return { [field]: { contains: value } };
  }

  return { OR: variants.map((variant) => ({ [field]: { contains: variant } })) };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function nameContains(name: string, field = "name"): any {
  const tokens = searchTokens(name);

  if (tokens.length <= 1) {
    return fieldContains(name, field);
  }

  return {
    OR: [
      fieldContains(name, field),
      { AND: tokens.map((token) => fieldContains(token, field)) },
    ],
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function sealedNameContains(name: string): any {
  const tokens = searchTokens(name);

  if (tokens.length <= 1) {
    return {
      OR: [fieldContains(name), { episode: fieldContains(name, "name") }],
    };
  }

  return {
    OR: [
      {
        OR: [fieldContains(name), { episode: fieldContains(name, "name") }],
      },
      {
        AND: tokens.map((token) => ({
          OR: [fieldContains(token), { episode: fieldContains(token, "name") }],
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

function compareRelevance(aScore: number, bScore: number): number {
  return bScore - aScore;
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";

  if (q.length < 3) {
    return NextResponse.json({ singles: [], sealed: [], expansions: [], total: 0 });
  }

  try {
    const parsed = parseSearchQuery(q);
    const { name, cardNumber, setCode } = parsed;

    // SQLite LIKE is already case-insensitive for ASCII, so we do not use mode:"insensitive".
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cardWhere: any = {};

    if (name && setCode) {
      cardWhere.AND = [
        nameContains(name),
        { episode: { OR: [{ code: { equals: setCode } }, { name: { contains: setCode } }] } },
      ];
    } else if (name) {
      Object.assign(cardWhere, nameContains(name));
    } else if (setCode) {
      cardWhere.episode = {
        OR: [{ code: { equals: setCode } }, { name: { contains: setCode } }],
      };
    }

    if (cardNumber) {
      if (cardWhere.AND) {
        cardWhere.AND.push({ card_number: cardNumber });
      } else {
        cardWhere.card_number = cardNumber;
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sealedWhere: any = {};

    if (name && setCode) {
      sealedWhere.AND = [
        sealedNameContains(name),
        { episode: { OR: [{ code: { equals: setCode } }, { name: { contains: setCode } }] } },
      ];
    } else if (name) {
      Object.assign(sealedWhere, sealedNameContains(name));
    } else if (setCode) {
      sealedWhere.episode = {
        OR: [{ code: { equals: setCode } }, { name: { contains: setCode } }],
      };
    }

    const [cards, sealed, expansions] = await Promise.all([
      db.card.findMany({
        where: cardWhere,
        take: MAX_RESULTS,
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

      name || setCode
        ? db.sealedProduct.findMany({
            where: sealedWhere,
            take: MAX_RESULTS,
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

      name && !setCode
        ? db.episode.findMany({
            where:
              nameVariants(name).length === 1
                ? { name: { contains: name } }
                : { OR: nameVariants(name).map((variant) => ({ name: { contains: variant } })) },
            select: { id: true, name: true, code: true, logo_url: true },
            orderBy: { release_date: "desc" },
            take: 20,
          })
        : Promise.resolve([]),
    ]);

    const visibleCards = cards.filter(
      (card) =>
        !isHiddenExpansion({
          id: card.episode.id,
          code: card.episode.code,
          name: card.episode.name,
        })
    );
    const visibleSealed = sealed.filter(
      (product) =>
        !isHiddenExpansion({
          id: product.episode.id,
          code: product.episode.code,
          name: product.episode.name,
        })
    );
    const visibleExpansions = expansions.filter(
      (episode) =>
        !isHiddenExpansion({ id: episode.id, code: episode.code, name: episode.name })
    );

    const nameLower = (name ?? "").toLowerCase();
    const relevanceQuery = name ?? q;
    const singles = visibleCards
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
        if (nameLower) {
          const scoreDiff = compareRelevance(
            relevanceScore(a.name, relevanceQuery),
            relevanceScore(b.name, relevanceQuery)
          );
          if (scoreDiff !== 0) return scoreDiff;
        }

        const nameCmp = a.name.localeCompare(b.name, "nl", { sensitivity: "base" });
        if (nameCmp !== 0) return nameCmp;

        const aPrice = a.cm_en_lowest_nm ?? a.tcp_market ?? -1;
        const bPrice = b.cm_en_lowest_nm ?? b.tcp_market ?? -1;
        return bPrice - aPrice;
      });
    const sealedResults = visibleSealed
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
          relevanceScore(a.name, relevanceQuery) +
          Math.floor(relevanceScore(a.episode.name, relevanceQuery) / 2);
        const bScore =
          relevanceScore(b.name, relevanceQuery) +
          Math.floor(relevanceScore(b.episode.name, relevanceQuery) / 2);
        const scoreDiff = compareRelevance(aScore, bScore);
        if (scoreDiff !== 0) return scoreDiff;

        const aPrice = a.cm_lowest ?? -1;
        const bPrice = b.cm_lowest ?? -1;
        return bPrice - aPrice;
      });
    const expansionResults = visibleExpansions.sort((a, b) => {
      const scoreDiff = compareRelevance(
        relevanceScore(a.name, relevanceQuery),
        relevanceScore(b.name, relevanceQuery)
      );
      if (scoreDiff !== 0) return scoreDiff;

      return a.name.localeCompare(b.name, "nl", { sensitivity: "base" });
    });

    return NextResponse.json({
      singles,
      sealed: sealedResults,
      expansions: expansionResults,
      total: singles.length + sealedResults.length + expansionResults.length,
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
