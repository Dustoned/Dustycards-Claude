import { NextRequest, NextResponse } from "next/server";
import { authErrorResponse, requireUser } from "@/lib/auth";
import { parseVisibleGameFilter } from "@/lib/games";
import { getServerUserSettings } from "@/lib/user-settings-server";
import {
  resetHiddenBinderWantsForUser,
  syncMissingBinderWantsForUser,
} from "@/lib/wantlist-planner";

function toNullableString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized ? normalized : null;
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const settings = await getServerUserSettings(user.id);
    const body = (await req.json().catch(() => ({}))) as {
      game?: unknown;
      resetHidden?: unknown;
      episodeId?: unknown;
    };
    const game = parseVisibleGameFilter(toNullableString(body.game), {
      onePieceEnabled: settings.onePieceLibraryEnabled,
    });
    const resetHidden = body.resetHidden === true;
    const episodeId = toNullableString(body.episodeId);

    const reset = resetHidden
      ? await resetHiddenBinderWantsForUser(user.id, {
          episodeId,
          game,
          includeOnePiece: settings.onePieceLibraryEnabled,
        })
      : { count: 0 };
    const sync = await syncMissingBinderWantsForUser(user.id, {
      game,
      includeOnePiece: settings.onePieceLibraryEnabled,
    });

    return NextResponse.json({
      success: true,
      resetHidden: reset.count,
      sync,
    });
  } catch (error) {
    return (
      authErrorResponse(error) ??
      NextResponse.json({ error: "Failed to sync want planner" }, { status: 500 })
    );
  }
}
