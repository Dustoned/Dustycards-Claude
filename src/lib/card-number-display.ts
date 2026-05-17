const CARD_NUMBER_PREFIX_RE = /^([A-Za-z]+)(\d+)$/;
const PROMO_SINGLE_NUMBER_PREFIXES = new Set(["BW", "DP", "HGSS", "SM", "SVP", "SWSH", "XY"]);
const PROMO_TEXT_RE = /\b(?:black\s+star|promo|promos)\b/i;

export function normalizePrintedCardNumber(value: string | null | undefined): string | null {
  const normalized = value?.trim().replace(/^#+/, "");
  return normalized || null;
}

export function getCardNumberPrefix(value: string | null | undefined): string | null {
  const normalized = normalizePrintedCardNumber(value);
  if (!normalized || normalized.includes("/") || normalized.includes("-")) return null;

  return CARD_NUMBER_PREFIX_RE.exec(normalized)?.[1].toUpperCase() ?? null;
}

export function getCardNumberNumericValue(value: string | null | undefined): number | null {
  const normalized = normalizePrintedCardNumber(value);
  if (!normalized) return null;

  const primary = normalized.split("/")[0]?.trim() ?? normalized;
  if (/^\d+$/.test(primary)) return Number(primary);

  const prefixed = CARD_NUMBER_PREFIX_RE.exec(primary);
  if (prefixed) return Number(prefixed[2]);

  return null;
}

export function buildPrintedCardNumber(
  cardNumber: string | null | undefined,
  options?: {
    officialCount?: number | null;
    prefixedCount?: number | null;
  }
): string | null {
  const normalized = normalizePrintedCardNumber(cardNumber);
  if (!normalized) return null;
  if (normalized.includes("/") || normalized.includes("-")) return normalized;

  if (/^\d+$/.test(normalized)) {
    const officialCount = options?.officialCount ?? null;
    return officialCount && officialCount > 0 ? `${normalized}/${officialCount}` : normalized;
  }

  const prefixed = CARD_NUMBER_PREFIX_RE.exec(normalized);
  const prefixedCount = options?.prefixedCount ?? null;
  if (prefixed && prefixedCount && prefixedCount > 0) {
    const prefix = prefixed[1].toUpperCase();
    return `${prefix}${prefixed[2]}/${prefix}${prefixedCount}`;
  }

  return normalized;
}

function isPromoLikeCard(card: {
  rarity?: string | null;
  episode?: { name?: string | null; code?: string | null } | null;
}): boolean {
  const rarity = card.rarity?.trim() ?? "";
  const episodeName = card.episode?.name?.trim() ?? "";
  const episodeCode = card.episode?.code?.trim() ?? "";

  return (
    PROMO_TEXT_RE.test(rarity) ||
    PROMO_TEXT_RE.test(episodeName) ||
    /^PR-/i.test(episodeCode)
  );
}

function getPromoSingleNumberOverride(card: {
  card_number?: string | null;
  printed_card_number?: string | null;
  rarity?: string | null;
  episode?: { name?: string | null; code?: string | null } | null;
}): string | null {
  if (!isPromoLikeCard(card)) return null;

  const cardNumber = normalizePrintedCardNumber(card.card_number);
  const printedNumber = normalizePrintedCardNumber(card.printed_card_number);
  if (!cardNumber || !printedNumber || !printedNumber.includes("/")) return null;

  const [printedPrimary, printedTotal] = printedNumber.split("/", 2).map((part) => part.trim());
  if (printedPrimary.toUpperCase() !== cardNumber.toUpperCase()) return null;

  const primaryPrefix = getCardNumberPrefix(cardNumber);
  const totalPrefix = getCardNumberPrefix(printedTotal);
  if (!primaryPrefix || primaryPrefix !== totalPrefix) return null;

  return PROMO_SINGLE_NUMBER_PREFIXES.has(primaryPrefix) ? cardNumber : null;
}

export function getDisplayCardNumber(card: {
  card_number?: string | null;
  printed_card_number?: string | null;
  rarity?: string | null;
  episode?: { name?: string | null; code?: string | null } | null;
}): string | null {
  const promoSingleNumber = getPromoSingleNumberOverride(card);
  if (promoSingleNumber) return promoSingleNumber;

  return normalizePrintedCardNumber(card.printed_card_number) ?? normalizePrintedCardNumber(card.card_number);
}
