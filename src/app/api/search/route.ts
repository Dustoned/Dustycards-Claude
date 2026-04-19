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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function nameContains(name: string, field = "name"): any {
  const variants = nameVariants(name);

  if (variants.length === 1) {
    return { [field]: { contains: name } };
  }

  return { OR: variants.map((variant) => ({ [field]: { contains: variant } })) };
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
        { OR: [nameContains(name), { episode: nameContains(name, "name") }] },
        { episode: { OR: [{ code: { equals: setCode } }, { name: { contains: setCode } }] } },
      ];
    } else if (name) {
      sealedWhere.OR = [
        ...nameVariants(name).map((variant) => ({ name: { contains: variant } })),
        ...nameVariants(name).map((variant) => ({ episode: { name: { contains: variant } } })),
      ];
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
          const aStarts = a.name.toLowerCase().startsWith(nameLower) ? 0 : 1;
          const bStarts = b.name.toLowerCase().startsWith(nameLower) ? 0 : 1;

          if (aStarts !== bStarts) return aStarts - bStarts;
        }

        const nameCmp = a.name.localeCompare(b.name, "nl", { sensitivity: "base" });
        if (nameCmp !== 0) return nameCmp;

        const aPrice = a.cm_en_lowest_nm ?? a.tcp_market ?? -1;
        const bPrice = b.cm_en_lowest_nm ?? b.tcp_market ?? -1;
        return bPrice - aPrice;
      });

    return NextResponse.json({
      singles,
      sealed: visibleSealed,
      expansions: visibleExpansions,
      total: singles.length + visibleSealed.length + visibleExpansions.length,
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
