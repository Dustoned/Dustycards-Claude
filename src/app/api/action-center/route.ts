import { NextRequest, NextResponse } from "next/server";
import { authErrorResponse, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { dailySignalNotifications } from "@/lib/signal-learning";
import { getServerUserSettings } from "@/lib/user-settings-server";

export const dynamic = "force-dynamic";

const MAX_ITEM_KEY_LENGTH = 240;

type ActionItem = {
  id: string;
  kind: "account" | "alert" | "ebay" | "signal" | "feedback";
  title: string;
  detail: string;
  href: string;
  occurredAt: string;
  tone: "positive" | "warning" | "neutral";
};

export async function GET() {
  try {
    const user = await requireUser();
    const now = new Date();
    const recent = new Date(now.getTime() - 30 * 24 * 60 * 60_000);
    const ebayWindowStart = new Date(now.getTime() - 24 * 60 * 60_000);
    const ebayWindowEnd = new Date(now.getTime() + 48 * 60 * 60_000);

    const [cardAlerts, collectionAlerts, watched, outcomes, feedback, pendingAccounts, settings] = await Promise.all([
      db.cardPriceAlert.findMany({
        where: { user_id: user.id, triggered_at: { gte: recent } },
        orderBy: { triggered_at: "desc" },
        take: 8,
        include: { card: { select: { id: true, name: true } } },
      }),
      db.collectionPriceAlert.findMany({
        where: { user_id: user.id, triggered_at: { gte: recent } },
        orderBy: { triggered_at: "desc" },
        take: 8,
      }),
      db.ebayWatchedListing.findMany({
        where: { user_id: user.id, item_end_date: { gte: ebayWindowStart, lte: ebayWindowEnd } },
        orderBy: { item_end_date: "asc" },
        take: 8,
      }),
      db.externalSignalOutcome.findMany({
        where: {
          status: "complete",
          evaluated_at: { gte: recent },
          meaningful_direction_hit: { not: null },
        },
        orderBy: { evaluated_at: "desc" },
        select: { evaluated_at: true, meaningful_direction_hit: true, entry_observation: { select: { game: true } } },
      }),
      user.role === "admin"
        ? db.feedback.findMany({ where: { status: "new" }, orderBy: { created_at: "desc" }, take: 12 })
        : Promise.resolve([]),
      user.role === "admin"
        ? db.user.findMany({
            where: { disabled: true, approval_requested_at: { not: null } },
            orderBy: { approval_requested_at: "desc" },
            take: 12,
            select: { id: true, email: true, approval_requested_at: true },
          })
        : Promise.resolve([]),
      getServerUserSettings(user.id),
    ]);

    const items: ActionItem[] = [
      ...cardAlerts.map((alert) => ({
        id: `card-alert-${alert.id}-${(alert.triggered_at ?? alert.updated_at).getTime()}`,
        kind: "alert" as const,
        title: `${alert.card.name} price alert`,
        detail:
          alert.triggered_price_eur == null
            ? "Your price condition was reached."
            : `Triggered at EUR ${alert.triggered_price_eur.toFixed(2)}.`,
        href: `/?card=${encodeURIComponent(alert.card.id)}`,
        occurredAt: (alert.triggered_at ?? alert.updated_at).toISOString(),
        tone: "positive" as const,
      })),
      ...collectionAlerts.map((alert) => ({
        id: `collection-alert-${alert.id}-${(alert.triggered_at ?? alert.updated_at).getTime()}`,
        kind: "alert" as const,
        title: `${alert.target_type === "sealed" ? "Sealed" : "Collection"} price alert`,
        detail:
          alert.triggered_price_eur == null
            ? "Your price condition was reached."
            : `Triggered at EUR ${alert.triggered_price_eur.toFixed(2)}.`,
        href: alert.target_type === "sealed" ? "/?tab=sealed" : alert.target_type === "binder" ? "/?tab=binders" : "/wants",
        occurredAt: (alert.triggered_at ?? alert.updated_at).toISOString(),
        tone: "positive" as const,
      })),
      ...watched.map((listing) => {
        const ended = Boolean(listing.item_end_date && listing.item_end_date <= now);
        return {
          id: `ebay-${listing.id}-${ended ? "ended" : "ending"}`,
          kind: "ebay" as const,
          title: ended ? "Watched eBay listing ended" : "eBay listing ending soon",
          detail: listing.title,
          href: listing.item_web_url,
          occurredAt: (listing.item_end_date ?? listing.created_at).toISOString(),
          tone: ended ? ("neutral" as const) : ("warning" as const),
        };
      }),
      ...dailySignalNotifications(outcomes, settings.onePieceLibraryEnabled),
      ...feedback.map((item) => ({
        id: `feedback-${item.id}`,
        kind: "feedback" as const,
        title: item.category === "reprint" ? "Reprint report needs review" : "New feedback",
        detail: item.message,
        href: "/settings?section=feedback",
        occurredAt: item.created_at.toISOString(),
        tone: "warning" as const,
      })),
      ...pendingAccounts.map((account) => ({
        id: `account-approval-${account.id}-${account.approval_requested_at!.getTime()}`,
        kind: "account" as const,
        title: "Account waiting for approval",
        detail: account.email,
        href: `/account?tab=users&user=${encodeURIComponent(account.id)}`,
        occurredAt: account.approval_requested_at!.toISOString(),
        tone: "warning" as const,
      })),
    ].sort((left, right) => right.occurredAt.localeCompare(left.occurredAt)).slice(0, 24);

    const readReceipts = items.length
      ? await db.actionCenterReceipt.findMany({
          where: {
            user_id: user.id,
            item_key: { in: items.map((item) => item.id) },
          },
          select: { item_key: true },
        })
      : [];
    const readItemKeys = new Set(readReceipts.map((receipt) => receipt.item_key));
    const unreadItems = items.filter((item) => !readItemKeys.has(item.id));

    return NextResponse.json({ ok: true, count: unreadItems.length, items: unreadItems });
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: "Could not load actions" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = (await req.json().catch(() => ({}))) as { itemId?: unknown };
    const itemId = typeof body.itemId === "string" ? body.itemId.trim() : "";

    if (!itemId || itemId.length > MAX_ITEM_KEY_LENGTH) {
      return NextResponse.json({ error: "A valid action item is required" }, { status: 400 });
    }

    await db.actionCenterReceipt.upsert({
      where: {
        user_id_item_key: {
          user_id: user.id,
          item_key: itemId,
        },
      },
      create: {
        user_id: user.id,
        item_key: itemId,
      },
      update: {
        read_at: new Date(),
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: "Could not mark action as read" }, { status: 500 });
  }
}
