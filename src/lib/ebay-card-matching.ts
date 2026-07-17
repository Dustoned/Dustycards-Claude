export type EbayCardMatchStatus = "matched" | "review" | "unmatched";
export type EbayCardMatchOverrideSource = "auto" | "confirmed" | "ignored";

export interface EbayMatchCard {
  id: string;
  name: string;
  card_number: string | null;
  rarity: string | null;
  image_url?: string | null;
  episode: {
    id: string;
    name: string;
    code: string | null;
  };
}

export interface EbayCardMatchCandidate {
  card: EbayMatchCard;
  confidence: number;
  reason: string;
}

export interface EbayCardMatch {
  status: EbayCardMatchStatus;
  confidence: number;
  reason: string;
  source: EbayCardMatchOverrideSource;
  card: EbayMatchCard | null;
  candidates: EbayCardMatchCandidate[];
  isGradedListing: boolean;
  gradingCompany: string | null;
  gradingGrade: string | null;
}

export interface EbayCardMatchOverride {
  status: "confirmed" | "ignored";
  card: EbayMatchCard | null;
}

interface ListingTextSignals {
  normalizedTitle: string;
  tokens: Set<string>;
  variants: Set<string>;
  numbers: Set<string>;
  codedCardReferences: Array<{ prefix: string; number: string; key: string }>;
  codedRefNumbers: Set<string>;
  hashRefNumbers: Set<string>;
  slashRefs: Array<{ left: string; right: string }>;
  isAccessoryListing: boolean;
  isGradedListing: boolean;
  gradingCompany: string | null;
  gradingGrade: string | null;
}

const COMMON_TITLE_TOKENS = new Set([
  "a",
  "an",
  "and",
  "card",
  "cards",
  "full",
  "art",
  "gem",
  "mega",
  "mint",
  "near",
  "nm",
  "pokemon",
  "s",
  "tcg",
  "the",
]);

const VARIANT_ALIASES = new Map<string, string>([
  ["ex", "ex"],
  ["gx", "gx"],
  ["v", "v"],
  ["vmax", "vmax"],
  ["vstar", "vstar"],
  ["vunion", "vunion"],
  ["prime", "prime"],
  ["star", "star"],
  ["delta", "delta"],
]);

const GRADING_COMPANIES = ["PSA", "BGS", "CGC", "SGC", "ACE", "TAG", "AIGRADING"];
const GRADING_COMPANY_TITLE_PATTERN =
  String.raw`(?:psa|bgs|beckett|cgc|sgc|ace|tag|ai\s*grading|aigrading)`;
const GRADING_DESCRIPTOR_TITLE_PATTERN =
  String.raw`(?:(?:gem\s*(?:mint|mt)|pristine|perfect|black\s*label)\s*)?`;
const ACCESSORY_TOKENS = new Set([
  "acrylic",
  "acryl",
  "case",
  "canvas",
  "custom",
  "diy",
  "display",
  "extended",
  "fake",
  "fanmade",
  "frame",
  "gemalde",
  "gemaelde",
  "holder",
  "homemade",
  "jumbo",
  "keychain",
  "leinwand",
  "malerei",
  "mystery",
  "novelty",
  "painting",
  "proxy",
  "read",
  "replica",
  "oversize",
  "oversized",
  "sticker",
  "stickers",
  "stand",
  "unikat",
]);

export function normalizeEbayMatchText(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[\u2605\u2606\u2726\u2727]/gu, " star ")
    .replace(/[\u03b4\u0394]/gu, " delta ")
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}/#.' -]+/gu, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenizeEbayMatchText(value: string | null | undefined): string[] {
  const normalized = normalizeEbayMatchText(value);
  const tokens = normalized.match(/[\p{L}\p{N}]+/gu) ?? [];
  const seen = new Set<string>();
  const result: string[] = [];

  for (const token of tokens) {
    const canonical = VARIANT_ALIASES.get(token) ?? token;
    if (!canonical || seen.has(canonical)) continue;
    seen.add(canonical);
    result.push(canonical);
  }

  return result;
}

export function extractUsefulEbayTitleTokens(value: string): string[] {
  return tokenizeEbayMatchText(value).filter(
    (token) =>
      token.length >= 3 &&
      !COMMON_TITLE_TOKENS.has(token) &&
      !/^\d+$/.test(token) &&
      !GRADING_COMPANIES.some((company) => company.toLowerCase() === token)
  );
}

function canonicalCardNumber(value: string | null | undefined): string | null {
  const token = tokenizeEbayMatchText(value ?? "")[0];
  return token?.replace(/^0+/, "") || token || null;
}

function canonicalReferenceNumber(value: string): string {
  const match = /^(\d+)([a-z]?)$/i.exec(value);
  if (!match) return value.toLowerCase();

  const digits = match[1].replace(/^0+/, "") || "0";
  return `${digits}${match[2].toLowerCase()}`;
}

function createCodedCardReference(prefix: string, number: string) {
  const canonicalPrefix = prefix.toLowerCase().replace(/[-\s]+/g, "");
  const canonicalNumber = canonicalReferenceNumber(number);
  return {
    prefix: canonicalPrefix,
    number: canonicalNumber,
    key: `${canonicalPrefix}:${canonicalNumber}`,
  };
}

function canonicalCodedCardReference(value: string | null | undefined): {
  prefix: string;
  number: string;
  key: string;
} | null {
  const normalized = normalizeEbayMatchText(value).replace(/^#\s*/, "");
  if (!normalized || normalized.includes("/")) return null;

  const separated = /^([a-z]+\d*)\s*[- ]\s*(\d+[a-z]?)$/i.exec(normalized);
  if (separated) return createCodedCardReference(separated[1], separated[2]);

  // One Piece references are sometimes written without their separator (OP01016).
  const compactOnePiece = /^((?:(?:op|st|eb|prb)\d{2})|p)(\d{3}[a-z]?)$/i.exec(
    normalized
  );
  if (compactOnePiece) {
    return createCodedCardReference(compactOnePiece[1], compactOnePiece[2]);
  }

  const compact = /^([a-z]+)(\d+[a-z]?)$/i.exec(normalized);
  return compact ? createCodedCardReference(compact[1], compact[2]) : null;
}

function extractCodedCardReferences(value: string): Array<{
  prefix: string;
  number: string;
  key: string;
}> {
  const normalized = normalizeEbayMatchText(value);
  const references = new Map<string, { prefix: string; number: string; key: string }>();
  const addReference = (prefix: string, number: string) => {
    const reference = createCodedCardReference(prefix, number);
    references.set(reference.key, reference);
  };

  for (const match of normalized.matchAll(/\b([a-z]+\d*)\s*[- ]\s*(\d+[a-z]?)\b/gi)) {
    addReference(match[1], match[2]);
  }
  for (const match of normalized.matchAll(/\b((?:(?:op|st|eb|prb)\d{2})|p)(\d{3}[a-z]?)\b/gi)) {
    addReference(match[1], match[2]);
  }
  for (const match of normalized.matchAll(/\b([a-z]+)(\d+[a-z]?)\b/gi)) {
    addReference(match[1], match[2]);
  }

  return [...references.values()];
}

function canonicalCardSlashReference(
  value: string | null | undefined
): { left: string; right: string } | null {
  const normalized = normalizeEbayMatchText(value);
  const match = /\b([a-z]*\d+[a-z]*)\s*\/\s*([a-z0-9-]+)\b/i.exec(normalized);
  if (!match) return null;

  return {
    left: match[1].replace(/^0+/, "") || match[1],
    right: match[2].replace(/^0+/, "") || match[2],
  };
}

function extractVariants(value: string): Set<string> {
  const tokens = tokenizeEbayMatchText(
    normalizeEbayMatchText(value)
      .replace(/\bex\s*\/\s*nm\b/g, " ")
      .replace(/\bblack\s+star\s+promos?\b/g, " ")
  );
  const variants = new Set<string>();

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === "v" && tokens[index + 1] === "union") {
      variants.add("vunion");
      continue;
    }

    const variant = VARIANT_ALIASES.get(token);
    if (variant) variants.add(variant);
  }

  return variants;
}

function getCardNameTokens(card: EbayMatchCard): string[] {
  return tokenizeEbayMatchText(card.name).filter(
    (token) => token.length >= 2 && !COMMON_TITLE_TOKENS.has(token) && !VARIANT_ALIASES.has(token)
  );
}

function getListingSignals(title: string, condition: string | null | undefined): ListingTextSignals {
  const normalizedTitle = normalizeEbayMatchText(title);
  const titleWithoutSlashDenominators = normalizedTitle.replace(
    /\b([a-z]*\d+[a-z]*)\s*\/\s*([a-z0-9-]+)\b/gi,
    "$1"
  );
  const tokens = new Set(tokenizeEbayMatchText(titleWithoutSlashDenominators));
  const slashRefs = [...normalizedTitle.matchAll(/\b([a-z]*\d+[a-z]*)\s*\/\s*([a-z0-9-]+)\b/gi)]
    .map((match) => ({
      left: match[1].replace(/^0+/, "") || match[1],
      right: match[2].replace(/^0+/, "") || match[2],
    }));
  const slashRightNumbers = new Set(slashRefs.map((ref) => ref.right));
  const companyFirstGradePattern = new RegExp(
    String.raw`\b(${GRADING_COMPANY_TITLE_PATTERN})\s*${GRADING_DESCRIPTOR_TITLE_PATTERN}(\d+(?:\.\d+)?)\b`,
    "i"
  );
  const gradeFirstCompanyPattern = new RegExp(
    String.raw`\b(\d+(?:\.\d+)?)\s*(${GRADING_COMPANY_TITLE_PATTERN})\b`,
    "i"
  );
  const gradeNumberTokens = new Set(
    [
      ...normalizedTitle.matchAll(
        new RegExp(
          String.raw`\b(?:${GRADING_COMPANY_TITLE_PATTERN}|graded|grade|gem\s*(?:mint|mt)|gm)\s*${GRADING_DESCRIPTOR_TITLE_PATTERN}(\d+(?:\.\d+)?)\b`,
          "gi"
        )
      ),
      ...normalizedTitle.matchAll(
        new RegExp(
          String.raw`\b(\d+(?:\.\d+)?)\s*(?:${GRADING_COMPANY_TITLE_PATTERN}|graded|grade|gem\s*(?:mint|mt)|gm)\b`,
          "gi"
        )
      ),
    ].map((match) => match[1].replace(/^0+/, "") || match[1])
  );
  const numbers = new Set<string>();
  for (const token of tokens) {
    if (/^\d+[a-z]*$/.test(token)) {
      const normalizedToken = token.replace(/^0+/, "") || token;
      if (!slashRightNumbers.has(normalizedToken) && !gradeNumberTokens.has(normalizedToken)) {
        numbers.add(normalizedToken);
      }
    }
  }
  for (const ref of slashRefs) {
    numbers.add(ref.left);
  }
  const codedRefNumbers = new Set<string>();
  for (const token of tokens) {
    const codedRef = token.match(/^[a-z]{3,}0*(\d{2,3}[a-z]?)$/i)?.[1];
    if (codedRef) codedRefNumbers.add(codedRef.replace(/^0+/, "") || codedRef);
  }
  const hashRefNumbers = new Set(
    [...normalizedTitle.matchAll(/#\s*0*(\d{1,3}[a-z]?)\b/gi)].map(
      (match) => match[1].replace(/^0+/, "") || match[1]
    )
  );

  const companyFirstGradeMatch = normalizedTitle.match(companyFirstGradePattern);
  const gradeFirstCompanyMatch = normalizedTitle.match(gradeFirstCompanyPattern);
  const rawGradingCompany =
    companyFirstGradeMatch?.[1] ?? gradeFirstCompanyMatch?.[2] ?? null;
  const gradingCompanyToken = rawGradingCompany
    ?.replace(/\s+/g, "")
    .toUpperCase();
  const gradingCompany = gradingCompanyToken === "BECKETT" ? "BGS" : gradingCompanyToken ?? null;
  const gradingGrade = companyFirstGradeMatch?.[2] ?? gradeFirstCompanyMatch?.[1] ?? null;
  const conditionText = normalizeEbayMatchText(condition ?? "");
  const isAccessoryListing = [...tokens].some((token) => ACCESSORY_TOKENS.has(token));
  const isGradedListing = Boolean(
    companyFirstGradeMatch ||
      gradeFirstCompanyMatch ||
      /\b(graded|valutata|graad)\b/i.test(conditionText) ||
      /\b(graded|slab|graad)\b/i.test(normalizedTitle)
  );

  return {
    normalizedTitle,
    tokens,
    variants: extractVariants(title),
    numbers,
    codedCardReferences: extractCodedCardReferences(title),
    codedRefNumbers,
    hashRefNumbers,
    slashRefs,
    isAccessoryListing,
    isGradedListing,
    gradingCompany,
    gradingGrade,
  };
}

export function listingHasExactCardIdentity(input: {
  title: string;
  condition?: string | null;
  card: EbayMatchCard;
}): boolean {
  const signals = getListingSignals(input.title, input.condition);
  const codedCardReference = canonicalCodedCardReference(input.card.card_number);
  if (codedCardReference) {
    return signals.codedCardReferences.some(
      (reference) => reference.key === codedCardReference.key
    );
  }

  const cardNumber = canonicalCardNumber(input.card.card_number);
  if (cardNumber) {
    const cardSlashReference = canonicalCardSlashReference(input.card.card_number);
    const sameNumeratorSlashReferences = cardSlashReference
      ? signals.slashRefs.filter((reference) => reference.left === cardSlashReference.left)
      : [];
    if (
      cardSlashReference &&
      sameNumeratorSlashReferences.length > 0 &&
      !sameNumeratorSlashReferences.some(
        (reference) => reference.right === cardSlashReference.right
      )
    ) {
      return false;
    }

    return (
      signals.tokens.has(cardNumber) ||
      signals.numbers.has(cardNumber) ||
      signals.codedRefNumbers.has(cardNumber) ||
      signals.hashRefNumbers.has(cardNumber) ||
      signals.slashRefs.some((reference) => reference.left === cardNumber)
    );
  }

  const nameTokens = getCardNameTokens(input.card);
  return nameTokens.length > 0 && nameTokens.every((token) => signals.tokens.has(token));
}

function hasSetHint(signals: ListingTextSignals, card: EbayMatchCard): boolean {
  const code = normalizeEbayMatchText(card.episode.code ?? "");
  if (code && signals.tokens.has(code)) return true;

  const setTokens = tokenizeEbayMatchText(card.episode.name).filter(
    (token) => token.length >= 4 && !COMMON_TITLE_TOKENS.has(token)
  );
  return setTokens.length > 0 && setTokens.every((token) => signals.tokens.has(token));
}

function scoreCardAgainstListing(
  signals: ListingTextSignals,
  card: EbayMatchCard
): EbayCardMatchCandidate | null {
  const nameTokens = getCardNameTokens(card);
  if (nameTokens.length === 0) return null;

  const matchedNameTokens = nameTokens.filter((token) => signals.tokens.has(token));
  if (matchedNameTokens.length === 0) return null;

  const cardVariants = extractVariants(card.name);
  const titleVariants = signals.variants;
  const codedCardReference = canonicalCodedCardReference(card.card_number);
  const hasExactCodedCardReference = Boolean(
    codedCardReference &&
      signals.codedCardReferences.some(
        (reference) => reference.key === codedCardReference.key
      )
  );
  const cardNumber = codedCardReference?.number ?? canonicalCardNumber(card.card_number);
  const cardSlashReference = canonicalCardSlashReference(card.card_number);
  const hasNumber = Boolean(
    cardNumber &&
      (codedCardReference
        ? hasExactCodedCardReference
        : signals.numbers.has(cardNumber) ||
          signals.codedRefNumbers.has(cardNumber) ||
          signals.hashRefNumbers.has(cardNumber))
  );
  const hasDifferentFullCodedReference = Boolean(
    codedCardReference &&
      !hasExactCodedCardReference &&
      signals.codedCardReferences.some(
        (reference) => reference.prefix === codedCardReference.prefix
      )
  );
  const hasDifferentSlashNumber = Boolean(
    cardNumber && !hasNumber && signals.slashRefs.length > 0
  );
  const hasDifferentCodedRefNumber = Boolean(
    cardNumber && !hasNumber && signals.codedRefNumbers.size > 0
  );
  const hasDifferentHashRefNumber = Boolean(
    cardNumber && !hasNumber && signals.hashRefNumbers.size > 0
  );
  const hasDifferentSlashDenominator = Boolean(
    cardSlashReference &&
      signals.slashRefs.some(
        (reference) =>
          reference.left === cardSlashReference.left &&
          reference.right !== cardSlashReference.right
      ) &&
      !signals.slashRefs.some(
        (reference) =>
          reference.left === cardSlashReference.left &&
          reference.right === cardSlashReference.right
      )
  );
  const hasPromoLikeSlash = Boolean(
    cardNumber &&
      signals.slashRefs.some(
        (ref) => ref.left === cardNumber && /[a-z]/i.test(ref.right) && !hasSetHint(signals, card)
      )
  );
  const setHint = hasSetHint(signals, card);

  if (
    hasDifferentFullCodedReference ||
    hasDifferentSlashNumber ||
    hasDifferentSlashDenominator ||
    hasDifferentCodedRefNumber ||
    hasDifferentHashRefNumber
  ) {
    return null;
  }

  let score = 0;
  const reasons: string[] = [];

  if (matchedNameTokens.length === nameTokens.length) {
    score += 44;
    reasons.push("name");
  } else {
    score += Math.floor((matchedNameTokens.length / nameTokens.length) * 24);
  }

  const missingCardVariant = [...cardVariants].some((variant) => !titleVariants.has(variant));
  const extraTitleVariant = [...titleVariants].some((variant) => !cardVariants.has(variant));
  if (!missingCardVariant && !extraTitleVariant) {
    score += cardVariants.size > 0 ? 24 : 8;
    if (cardVariants.size > 0) reasons.push("variant");
  } else {
    score -= missingCardVariant ? 34 : 0;
    score -= extraTitleVariant ? 28 : 0;
    reasons.push("variant mismatch");
  }

  if (hasNumber) {
    score += 34;
    reasons.push("number");
  }

  if (setHint) {
    score += 18;
    reasons.push("set");
  }

  if (hasPromoLikeSlash) {
    score -= 42;
    reasons.push("promo-style number");
  }

  const confidence = Math.max(0, Math.min(100, score));
  if (confidence < 25) return null;

  return {
    card,
    confidence,
    reason: reasons.join(", ") || "title",
  };
}

function emptyMatch(signals: ListingTextSignals, reason: string): EbayCardMatch {
  return {
    status: "unmatched",
    confidence: 0,
    reason,
    source: "auto",
    card: null,
    candidates: [],
    isGradedListing: signals.isGradedListing,
    gradingCompany: signals.gradingCompany,
    gradingGrade: signals.gradingGrade,
  };
}

export function matchEbayListingToCard(input: {
  title: string;
  condition?: string | null;
  candidates: EbayMatchCard[];
  requestedMode: "raw" | "graded";
  override?: EbayCardMatchOverride | null;
}): EbayCardMatch {
  const signals = getListingSignals(input.title, input.condition);

  if (input.override?.status === "ignored") {
    return {
      ...emptyMatch(signals, "Ignored manually"),
      source: "ignored",
    };
  }

  if (input.override?.status === "confirmed" && input.override.card) {
    return {
      status: "matched",
      confidence: 100,
      reason: "Confirmed manually",
      source: "confirmed",
      card: input.override.card,
      candidates: [{ card: input.override.card, confidence: 100, reason: "Confirmed manually" }],
      isGradedListing: signals.isGradedListing,
      gradingCompany: signals.gradingCompany,
      gradingGrade: signals.gradingGrade,
    };
  }

  const rankedCandidates = input.candidates
    .map((card) => scoreCardAgainstListing(signals, card))
    .filter((candidate): candidate is EbayCardMatchCandidate => Boolean(candidate))
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 5);
  const best = rankedCandidates[0] ?? null;
  if (!best) return emptyMatch(signals, "No DustyCards card match");

  const second = rankedCandidates[1] ?? null;
  const ambiguous = Boolean(second && best.confidence - second.confidence < 12);
  const rawModeGradedListing = input.requestedMode === "raw" && signals.isGradedListing;
  const accessoryListing = signals.isAccessoryListing;
  const status: EbayCardMatchStatus =
    best.confidence >= 82 && !ambiguous && !rawModeGradedListing && !accessoryListing
      ? "matched"
      : "review";

  return {
    status,
    confidence: best.confidence,
    reason: rawModeGradedListing
      ? "Graded-looking listing in raw mode"
      : accessoryListing
        ? "Accessory-looking listing"
        : best.reason,
    source: "auto",
    card: best.card,
    candidates: rankedCandidates,
    isGradedListing: signals.isGradedListing,
    gradingCompany: signals.gradingCompany,
    gradingGrade: signals.gradingGrade,
  };
}
