import { canManuallyConfirmPrintingArtists } from "@/lib/print-family-policy";
import { NextRequest, NextResponse } from "next/server";
import { authErrorResponse, requireAdmin } from "@/lib/auth";
import { CARD_REPRINT_MODEL_VERSION, haveSameKnownPrintingArtist, isEligiblePrintFamilyPair } from "@/lib/card-printings";
import { db } from "@/lib/db";
import { collapseReprintReviewCandidates } from "@/lib/reprint-review";

export const dynamic = "force-dynamic";

function pair(left: string, right: string) {
  return left < right ? [left, right] as const : [right, left] as const;
}

export async function GET() {
  try {
    const user = await requireAdmin();
    const [relations, overrides] = await Promise.all([
      db.cardPrintingRelation.findMany({
        where: {
          match_method: { not: "manual-include" },
        },
        orderBy: [{ image_similarity: "asc" }, { matched_at: "desc" }],
        include: {
          sourceCard: { select: { id: true, name: true, artist: true, episode_id: true, card_number: true, image_url: true, episode: { select: { name: true } } } },
          targetCard: { select: { id: true, name: true, artist: true, episode_id: true, card_number: true, image_url: true, episode: { select: { name: true } } } },
        },
      }),
      db.cardPrintingOverride.findMany({
        orderBy: [{ updated_at: "desc" }, { id: "desc" }],
        include: {
          sourceCard: { select: { id: true, name: true, artist: true, card_number: true, image_url: true, episode: { select: { name: true } } } },
          targetCard: { select: { id: true, name: true, artist: true, card_number: true, image_url: true, episode: { select: { name: true } } } },
        },
      }),
    ]);
    const candidates = relations.filter(relation => {
      const source = relation.sourceCard, target = relation.targetCard;
      const conflict = source.artist?.trim() && target.artist?.trim() && !haveSameKnownPrintingArtist(source.artist, target.artist);
      return !conflict && (![CARD_REPRINT_MODEL_VERSION, "reprint-v13-artwork-family", "reprint-v12-exact-rules"].includes(relation.model_version) || !isEligiblePrintFamilyPair(source.episode_id, target.episode_id, source.artist, target.artist, relation.match_method, relation.image_similarity));
    }).map((relation) => {
      const [sourceId, targetId] = pair(relation.source_card_id, relation.target_card_id);
      const source = relation.source_card_id === sourceId ? relation.sourceCard : relation.targetCard;
      const target = relation.target_card_id === targetId ? relation.targetCard : relation.sourceCard;
      return {
        sourceCardId: sourceId,
        targetCardId: targetId,
        value: {
          source,
          target,
          matchMethod: relation.match_method,
          imageSimilarity: relation.image_similarity,
        },
      };
    });
    const allItems = collapseReprintReviewCandidates({
      candidates: [
        ...overrides.filter((override) => override.decision === "review").map((override) => ({
          sourceCardId: override.source_card_id, targetCardId: override.target_card_id,
          value: { source: override.sourceCard, target: override.targetCard, matchMethod: "returned-for-review", imageSimilarity: 0 },
        })),
        ...candidates,
      ],
      confirmedPairs: [],
      decisions: overrides.filter((override) => override.decision !== "review").map((override) => ({
        sourceCardId: override.source_card_id,
        targetCardId: override.target_card_id,
        decision: override.decision,
      })),
      limit: Math.max(1, candidates.length + overrides.length),
    });
    return NextResponse.json({
      ok: true,
      count: allItems.length,
      reviewedCount: overrides.filter((override) => override.decision !== "review").length,
      history: overrides.filter((override) => override.user_id === user.id && ["include", "exclude"].includes(override.decision)).slice(0, 20).map((override) => ({
        id: override.id, updatedAt: override.updated_at.toISOString(), decision: override.decision,
        source: override.sourceCard, target: override.targetCard,
      })),
      items: allItems.slice(0, 100),
    });
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: "Could not load reprint review" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await requireAdmin();
    const body = await request.json().catch(() => ({}));
    if (typeof body.id !== "string" || typeof body.updatedAt !== "string" || !Number.isFinite(Date.parse(body.updatedAt))) {
      return NextResponse.json({ error: "A review and its version are required" }, { status: 400 });
    }
    const restored = await db.$transaction(async (tx) => {
      const review = await tx.cardPrintingOverride.findFirst({ where: {
        id: body.id, user_id: user.id, decision: { in: ["include", "exclude"] },
      } });
      if (!review || review.updated_at.getTime() !== Date.parse(body.updatedAt)) return false;
      const changed = await tx.cardPrintingOverride.updateMany({
        where: { id: review.id, user_id: user.id, decision: review.decision },
        data: { decision: "review", reason: `Returned for review after undoing ${review.decision}` },
      });
      if (!changed.count) return false;
      await tx.cardPrintingRelation.deleteMany({ where: { OR: [
        { source_card_id: review.source_card_id, target_card_id: review.target_card_id },
        { source_card_id: review.target_card_id, target_card_id: review.source_card_id },
      ] } });
      return true;
    });
    return restored ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "This review has changed. Refresh and try again." }, { status: 409 });
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: "Could not undo reprint review" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAdmin();
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const sourceRaw = typeof body.sourceCardId === "string" ? body.sourceCardId.trim() : "";
    const targetRaw = typeof body.targetCardId === "string" ? body.targetCardId.trim() : "";
    const decision = body.decision === "include" || body.decision === "exclude" ? body.decision : null;
    if (!sourceRaw || !targetRaw || sourceRaw === targetRaw || !decision) {
      return NextResponse.json({ error: "Two cards and a valid decision are required" }, { status: 400 });
    }
    const [sourceCardId, targetCardId] = pair(sourceRaw, targetRaw);
    const cards = await db.card.findMany({ where: { id: { in: [sourceCardId, targetCardId] } }, select: { artist: true, name: true, game: true } });
    if (cards.length !== 2) return NextResponse.json({ error: "Card pair not found" }, { status: 404 });

    if (decision === "include" && (cards[0].name !== cards[1].name || cards[0].game !== cards[1].game || !canManuallyConfirmPrintingArtists(cards[0].artist, cards[1].artist))) {
      return NextResponse.json({ error: "Cards must have the same name and game, without conflicting known illustrators." }, { status: 400 });
    }
    await db.$transaction(async (tx) => {
      await tx.cardPrintingOverride.upsert({
        where: { source_card_id_target_card_id: { source_card_id: sourceCardId, target_card_id: targetCardId } },
        create: { user_id: user.id, source_card_id: sourceCardId, target_card_id: targetCardId, decision },
        update: { user_id: user.id, decision, reason: null },
      });
      await tx.cardPrintingRelation.deleteMany({
        where: {
          OR: [
            { source_card_id: sourceCardId, target_card_id: targetCardId },
            { source_card_id: targetCardId, target_card_id: sourceCardId },
          ],
        },
      });
      if (decision === "include") {
        await tx.cardPrintingRelation.createMany({
          data: [
            { source_card_id: sourceCardId, target_card_id: targetCardId, match_type: "reprint", match_method: "manual-include", image_similarity: 1, model_version: CARD_REPRINT_MODEL_VERSION },
            { source_card_id: targetCardId, target_card_id: sourceCardId, match_type: "reprint", match_method: "manual-include", image_similarity: 1, model_version: CARD_REPRINT_MODEL_VERSION },
          ],
        });
      }
    });
    return NextResponse.json({ ok: true, decision });
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: "Could not save reprint review" }, { status: 500 });
  }
}
