function uniqueLowerStrings(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = value?.trim().toLowerCase();
    if (!normalized || seen.has(normalized)) continue;

    seen.add(normalized);
    result.push(normalized);
  }

  return result;
}

function stripNumericLeadingZeros(value: string): string {
  const stripped = value.replace(/^0+(?=\d)/, "");
  return stripped || "0";
}

function extractSearchableInput(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";

  try {
    const url = new URL(trimmed);
    const segments = url.pathname.split("/").filter(Boolean);
    const lastSegment = segments[segments.length - 1];
    if (lastSegment) return decodeURIComponent(lastSegment);
  } catch {
    // Plain search text, not a URL.
  }

  return trimmed;
}

function normalizeSearchText(value: string): string {
  return extractSearchableInput(value)
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}#/]+/gu, " ")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

export function buildCardNumberSearchAliases(value: string | null | undefined): string[] {
  const normalized = value?.trim().replace(/^#+/, "").toLowerCase() ?? "";
  if (!normalized) return [];

  const aliases: Array<string | null> = [normalized];
  const slashMatch = /^(\d+)(\/.+)$/.exec(normalized);
  if (slashMatch) {
    aliases.push(`${stripNumericLeadingZeros(slashMatch[1])}${slashMatch[2]}`);
  }

  if (/^\d+$/.test(normalized)) {
    const withoutLeadingZeros = stripNumericLeadingZeros(normalized);
    aliases.push(withoutLeadingZeros);
    aliases.push(withoutLeadingZeros.padStart(2, "0"));
    aliases.push(withoutLeadingZeros.padStart(3, "0"));
    aliases.push(withoutLeadingZeros.padStart(4, "0"));
  }

  return uniqueLowerStrings(aliases);
}

export function cardNumberMatchesSearch(
  cardNumber: string | null | undefined,
  query: string
): boolean {
  const normalizedCardNumber = cardNumber?.trim().replace(/^#+/, "").toLowerCase() ?? "";
  const normalizedQuery = query.trim().replace(/^#+/, "").toLowerCase();
  if (!normalizedCardNumber || !normalizedQuery) return false;

  if (normalizedCardNumber.includes(normalizedQuery)) return true;

  const cardAliases = new Set(buildCardNumberSearchAliases(normalizedCardNumber));
  return buildCardNumberSearchAliases(normalizedQuery).some((alias) => cardAliases.has(alias));
}

export function cardMatchesSearchQuery(
  card: {
    name: string | null | undefined;
    cardNumber: string | null | undefined;
    episodeName: string | null | undefined;
    episodeCode: string | null | undefined;
    rarity?: string | null | undefined;
  },
  query: string
): boolean {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return true;

  const episodeCode = card.episodeCode?.trim().toLowerCase() ?? "";
  const cardNumberAliases = buildCardNumberSearchAliases(card.cardNumber);
  const compactRefs = episodeCode
    ? cardNumberAliases.map((cardNumber) => `${episodeCode}${cardNumber}`)
    : [];
  const haystack = [
    card.name,
    card.cardNumber,
    card.episodeName,
    card.episodeCode,
    card.rarity,
    ...compactRefs,
  ]
    .filter(Boolean)
    .join(" ");
  const normalizedHaystack = normalizeSearchText(haystack);

  return (
    normalizedHaystack.includes(normalizedQuery) ||
    cardNumberMatchesSearch(card.cardNumber, normalizedQuery)
  );
}
