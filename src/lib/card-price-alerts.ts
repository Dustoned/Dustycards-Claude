import "server-only";

import { db } from "@/lib/db";
import {
  loadLatestSafeEnglishNmPrices,
  type CardMarketHistoryIdentity,
} from "@/lib/card-market-history";
import {
  CARD_PRICE_ALERT_DROP,
  CARD_PRICE_ALERT_TARGET,
  isCardPriceAlertKind,
  isUsableCardPrice,
  roundCardPriceEur,
  shouldTriggerCardPriceAlert,
  type CardPriceAlertKind,
} from "@/lib/card-price-alerts-core";
import { ONE_PIECE_GAME } from "@/lib/games";
import {
  isMailConfigured,
  sendCardPriceAlertDigest,
  type CardPriceAlertEmailItem,
} from "@/lib/mail";
import { getMailPublicOrigin } from "@/lib/public-origin";
import { getServerUserSettings } from "@/lib/user-settings-server";

const CARD_PRICE_ALERT_SWEEP_LIMIT = 500;
const MAX_TARGET_PRICE_EUR = 1_000_000;

const CARD_SELECT = {
  id: true,
  game: true,
  episode_id: true,
  name: true,
  card_number: true,
  printed_card_number: true,
  cardmarket_id: true,
  cardmarket_url: true,
  episode: {
    select: {
      name: true,
      code: true,
    },
  },
} as const;

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

interface CardRecord {
  id: string;
  game: string;
  episode_id: string;
  name: string;
  card_number: string | null;
  printed_card_number: string | null;
  cardmarket_id: string | null;
  cardmarket_url: string | null;
  episode: {
    name: string;
    code: string | null;
  };
}

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

export interface CardPriceAlertView {
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

export interface CardPriceAlertState {
  ok: true;
  alert: CardPriceAlertView | null;
  currentPriceEur: number | null;
  currentPriceAt: string | null;
  mailConfigured: boolean;
}

export interface CardPriceAlertSweepResult {
  configured: boolean;
  checked: number;
  triggered: number;
  emailsSent: number;
  alertsSent: number;
  errors: string[];
}

export class CardPriceAlertError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "CardPriceAlertError";
    this.status = status;
  }
}

function toHistoryIdentity(card: CardRecord): CardMarketHistoryIdentity {
  return {
    id: card.id,
    game: card.game,
    episodeId: card.episode_id,
    name: card.name,
    cardNumber: card.card_number,
    printedCardNumber: card.printed_card_number,
    cardmarketId: card.cardmarket_id,
    cardmarketUrl: card.cardmarket_url,
  };
}

function serializeAlert(alert: AlertRecord | null): CardPriceAlertView | null {
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

async function requireVisibleCard(cardId: string, userId: string): Promise<CardRecord> {
  const card = await db.card.findUnique({
    where: { id: cardId },
    select: CARD_SELECT,
  });
  if (!card) throw new CardPriceAlertError("Card not found", 404);

  if (card.game === ONE_PIECE_GAME) {
    const settings = await getServerUserSettings(userId);
    if (!settings.onePieceLibraryEnabled) {
      throw new CardPriceAlertError("One Piece library is not enabled", 403);
    }
  }
  return card;
}

async function loadCurrentPrice(card: CardRecord) {
  const prices = await loadLatestSafeEnglishNmPrices([toHistoryIdentity(card)]);
  return prices.get(card.id) ?? null;
}

function buildState(
  alert: AlertRecord | null,
  current: { value: number; fetchedAt: Date } | null
): CardPriceAlertState {
  return {
    ok: true,
    alert: serializeAlert(alert),
    currentPriceEur: current ? roundCardPriceEur(current.value) : null,
    currentPriceAt: current?.fetchedAt.toISOString() ?? null,
    mailConfigured: isMailConfigured(),
  };
}

export async function getCardPriceAlertState(
  cardId: string,
  userId: string
): Promise<CardPriceAlertState> {
  const card = await requireVisibleCard(cardId, userId);
  const [alert, current] = await Promise.all([
    db.cardPriceAlert.findUnique({
      where: { user_id_card_id: { user_id: userId, card_id: cardId } },
      select: ALERT_SELECT,
    }),
    loadCurrentPrice(card),
  ]);
  return buildState(alert, current);
}

export async function saveCardPriceAlertForUser({
  cardId,
  userId,
  kind,
  targetPriceEur,
}: {
  cardId: string;
  userId: string;
  kind: unknown;
  targetPriceEur?: unknown;
}): Promise<CardPriceAlertState> {
  if (!isCardPriceAlertKind(kind)) {
    throw new CardPriceAlertError('Alert kind must be "drop" or "target"');
  }

  let normalizedTarget: number | null = null;
  if (kind === CARD_PRICE_ALERT_TARGET) {
    if (typeof targetPriceEur !== "number" || !Number.isFinite(targetPriceEur)) {
      throw new CardPriceAlertError("Enter a valid target price");
    }
    normalizedTarget = roundCardPriceEur(targetPriceEur);
    if (!isUsableCardPrice(normalizedTarget) || normalizedTarget > MAX_TARGET_PRICE_EUR) {
      throw new CardPriceAlertError(
        `Target price must be between EUR 0.01 and EUR ${MAX_TARGET_PRICE_EUR.toLocaleString("en-GB")}`
      );
    }
  }

  const card = await requireVisibleCard(cardId, userId);
  const current = await loadCurrentPrice(card);
  const normalizedCurrent = current ? roundCardPriceEur(current.value) : null;

  if (kind === CARD_PRICE_ALERT_DROP && normalizedCurrent == null) {
    throw new CardPriceAlertError(
      "A current CardMarket EN / Near Mint price is required for a drop alert",
      409
    );
  }
  if (
    kind === CARD_PRICE_ALERT_TARGET &&
    normalizedTarget != null &&
    normalizedCurrent != null &&
    normalizedTarget >= normalizedCurrent
  ) {
    throw new CardPriceAlertError("Target price must be below the current price");
  }

  const alert = await db.cardPriceAlert.upsert({
    where: { user_id_card_id: { user_id: userId, card_id: cardId } },
    create: {
      user_id: userId,
      card_id: cardId,
      kind,
      target_price_eur: normalizedTarget,
      baseline_price_eur: normalizedCurrent,
      baseline_price_at: current?.fetchedAt ?? null,
      enabled: true,
      triggered_at: null,
      triggered_price_eur: null,
    },
    update: {
      kind,
      target_price_eur: normalizedTarget,
      baseline_price_eur: normalizedCurrent,
      baseline_price_at: current?.fetchedAt ?? null,
      enabled: true,
      triggered_at: null,
      triggered_price_eur: null,
    },
    select: ALERT_SELECT,
  });

  return buildState(alert, current);
}

export async function deleteCardPriceAlertForUser(
  cardId: string,
  userId: string
): Promise<CardPriceAlertState> {
  const card = await requireVisibleCard(cardId, userId);
  const current = await loadCurrentPrice(card);
  await db.cardPriceAlert.deleteMany({
    where: { user_id: userId, card_id: cardId },
  });
  return buildState(null, current);
}

function buildCardUrl(origin: string, card: CardRecord): string {
  const url = new URL(
    `/movers/signal-radar/${encodeURIComponent(card.id)}`,
    origin
  );
  url.searchParams.set("game", card.game);
  return url.toString();
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Evaluates active one-shot alerts against the latest safe raw CardMarket
 * EN/NM quote. State is changed only after the grouped email was accepted by
 * the mail transport, so a temporary mail failure cannot silently lose alerts.
 */
export async function sweepCardPriceAlerts(): Promise<CardPriceAlertSweepResult> {
  const result: CardPriceAlertSweepResult = {
    configured: isMailConfigured(),
    checked: 0,
    triggered: 0,
    emailsSent: 0,
    alertsSent: 0,
    errors: [],
  };
  if (!result.configured) return result;

  const alerts = await db.cardPriceAlert.findMany({
    where: {
      enabled: true,
      user: {
        disabled: false,
        email_verified_at: { not: null },
      },
    },
    orderBy: [{ updated_at: "asc" }, { id: "asc" }],
    take: CARD_PRICE_ALERT_SWEEP_LIMIT,
    select: {
      ...ALERT_SELECT,
      card_id: true,
      user: {
        select: {
          id: true,
          email: true,
        },
      },
      card: {
        select: CARD_SELECT,
      },
    },
  });
  result.checked = alerts.length;
  if (alerts.length === 0) return result;

  const prices = await loadLatestSafeEnglishNmPrices(
    alerts.map((alert) => toHistoryIdentity(alert.card))
  );
  const triggered = alerts.flatMap((alert) => {
    const current = prices.get(alert.card_id) ?? null;
    if (
      !current ||
      !shouldTriggerCardPriceAlert({
        enabled: alert.enabled,
        kind: alert.kind,
        targetPriceEur: alert.target_price_eur,
        baselinePriceEur: alert.baseline_price_eur,
        currentPriceEur: current.value,
      })
    ) {
      return [];
    }
    return [{ alert, currentPriceEur: roundCardPriceEur(current.value) }];
  });
  result.triggered = triggered.length;
  if (triggered.length === 0) return result;

  let publicOrigin: string;
  try {
    publicOrigin = getMailPublicOrigin();
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
      ({ alert, currentPriceEur }) => ({
        name: alert.card.name,
        setName: alert.card.episode.name,
        kind: alert.kind as CardPriceAlertKind,
        currentPriceEur,
        baselinePriceEur: alert.baseline_price_eur,
        targetPriceEur: alert.target_price_eur,
        url: buildCardUrl(publicOrigin, alert.card),
      })
    );

    try {
      await sendCardPriceAlertDigest({
        to: first.alert.user.email,
        items,
      });
      result.emailsSent += 1;
    } catch (error) {
      result.errors.push(
        `Could not send card price alerts to user ${first.alert.user.id}: ${errorMessage(error)}`
      );
      continue;
    }

    const triggeredAt = new Date();
    for (const candidate of candidates) {
      try {
        const update = await db.cardPriceAlert.updateMany({
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
