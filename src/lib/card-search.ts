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

function numericPaddingVariants(value: string): string[] {
  if (!/^\d+$/.test(value)) return [value];

  const withoutLeadingZeros = stripNumericLeadingZeros(value);
  return uniqueLowerStrings([
    value,
    withoutLeadingZeros,
    withoutLeadingZeros.padStart(2, "0"),
    withoutLeadingZeros.padStart(3, "0"),
    withoutLeadingZeros.padStart(4, "0"),
  ]);
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

function tokenizeSearchText(value: string): string[] {
  return normalizeSearchText(value).split(" ").filter(Boolean);
}

function cardNumberReferenceVariants(left: string, right: string): string[] {
  const leftVariants = numericPaddingVariants(left);
  const rightVariants = numericPaddingVariants(right);

  return leftVariants.flatMap((leftVariant) =>
    rightVariants.flatMap((rightVariant) => [
      `${leftVariant}/${rightVariant}`,
      `${leftVariant} ${rightVariant}`,
      `${leftVariant}${rightVariant}`,
    ])
  );
}

export function buildCardNumberSearchAliases(value: string | null | undefined): string[] {
  const normalized = value?.trim().replace(/^#+/, "").toLowerCase() ?? "";
  if (!normalized) return [];

  const aliases: Array<string | null> = [normalized];
  const compact = normalized.replace(/[^a-z0-9]+/g, "");
  const spaced = normalized.replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
  aliases.push(compact, spaced);

  const refMatch = /^([a-z]*\d+[a-z]*)(?:\s+)([a-z]*\d+[a-z]*)$/.exec(spaced);
  if (refMatch) {
    aliases.push(...cardNumberReferenceVariants(refMatch[1], refMatch[2]));
  }

  const slashMatch = /^(\d+)(\/.+)$/.exec(normalized);
  if (slashMatch) {
    const leftVariants = numericPaddingVariants(slashMatch[1]);
    const right = slashMatch[2].slice(1);
    const rightVariants = numericPaddingVariants(right);
    aliases.push(
      ...leftVariants.flatMap((leftVariant) =>
        rightVariants.map((rightVariant) => `${leftVariant}/${rightVariant}`)
      )
    );
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

export function textMatchesSearchQuery(
  values: Array<string | number | null | undefined> | string | null | undefined,
  query: string
): boolean {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return true;

  const haystack = Array.isArray(values) ? values.filter(Boolean).join(" ") : (values ?? "");
  const normalizedHaystack = normalizeSearchText(String(haystack));
  if (!normalizedHaystack) return false;

  const haystackTokens = normalizedHaystack.split(" ").filter(Boolean);
  const queryTokens = tokenizeSearchText(normalizedQuery);
  return queryTokens.every((token) => {
    if (token.length <= 2 && !/\d/.test(token)) {
      return haystackTokens.some((haystackToken) => haystackToken.startsWith(token));
    }

    return normalizedHaystack.includes(token);
  });
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
  ];

  return cardNumberMatchesSearch(card.cardNumber, query) || textMatchesSearchQuery(haystack, query);
}
