const CARD_NUMBER_PREFIX_RE = /^([A-Za-z]+)(\d+)$/;

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

export function getDisplayCardNumber(card: {
  card_number?: string | null;
  printed_card_number?: string | null;
}): string | null {
  return normalizePrintedCardNumber(card.printed_card_number) ?? normalizePrintedCardNumber(card.card_number);
}
