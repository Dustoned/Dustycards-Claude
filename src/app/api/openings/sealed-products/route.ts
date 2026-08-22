import { NextRequest, NextResponse } from "next/server";
import { authErrorResponse, requireUser } from "@/lib/auth";
import { getSealedOriginMarketPrice } from "@/lib/collection-sealed-origin";
import { db } from "@/lib/db";
import { isHiddenExpansion } from "@/lib/episodes";
import { ONE_PIECE_GAME, POKEMON_GAME } from "@/lib/games";
import { inferSealedOpeningPackCount, isOpenableSealedProduct } from "@/lib/opening-sealed";
import { getSealedSearchTokens, rankSealedSearchCandidates } from "@/lib/sealed-search";
import { getServerUserSettings } from "@/lib/user-settings-server";

const PAGE_SIZE = 60;
const MAX_QUERY_LENGTH = 100;

function readOffset(value: string | null): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? Math.min(parsed, 10_000) : 0;
}

function isReleasedBy(value: string | Date | null | undefined, now: Date): boolean {
  if (!value) return true;
  const timestamp = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(timestamp) && timestamp <= now.getTime();
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
    if (query.length > MAX_QUERY_LENGTH) {
      return NextResponse.json({ error: `Query too long (max ${MAX_QUERY_LENGTH} characters)` }, { status: 400 });
    }

    const offset = readOffset(request.nextUrl.searchParams.get("offset"));
    const settings = await getServerUserSettings(user.id);
    const games = settings.onePieceLibraryEnabled
      ? [POKEMON_GAME, ONE_PIECE_GAME]
      : [POKEMON_GAME];
    const queryTokens = getSealedSearchTokens(query);
    const products = await db.sealedProduct.findMany({
      where: {
        game: { in: games },
        ...(queryTokens.length > 0
          ? {
              AND: queryTokens.map((token) => ({
                OR: [
                  { name: { contains: token } },
                  { episode: { name: { contains: token } } },
                  { episode: { code: { contains: token } } },
                ],
              })),
            }
          : {}),
      },
      orderBy: [{ release_date: "desc" }, { synced_at: "desc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        image_url: true,
        game: true,
        cm_lowest: true,
        cm_lowest_eu: true,
        cm_lowest_de: true,
        cm_lowest_fr: true,
        cm_lowest_es: true,
        cm_lowest_it: true,
        cm_avg_7d: true,
        cm_avg_30d: true,
        release_date: true,
        episode: { select: { id: true, name: true, code: true, release_date: true } },
      },
    });

    const now = new Date();
    const openable = products.filter(
      (product) => {
        const effectiveReleaseDate = product.release_date ?? product.episode.release_date;
        return !isHiddenExpansion(product.episode) &&
          isOpenableSealedProduct(product.name) &&
          isReleasedBy(effectiveReleaseDate, now);
      }
    );
    const matches = query ? rankSealedSearchCandidates(openable, query) : openable;
    const page = matches.slice(offset, offset + PAGE_SIZE);
    const setCodes = [...new Set(page.map((product) => product.episode.code?.trim()).filter(Boolean))] as string[];
    const profiles = setCodes.length
      ? await db.setPullRateProfile.findMany({
          where: { set_code: { in: setCodes } },
          orderBy: { updated_at: "desc" },
          select: { set_code: true, packs_per_booster_box: true },
        })
      : [];
    const packsBySetCode = new Map<string, number | null>();
    for (const profile of profiles) {
      const code = profile.set_code.trim().toLocaleLowerCase();
      if (!packsBySetCode.has(code)) packsBySetCode.set(code, profile.packs_per_booster_box);
    }

    return NextResponse.json({
      items: page.map((product) => ({
        productId: product.id,
        name: product.name,
        imageUrl: product.image_url,
        game: product.game,
        episode: {
          id: product.episode.id,
          name: product.episode.name,
          code: product.episode.code,
        },
        marketPrice: getSealedOriginMarketPrice(product),
        suggestedPacks: inferSealedOpeningPackCount(
          product.name,
          product.episode.code
            ? packsBySetCode.get(product.episode.code.trim().toLocaleLowerCase())
            : null,
          product.game
        ),
      })),
      total: matches.length,
      nextOffset: offset + PAGE_SIZE < matches.length ? offset + PAGE_SIZE : null,
    });
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: "Could not load sealed products" }, { status: 500 });
  }
}
