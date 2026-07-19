export const CARD_PRICE_ALERT_DROP = "drop" as const;
export const CARD_PRICE_ALERT_TARGET = "target" as const;

export type CardPriceAlertKind =
  | typeof CARD_PRICE_ALERT_DROP
  | typeof CARD_PRICE_ALERT_TARGET;

export interface CardPriceAlertTriggerInput {
  enabled: boolean;
  kind: string;
  targetPriceEur: number | null;
  baselinePriceEur: number | null;
  currentPriceEur: number | null;
}

export function isUsableCardPrice(value: number | null | undefined): value is number {
  return value != null && Number.isFinite(value) && value > 0 && value !== 9001;
}

export function roundCardPriceEur(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function priceInCents(value: number): number {
  return Math.round(value * 100);
}

export function isCardPriceAlertKind(value: unknown): value is CardPriceAlertKind {
  return value === CARD_PRICE_ALERT_DROP || value === CARD_PRICE_ALERT_TARGET;
}

/**
 * Card alerts compare the raw CardMarket EN/NM quote at cent precision. A
 * drop alert is strict (below its armed baseline), while a target alert is
 * inclusive (at or below the user's amount).
 */
export function shouldTriggerCardPriceAlert(
  input: CardPriceAlertTriggerInput
): boolean {
  if (!input.enabled || !isUsableCardPrice(input.currentPriceEur)) return false;

  const currentCents = priceInCents(input.currentPriceEur);
  if (input.kind === CARD_PRICE_ALERT_DROP) {
    return (
      isUsableCardPrice(input.baselinePriceEur) &&
      currentCents < priceInCents(input.baselinePriceEur)
    );
  }

  if (input.kind === CARD_PRICE_ALERT_TARGET) {
    return (
      isUsableCardPrice(input.targetPriceEur) &&
      currentCents <= priceInCents(input.targetPriceEur)
    );
  }

  return false;
}
