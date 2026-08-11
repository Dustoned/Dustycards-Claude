import { NextRequest, NextResponse } from "next/server";
import { authErrorResponse, requireAdmin } from "@/lib/auth";
import {
  CARDMARKET_NO_EN_NM_PRICE_STATUS,
  KNOWN_UNAVAILABLE_PRICE_STATUS,
  STALE_PRICE_AGE_MS,
  UPCOMING_PRICE_SOURCE_STATUS,
  type DataQualityItem,
} from "@/lib/data-quality";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 200;
const TODAY_KEY = new Date().toISOString().slice(0, 10);

const ACTIONABLE_MISSING_PRICE = {
  OR: [
    { price_source_status: null },
    {
      price_source_status: {
        notIn: [
          KNOWN_UNAVAILABLE_PRICE_STATUS,
          UPCOMING_PRICE_SOURCE_STATUS,
          CARDMARKET_NO_EN_NM_PRICE_STATUS,
        ],
      },
    },
  ],
};

const CARD_ISSUE_WHERE: Record<string, object> = {
  "card-images": { OR: [{ image_url: null }, { image_url: "" }] },
  "card-source": { OR: [{ tcggo_url: null }, { tcggo_url: "" }] },
  "card-prices": {
    game: "pokemon",
    episode: { release_date: { not: null, lte: TODAY_KEY } },
    prices: { none: { cm_en_lowest_nm: { gt: 0, not: 9001 } } },
    ...ACTIONABLE_MISSING_PRICE,
  },
  "card-price-unavailable": {
    prices: { none: {} },
    price_source_status: KNOWN_UNAVAILABLE_PRICE_STATUS,
  },
  "card-rarity": { OR: [{ rarity: null }, { rarity: "" }] },
};

const SEALED_ISSUE_WHERE: Record<string, object> = {
  "sealed-images": { OR: [{ image_url: null }, { image_url: "" }] },
  "sealed-source": { OR: [{ tcggo_url: null }, { tcggo_url: "" }] },
  "sealed-prices": {
    AND: [
      { OR: [{ cm_lowest: null }, { cm_lowest: { lte: 0 } }, { cm_lowest: 9001 }] },
      { OR: [{ cm_lowest_eu: null }, { cm_lowest_eu: { lte: 0 } }, { cm_lowest_eu: 9001 }] },
      { OR: [{ cm_lowest_de: null }, { cm_lowest_de: { lte: 0 } }, { cm_lowest_de: 9001 }] },
      { OR: [{ cm_lowest_fr: null }, { cm_lowest_fr: { lte: 0 } }, { cm_lowest_fr: 9001 }] },
      { OR: [{ cm_lowest_es: null }, { cm_lowest_es: { lte: 0 } }, { cm_lowest_es: 9001 }] },
      { OR: [{ cm_lowest_it: null }, { cm_lowest_it: { lte: 0 } }, { cm_lowest_it: 9001 }] },
    ],
  },
};

async function listCards(where: object, limit: number): Promise<DataQualityItem[]> {
  const cards = await db.card.findMany({
    where,
    take: limit,
    orderBy: [{ episode_id: "asc" }, { card_number: "asc" }],
    select: {
      id: true,
      name: true,
      card_number: true,
      game: true,
      episode: { select: { id: true, name: true } },
    },
  });

  return cards.map((card) => ({
    id: card.id,
    name: card.name,
    detail: card.card_number ? `#${card.card_number}` : null,
    game: card.game,
    episodeId: card.episode.id,
    episodeName: card.episode.name,
    kind: "card",
  }));
}

async function listSealed(where: object, limit: number): Promise<DataQualityItem[]> {
  const products = await db.sealedProduct.findMany({
    where,
    take: limit,
    orderBy: [{ episode_id: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      game: true,
      episode: { select: { id: true, name: true } },
    },
  });

  return products.map((product) => ({
    id: product.id,
    name: product.name,
    detail: null,
    game: product.game,
    episodeId: product.episode.id,
    episodeName: product.episode.name,
    kind: "sealed",
  }));
}

interface RawCardRow {
  id: string;
  name: string;
  card_number: string | null;
  game: string;
  episode_id: string;
  episode_name: string;
}

function toCardItems(rows: RawCardRow[]): DataQualityItem[] {
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    detail: row.card_number ? `#${row.card_number}` : null,
    game: row.game,
    episodeId: row.episode_id,
    episodeName: row.episode_name,
    kind: "card",
  }));
}

async function listDuplicateCards(limit: number): Promise<DataQualityItem[]> {
  // Variants legitimately share set/number/name (alt arts, parallels) but have
  // their own source URL; only rows that also share the source URL are dupes.
  const rows = await db.$queryRaw<RawCardRow[]>`
    SELECT c.id, c.name, c.card_number, c.game, c.episode_id, e.name AS episode_name
    FROM "Card" c
    JOIN (
      SELECT game, episode_id, card_number, name, COALESCE(tcggo_url, '') AS source_url
      FROM "Card"
      WHERE card_number IS NOT NULL AND card_number <> ''
        AND name IS NOT NULL AND name <> ''
      GROUP BY game, episode_id, card_number, name, COALESCE(tcggo_url, '')
      HAVING COUNT(*) > 1
    ) d
      ON c.game = d.game
      AND c.episode_id = d.episode_id
      AND c.card_number = d.card_number
      AND c.name = d.name
      AND COALESCE(c.tcggo_url, '') = d.source_url
    JOIN "Episode" e ON e.id = c.episode_id
    ORDER BY c.episode_id, c.card_number, c.id
    LIMIT ${limit}
  `;

  return toCardItems(rows);
}

async function listEmptyHistoryCards(limit: number): Promise<DataQualityItem[]> {
  const rows = await db.$queryRaw<RawCardRow[]>`
    SELECT c.id, c.name, c.card_number, c.game, c.episode_id, e.name AS episode_name
    FROM "Card" c
    JOIN "Episode" e ON e.id = c.episode_id
    WHERE c.id IN (
      SELECT card_id FROM "Price" GROUP BY card_id HAVING COUNT(*) = 1
    )
    ORDER BY c.episode_id, c.card_number, c.id
    LIMIT ${limit}
  `;

  return toCardItems(rows);
}

async function listStalePriceCards(limit: number): Promise<DataQualityItem[]> {
  const cutoff = new Date(Date.now() - STALE_PRICE_AGE_MS);
  const cards = await db.card.findMany({
    where: {
      tcggo_url: { not: null },
      price_source_checked_at: { lt: cutoff },
      ...ACTIONABLE_MISSING_PRICE,
    },
    take: limit,
    orderBy: { price_source_checked_at: "asc" },
    select: {
      id: true,
      name: true,
      card_number: true,
      game: true,
      price_source_checked_at: true,
      episode: { select: { id: true, name: true } },
    },
  });

  return cards.map((card) => ({
    id: card.id,
    name: card.name,
    detail: card.price_source_checked_at
      ? `checked ${card.price_source_checked_at.toISOString().slice(0, 10)}`
      : null,
    game: card.game,
    episodeId: card.episode.id,
    episodeName: card.episode.name,
    kind: "card",
  }));
}

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();

    const issue = req.nextUrl.searchParams.get("issue") ?? "";
    const rawLimit = Number(req.nextUrl.searchParams.get("limit"));
    const limit =
      Number.isFinite(rawLimit) && rawLimit > 0
        ? Math.min(Math.floor(rawLimit), MAX_LIMIT)
        : DEFAULT_LIMIT;

    let items: DataQualityItem[];
    if (issue in CARD_ISSUE_WHERE) {
      items = await listCards(CARD_ISSUE_WHERE[issue], limit);
    } else if (issue in SEALED_ISSUE_WHERE) {
      items = await listSealed(SEALED_ISSUE_WHERE[issue], limit);
    } else if (issue === "card-duplicates") {
      items = await listDuplicateCards(limit);
    } else if (issue === "card-empty-history") {
      items = await listEmptyHistoryCards(limit);
    } else if (issue === "card-stale-prices") {
      items = await listStalePriceCards(limit);
    } else {
      return NextResponse.json({ error: "Unknown issue" }, { status: 400 });
    }

    return NextResponse.json({ ok: true, issue, items });
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;

    console.error("[admin/data-quality]", error);
    return NextResponse.json({ error: "Could not load data quality items" }, { status: 500 });
  }
}
