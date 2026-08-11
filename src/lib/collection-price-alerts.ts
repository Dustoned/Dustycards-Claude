import "server-only";

import { db } from "@/lib/db";
import {
  CARD_PRICE_ALERT_DROP,
  CARD_PRICE_ALERT_TARGET,
  isCardPriceAlertKind,
  isUsableCardPrice,
  roundCardPriceEur,
  shouldTriggerCardPriceAlert,
  type CardPriceAlertKind,
} from "@/lib/card-price-alerts-core";
import { getBinderPageData, getWantBinderPageData } from "@/lib/collection-data";
import { getSealedCardMarketValue } from "@/lib/price-history";
import {
  isMailConfigured,
  sendCardPriceAlertDigest,
  type CardPriceAlertEmailItem,
} from "@/lib/mail";
import { getMailPublicOrigin } from "@/lib/public-origin";

const ALERT_SWEEP_LIMIT = 500;
const MAX_TARGET_PRICE_EUR = 1_000_000;

export const COLLECTION_PRICE_ALERT_TARGETS = ["sealed", "binder", "wants"] as const;
export type CollectionPriceAlertTargetType =
  (typeof COLLECTION_PRICE_ALERT_TARGETS)[number];

const ALERT_SELECT = {
  id: true,
  kind: true,
  target_price_eur: true,
  baseline_price_eur: true,
  baseline_price_at: true,
  enabled: true,
  triggered_at: true,
  triggered_price_eur: true,
  created_at: true,
  updated_at: true,
} as const;

interface AlertRecord {
  id: string;
  kind: string;
  target_price_eur: number | null;
  baseline_price_eur: number | null;
  baseline_price_at: Date | null;
  enabled: boolean;
  triggered_at: Date | null;
  triggered_price_eur: number | null;
  created_at: Date;
  updated_at: Date;
}

interface ResolvedTarget {
  name: string;
  subtitle: string;
  currentPriceEur: number | null;
  currentPriceAt: Date | null;
  sourceLabel: string;
  pathname: string;
  actionLabel: string;
}

export interface CollectionPriceAlertView {
  id: string;
  kind: CardPriceAlertKind;
  targetPriceEur: number | null;
  baselinePriceEur: number | null;
  baselinePriceAt: string | null;
  enabled: boolean;
  triggeredAt: string | null;
  triggeredPriceEur: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface CollectionPriceAlertState {
  ok: true;
  alert: CollectionPriceAlertView | null;
  currentPriceEur: number | null;
  currentPriceAt: string | null;
  mailConfigured: boolean;
  sourceLabel: string;
}

export interface CollectionPriceAlertSweepResult {
  configured: boolean;
  checked: number;
  triggered: number;
  emailsSent: number;
  alertsSent: number;
  errors: string[];
}

export class CollectionPriceAlertError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "CollectionPriceAlertError";
    this.status = status;
  }
}

export function isCollectionPriceAlertTargetType(
  value: string
): value is CollectionPriceAlertTargetType {
  return COLLECTION_PRICE_ALERT_TARGETS.includes(
    value as CollectionPriceAlertTargetType
  );
}

function serializeAlert(alert: AlertRecord | null): CollectionPriceAlertView | null {
  if (!alert || !isCardPriceAlertKind(alert.kind)) return null;
  return {
    id: alert.id,
    kind: alert.kind,
    targetPriceEur: alert.target_price_eur,
    baselinePriceEur: alert.baseline_price_eur,
    baselinePriceAt: alert.baseline_price_at?.toISOString() ?? null,
    enabled: alert.enabled,
    triggeredAt: alert.triggered_at?.toISOString() ?? null,
    triggeredPriceEur: alert.triggered_price_eur,
    createdAt: alert.created_at.toISOString(),
    updatedAt: alert.updated_at.toISOString(),
  };
}

async function resolveTarget(
  targetType: CollectionPriceAlertTargetType,
  targetId: string,
  userId: string
): Promise<ResolvedTarget> {
  if (targetType === "sealed") {
    const product = await db.sealedProduct.findUnique({
      where: { id: targetId },
      select: {
        id: true,
        name: true,
        synced_at: true,
        cm_lowest: true,
        cm_lowest_eu: true,
        cm_lowest_de: true,
        cm_lowest_fr: true,
        cm_lowest_es: true,
        cm_lowest_it: true,
        episode: { select: { name: true } },
      },
    });
    if (!product) throw new CollectionPriceAlertError("Sealed product not found", 404);
    const latestValidPriceSnapshot = await db.sealedPriceSnapshot.findFirst({
      where: {
        product_id: product.id,
        OR: [
          { cm_lowest_eu: { gt: 0, not: 9001 } },
          { cm_lowest: { gt: 0, not: 9001 } },
          { cm_lowest_de: { gt: 0, not: 9001 } },
          { cm_lowest_fr: { gt: 0, not: 9001 } },
          { cm_lowest_es: { gt: 0, not: 9001 } },
          { cm_lowest_it: { gt: 0, not: 9001 } },
        ],
      },
      orderBy: [{ fetched_at: "desc" }, { id: "desc" }],
      select: { fetched_at: true },
    });

    return {
      name: product.name,
      subtitle: product.episode.name,
      currentPriceEur: getSealedCardMarketValue(product),
      currentPriceAt: latestValidPriceSnapshot?.fetched_at ?? product.synced_at,
      sourceLabel: "CardMarket EU sealed",
      pathname: `/search?sealed=${encodeURIComponent(product.id)}`,
      actionLabel: "View sealed product",
    };
  }

  const binder = await db.collectionBinder.findFirst({
    where: { id: targetId, user_id: userId },
    select: { id: true, name: true, updated_at: true },
  });
  if (!binder) throw new CollectionPriceAlertError("Binder not found", 404);

  if (targetType === "wants") {
    const data = await getWantBinderPageData(binder.id, userId);
    if (!data) throw new CollectionPriceAlertError("Want binder not found", 404);
    return {
      name: data.binder.name,
      subtitle: `${data.metrics.visibleMissingCards} missing cards`,
      currentPriceEur:
        data.metrics.pricedCards > 0 ? data.metrics.estimatedCost : null,
      currentPriceAt: binder.updated_at,
      sourceLabel: "Missing wants value",
      pathname: `/wants/binders/${encodeURIComponent(binder.id)}`,
      actionLabel: "View wants",
    };
  }

  const data = await getBinderPageData(binder.id, userId);
  if (!data) throw new CollectionPriceAlertError("Binder not found", 404);
  return {
    name: data.binder.name,
    subtitle: data.binder.episode?.name ?? "Custom binder",
    currentPriceEur:
      data.items.some((item) => item.current_value != null)
        ? data.metrics.currentValue
        : null,
    currentPriceAt: binder.updated_at,
    sourceLabel: "Binder market value",
    pathname: `/binders/${encodeURIComponent(binder.id)}`,
    actionLabel: "View binder",
  };
}

function buildState(
  alert: AlertRecord | null,
  target: ResolvedTarget
): CollectionPriceAlertState {
  return {
    ok: true,
    alert: serializeAlert(alert),
    currentPriceEur:
      target.currentPriceEur == null
        ? null
        : roundCardPriceEur(target.currentPriceEur),
    currentPriceAt: target.currentPriceAt?.toISOString() ?? null,
    mailConfigured: isMailConfigured(),
    sourceLabel: target.sourceLabel,
  };
}

export async function getCollectionPriceAlertState(
  targetType: CollectionPriceAlertTargetType,
  targetId: string,
  userId: string
): Promise<CollectionPriceAlertState> {
  const [target, alert] = await Promise.all([
    resolveTarget(targetType, targetId, userId),
    db.collectionPriceAlert.findUnique({
      where: {
        user_id_target_type_target_id: {
          user_id: userId,
          target_type: targetType,
          target_id: targetId,
        },
      },
      select: ALERT_SELECT,
    }),
  ]);
  return buildState(alert, target);
}

export async function saveCollectionPriceAlertForUser({
  targetType,
  targetId,
  userId,
  kind,
  targetPriceEur,
}: {
  targetType: CollectionPriceAlertTargetType;
  targetId: string;
  userId: string;
  kind: unknown;
  targetPriceEur?: unknown;
}): Promise<CollectionPriceAlertState> {
  if (!isCardPriceAlertKind(kind)) {
    throw new CollectionPriceAlertError('Alert kind must be "drop" or "target"');
  }

  let normalizedTarget: number | null = null;
  if (kind === CARD_PRICE_ALERT_TARGET) {
    if (typeof targetPriceEur !== "number" || !Number.isFinite(targetPriceEur)) {
      throw new CollectionPriceAlertError("Enter a valid target price");
    }
    normalizedTarget = roundCardPriceEur(targetPriceEur);
    if (!isUsableCardPrice(normalizedTarget) || normalizedTarget > MAX_TARGET_PRICE_EUR) {
      throw new CollectionPriceAlertError(
        `Target price must be between EUR 0.01 and EUR ${MAX_TARGET_PRICE_EUR.toLocaleString("en-GB")}`
      );
    }
  }

  const target = await resolveTarget(targetType, targetId, userId);
  const current =
    target.currentPriceEur == null ? null : roundCardPriceEur(target.currentPriceEur);
  if (kind === CARD_PRICE_ALERT_DROP && current == null) {
    throw new CollectionPriceAlertError(
      `A current ${target.sourceLabel} price is required for a drop alert`,
      409
    );
  }
  if (
    kind === CARD_PRICE_ALERT_TARGET &&
    normalizedTarget != null &&
    current != null &&
    normalizedTarget >= current
  ) {
    throw new CollectionPriceAlertError("Target price must be below the current price");
  }

  const alert = await db.collectionPriceAlert.upsert({
    where: {
      user_id_target_type_target_id: {
        user_id: userId,
        target_type: targetType,
        target_id: targetId,
      },
    },
    create: {
      user_id: userId,
      target_type: targetType,
      target_id: targetId,
      kind,
      target_price_eur: normalizedTarget,
      baseline_price_eur: current,
      baseline_price_at: target.currentPriceAt,
      enabled: true,
      triggered_at: null,
      triggered_price_eur: null,
    },
    update: {
      kind,
      target_price_eur: normalizedTarget,
      baseline_price_eur: current,
      baseline_price_at: target.currentPriceAt,
      enabled: true,
      triggered_at: null,
      triggered_price_eur: null,
    },
    select: ALERT_SELECT,
  });
  return buildState(alert, target);
}

export async function deleteCollectionPriceAlertForUser(
  targetType: CollectionPriceAlertTargetType,
  targetId: string,
  userId: string
): Promise<CollectionPriceAlertState> {
  const target = await resolveTarget(targetType, targetId, userId);
  await db.collectionPriceAlert.deleteMany({
    where: { user_id: userId, target_type: targetType, target_id: targetId },
  });
  return buildState(null, target);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function sweepCollectionPriceAlerts(): Promise<CollectionPriceAlertSweepResult> {
  const result: CollectionPriceAlertSweepResult = {
    configured: isMailConfigured(),
    checked: 0,
    triggered: 0,
    emailsSent: 0,
    alertsSent: 0,
    errors: [],
  };
  if (!result.configured) return result;

  const alerts = await db.collectionPriceAlert.findMany({
    where: {
      enabled: true,
      user: { disabled: false, email_verified_at: { not: null } },
    },
    orderBy: [{ updated_at: "asc" }, { id: "asc" }],
    take: ALERT_SWEEP_LIMIT,
    select: {
      ...ALERT_SELECT,
      target_type: true,
      target_id: true,
      user: { select: { id: true, email: true } },
    },
  });
  result.checked = alerts.length;
  if (alerts.length === 0) return result;

  const resolved = await Promise.all(
    alerts.map(async (alert) => {
      if (!isCollectionPriceAlertTargetType(alert.target_type)) return null;
      try {
        const target = await resolveTarget(alert.target_type, alert.target_id, alert.user.id);
        return { alert, target };
      } catch (error) {
        result.errors.push(`Price alert ${alert.id}: ${errorMessage(error)}`);
        return null;
      }
    })
  );
  const triggered = resolved.flatMap((entry) => {
    if (!entry || entry.target.currentPriceEur == null) return [];
    const currentPriceEur = roundCardPriceEur(entry.target.currentPriceEur);
    if (
      !shouldTriggerCardPriceAlert({
        enabled: entry.alert.enabled,
        kind: entry.alert.kind,
        targetPriceEur: entry.alert.target_price_eur,
        baselinePriceEur: entry.alert.baseline_price_eur,
        currentPriceEur,
      })
    ) {
      return [];
    }
    return [{ ...entry, currentPriceEur }];
  });
  result.triggered = triggered.length;
  if (triggered.length === 0) return result;

  let origin: string;
  try {
    origin = getMailPublicOrigin();
  } catch (error) {
    result.errors.push(errorMessage(error));
    return result;
  }

  const byUser = new Map<string, typeof triggered>();
  for (const candidate of triggered) {
    const existing = byUser.get(candidate.alert.user.id) ?? [];
    existing.push(candidate);
    byUser.set(candidate.alert.user.id, existing);
  }

  for (const candidates of byUser.values()) {
    const first = candidates[0];
    if (!first) continue;
    const items: CardPriceAlertEmailItem[] = candidates.map(
      ({ alert, target, currentPriceEur }) => ({
        name: target.name,
        setName: target.subtitle,
        kind: alert.kind as CardPriceAlertKind,
        currentPriceEur,
        baselinePriceEur: alert.baseline_price_eur,
        targetPriceEur: alert.target_price_eur,
        url: new URL(target.pathname, origin).toString(),
        sourceLabel: target.sourceLabel,
        actionLabel: target.actionLabel,
      })
    );

    try {
      await sendCardPriceAlertDigest({ to: first.alert.user.email, items });
      result.emailsSent += 1;
    } catch (error) {
      result.errors.push(
        `Could not send collection price alerts to user ${first.alert.user.id}: ${errorMessage(error)}`
      );
      continue;
    }

    const triggeredAt = new Date();
    for (const candidate of candidates) {
      try {
        const update = await db.collectionPriceAlert.updateMany({
          where: {
            id: candidate.alert.id,
            enabled: true,
            updated_at: candidate.alert.updated_at,
          },
          data: {
            enabled: false,
            triggered_at: triggeredAt,
            triggered_price_eur: candidate.currentPriceEur,
          },
        });
        result.alertsSent += update.count;
      } catch (error) {
        result.errors.push(
          `Price alert ${candidate.alert.id} was emailed but could not be marked triggered: ${errorMessage(error)}`
        );
      }
    }
  }

  return result;
}
