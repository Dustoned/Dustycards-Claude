import { NextRequest, NextResponse } from "next/server";
import { authErrorResponse, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { normalizeTradingCardGame } from "@/lib/games";

const MIN_QUERY_LENGTH = 2;
const MAX_QUERY_LENGTH = 80;
const CANDIDATE_LIMIT = 220;
const RESULT_LIMIT = 12;

function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export async function GET(req: NextRequest) {
  try {
    await requireUser();
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ ok: false, error: "Authentication failed" }, { status: 500 });
  }

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, MAX_QUERY_LENGTH);
  if (q.length < MIN_QUERY_LENGTH) {
    return NextResponse.json({ ok: true, result: [] });
  }

  const game = normalizeTradingCardGame(req.nextUrl.searchParams.get("game") ?? "");

  try {
    const cards = await db.card.findMany({
      where: {
        game,
        name: { contains: q },
      },
      select: { name: true },
      orderBy: [{ name: "asc" }],
      take: CANDIDATE_LIMIT,
    });
    const queryKey = normalizeKey(q);
    const seen = new Set<string>();
    const suggestions = cards
      .map((card) => card.name.trim())
      .filter(Boolean)
      .filter((cardName) => {
        const key = normalizeKey(cardName);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => {
        const aKey = normalizeKey(a);
        const bKey = normalizeKey(b);
        const aPrefix = aKey.startsWith(queryKey);
        const bPrefix = bKey.startsWith(queryKey);
        if (aPrefix !== bPrefix) return aPrefix ? -1 : 1;
        return a.localeCompare(b, "nl", { sensitivity: "base" });
      })
      .slice(0, RESULT_LIMIT);

    return NextResponse.json({ ok: true, result: suggestions });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load card name suggestions.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
