import { NextRequest, NextResponse } from "next/server";
import { authErrorResponse, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { isHiddenExpansion, isRedundantSubsetExpansion } from "@/lib/episodes";

const MAX_RESULTS = 100;
const CANDIDATE_LIMIT = 180;

type TradeSuggestionRow = {
  id: string;
  name: string;
  card_number: string | null;
  printed_card_number: string | null;
  version: string | null;
  rarity: string | null;
  supertype: string | null;
  image_url: string | null;
  cm_en_lowest_nm: number;
  episode_id: string;
  episode_name: string;
  episode_code: string | null;
  episode_release_date: string | null;
};

function parseTarget(value: string | null): number | null {
  const parsed = value == null ? Number.NaN : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 1_000_000) : null;
}

export async function GET(request: NextRequest) {
  try {
    await requireUser();
  } catch (error) {
    return (
      authErrorResponse(error) ??
      NextResponse.json({ error: "Authentication failed" }, { status: 500 })
    );
  }

  const target = parseTarget(request.nextUrl.searchParams.get("target"));
  if (target == null) {
    return NextResponse.json({ error: "A valid target value is required." }, { status: 400 });
  }

  const requestedGame = request.nextUrl.searchParams.get("game")?.trim();
  const game =
    requestedGame === "one-piece" || requestedGame === "all"
      ? requestedGame
      : "pokemon";

  try {
    const rows = await db.$queryRawUnsafe<TradeSuggestionRow[]>(
      `
        SELECT
          c.id,
          c.name,
          c.card_number,
          c.printed_card_number,
          c.version,
          c.rarity,
          c.supertype,
          c.image_url,
          p.cm_en_lowest_nm,
          e.id AS episode_id,
          e.name AS episode_name,
          e.code AS episode_code,
          e.release_date AS episode_release_date
        FROM "Card" c
        INNER JOIN "Episode" e ON e.id = c.episode_id
        INNER JOIN "Price" p ON p.id = (
          SELECT p2.id
          FROM "Price" p2
          WHERE p2.card_id = c.id
            AND p2.cm_en_lowest_nm > 0
            AND p2.cm_en_lowest_nm <> 9001
          ORDER BY p2.fetched_at DESC, p2.id DESC
          LIMIT 1
        )
        WHERE (? = 'all' OR c.game = ?)
        ORDER BY ABS(p.cm_en_lowest_nm - ?) ASC, p.cm_en_lowest_nm DESC, c.name ASC
        LIMIT ${CANDIDATE_LIMIT}
      `,
      game,
      game,
      target
    );

    const singles = rows
      .filter(
        (row) =>
          !isHiddenExpansion({
            id: row.episode_id,
            code: row.episode_code,
            name: row.episode_name,
          }) && !isRedundantSubsetExpansion(row.episode_name)
      )
      .slice(0, MAX_RESULTS)
      .map((row) => ({
        id: row.id,
        name: row.name,
        card_number: row.printed_card_number ?? row.card_number,
        version: row.version,
        rarity: row.rarity,
        supertype: row.supertype,
        image_url: row.image_url,
        episode_id: row.episode_id,
        episode_name: row.episode_name,
        episode_code: row.episode_code,
        episode_release_date: row.episode_release_date,
        cm_en_lowest_nm: row.cm_en_lowest_nm,
      }));

    return NextResponse.json({ singles, target });
  } catch (error) {
    console.error("[trade-suggestions] Failed to load value matches", error);
    return NextResponse.json(
      { error: "Value-matched cards could not be loaded." },
      { status: 500 }
    );
  }
}
