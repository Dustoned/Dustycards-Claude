import { NextRequest, NextResponse } from "next/server";
import { authErrorResponse, requireAdmin } from "@/lib/auth";
import { CARD_REPRINT_MODEL_VERSION } from "@/lib/card-printings";
import { db } from "@/lib/db";
import { collapseReprintReviewCandidates } from "@/lib/reprint-review";

export const dynamic = "force-dynamic";

function pair(left: string, right: string) {
  return left < right ? [left, right] as const : [right, left] as const;
}

export async function GET() {
  try {
    await requireAdmin();
    const [relations, overrides] = await Promise.all([
      db.cardPrintingRelation.findMany({
        where: {
          model_version: CARD_REPRINT_MODEL_VERSION,
          match_method: "likely-art",
        },
        orderBy: [{ image_similarity: "asc" }, { matched_at: "desc" }],
        take: 10_000,
        include: {
          sourceCard: { select: { id: true, name: true, card_number: true, image_url: true, episode: { select: { name: true } } } },
          targetCard: { select: { id: true, name: true, card_number: true, image_url: true, episode: { select: { name: true } } } },
        },
      }),
      db.cardPrintingOverride.findMany({
        select: { source_card_id: true, target_card_id: true, decision: true },
      }),
    ]);
    const candidates = relations.map((relation) => {
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
      candidates,
      confirmedPairs: [],
      decisions: overrides.map((override) => ({
        sourceCardId: override.source_card_id,
        targetCardId: override.target_card_id,
        decision: override.decision,
      })),
      limit: Math.max(1, candidates.length),
    });
    return NextResponse.json({
      ok: true,
      count: allItems.length,
      reviewedCount: overrides.length,
      items: allItems.slice(0, 100),
    });
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: "Could not load reprint review" }, { status: 500 });
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
    const cardCount = await db.card.count({ where: { id: { in: [sourceCardId, targetCardId] } } });
    if (cardCount !== 2) return NextResponse.json({ error: "Card pair not found" }, { status: 404 });

    await db.$transaction(async (tx) => {
      await tx.cardPrintingOverride.upsert({
        where: { source_card_id_target_card_id: { source_card_id: sourceCardId, target_card_id: targetCardId } },
        create: { user_id: user.id, source_card_id: sourceCardId, target_card_id: targetCardId, decision },
        update: { user_id: user.id, decision },
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
