import type { TradingCardGame } from "@/lib/games";

export const CARD_SCANNER_MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const CARD_SCANNER_MAX_RESULTS = 5;

export type CardScannerConfidence = "high" | "medium" | "low";
export type CardScannerField = "name" | "number" | "attack";

export interface CardScannerCatalogCard {
  id: string;
  game: TradingCardGame;
  name: string;
  card_number: string | null;
  printed_card_number: string | null;
  rarity: string | null;
  image_url: string | null;
  tcgid?: string | null;
  episode: {
    id: string;
    name: string;
    code: string | null;
  };
}

export interface RankedScannerCandidate {
  card: CardScannerCatalogCard;
  score: number;
  nameSimilarity: number;
  numberMatch: "exact" | "local" | null;
  setMatch: boolean;
  visualSimilarity: number | null;
  attackSimilarity: number | null;
}

export type ScannerFieldObservation = {
  value: string;
  confidence: number;
  catalogMatches: number;
};

export interface CardScannerMatch {
  id: string;
  game: TradingCardGame;
  name: string;
  card_number: string | null;
  printed_card_number: string | null;
  rarity: string | null;
  image_url: string | null;
  episode: {
    id: string;
    name: string;
    code: string | null;
  };
  price: number | null;
  want_item: {
    id: string;
    created_at: string;
  } | null;
  confidence: CardScannerConfidence;
  score: number;
  reasons: string[];
  autoAccept: boolean;
  runnerUpGap: number;
  evidence: {
    nameSimilarity: number;
    numberMatch: "exact" | "local" | null;
    setMatch: boolean;
    artworkSimilarity: number | null;
    attackSimilarity: number | null;
  };
}

export interface CardScannerResponse {
  ok: true;
  result: {
    matches: CardScannerMatch[];
    detected: {
      cardReferences: string[];
      strongestText: string | null;
      ocrConfidence: number | null;
    };
    processingMs: number;
  };
}

export interface CardScannerFieldResponse {
  ok: true;
  result: {
    field: CardScannerField;
    value: string | null;
    confidence: number | null;
    rawText: string | null;
    catalogMatches: number;
    processingMs: number;
  };
}

const COMMON_CARD_TEXT = new Set([
  "ability",
  "artist",
  "basic",
  "card",
  "damage",
  "energy",
  "evolves",
  "from",
  "game",
  "illustration",
  "item",
  "pokemon",
  "retreat",
  "stage",
  "supporter",
  "trainer",
  "weakness",
]);

function stripDiacritics(value: string): string {
  return value.normalize("NFKD").replace(/\p{Diacritic}/gu, "");
}

export function normalizeScannerText(value: string): string {
  return stripDiacritics(value)
    .toLowerCase()
    .replace(/[|()[\]{}]/g, " ")
    .replace(/[^\p{L}\p{N}./#&+'-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compactScannerText(value: string): string {
  return normalizeScannerText(value).replace(/[^a-z0-9]+/g, "");
}

function normalizeDigits(value: string): string {
  const normalized = value.replace(/^0+(?=\d)/, "");
  return normalized || "0";
}

export function normalizeScannerCardReference(value: string): string | null {
  const compact = stripDiacritics(value)
    .toUpperCase()
    .replace(/[—–_]/g, "-")
    .replace(/\s+/g, "")
    .replace(/^#+/, "")
    .replace(/O(?=\d)/g, "0");

  const onePiece = /^(OP|ST|EB|PRB)(\d{1,2})-?(\d{1,4})$/.exec(compact);
  if (onePiece) {
    return `${onePiece[1]}${normalizeDigits(onePiece[2]).padStart(2, "0")}-${normalizeDigits(onePiece[3]).padStart(3, "0")}`;
  }
  const onePiecePromo = /^P-?(\d{1,4})$/.exec(compact);
  if (onePiecePromo) {
    return `P-${normalizeDigits(onePiecePromo[1]).padStart(3, "0")}`;
  }

  const printed = /^(\d{1,4})\/(\d{1,4})$/.exec(compact);
  if (printed) {
    return `${normalizeDigits(printed[1])}/${normalizeDigits(printed[2])}`;
  }

  const local = /^(\d{1,4})$/.exec(compact);
  return local ? normalizeDigits(local[1]) : null;
}

export function extractScannerCardReferences(text: string): string[] {
  const normalized = stripDiacritics(text).toUpperCase().replace(/[—–_]/g, "-");
  const rawMatches = [
    ...normalized.matchAll(/\b(?:OP|ST|EB|PRB)\s*\d{1,2}\s*-\s*\d{3,4}\b/g),
    ...normalized.matchAll(/\bP\s*-\s*\d{3,4}\b/g),
    ...normalized.matchAll(/#?\s*\d{1,4}\s*\/\s*\d{1,4}\b/g),
  ];
  const references = rawMatches
    .map((match) => normalizeScannerCardReference(match[0]))
    .filter((value): value is string => Boolean(value));
  return [...new Set(references)];
}

function buildBigrams(value: string): Set<string> {
  const compact = compactScannerText(value);
  if (compact.length < 2) return new Set(compact ? [compact] : []);
  const bigrams = new Set<string>();
  for (let index = 0; index < compact.length - 1; index += 1) {
    bigrams.add(compact.slice(index, index + 2));
  }
  return bigrams;
}

export function getScannerTextSimilarity(left: string, right: string): number {
  const compactLeft = compactScannerText(left);
  const compactRight = compactScannerText(right);
  if (!compactLeft || !compactRight) return 0;
  if (compactLeft === compactRight) return 1;
  if (compactLeft.length >= 4 && compactRight.includes(compactLeft)) return 0.98;
  if (compactRight.length >= 4 && compactLeft.includes(compactRight)) return 0.98;

  const leftBigrams = buildBigrams(compactLeft);
  const rightBigrams = buildBigrams(compactRight);
  let intersection = 0;
  for (const bigram of leftBigrams) {
    if (rightBigrams.has(bigram)) intersection += 1;
  }
  const denominator = leftBigrams.size + rightBigrams.size;
  return denominator > 0 ? (2 * intersection) / denominator : 0;
}

function getMeaningfulOcrLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map(normalizeScannerText)
    .filter((line) => line.length >= 3)
    .filter((line) => !COMMON_CARD_TEXT.has(line))
    .slice(0, 80);
}

function getCardNameSimilarity(cardName: string, ocrText: string, ocrLines: string[]): number {
  const normalizedName = normalizeScannerText(cardName);
  const compactName = compactScannerText(cardName);
  const compactOcr = compactScannerText(ocrText);
  if (compactName.length >= 4 && compactOcr.includes(compactName)) return 1;

  let best = 0;
  for (const line of ocrLines) {
    best = Math.max(best, getScannerTextSimilarity(normalizedName, line));
  }
  return best;
}

function getNumberMatch(
  card: CardScannerCatalogCard,
  references: string[]
): RankedScannerCandidate["numberMatch"] {
  const printed = normalizeScannerCardReference(card.printed_card_number ?? "");
  const cardNumber = normalizeScannerCardReference(card.card_number ?? "");

  if (printed && references.includes(printed)) return "exact";
  if (cardNumber && references.includes(cardNumber)) return "exact";

  const localNumbers = references.map((reference) => reference.split("/")[0]);
  if (printed && localNumbers.includes(printed.split("/")[0])) return "local";
  if (cardNumber && localNumbers.includes(cardNumber.split("/")[0])) return "local";
  return null;
}

function getSetMatch(card: CardScannerCatalogCard, normalizedOcr: string): boolean {
  const code = normalizeScannerText(card.episode.code ?? "");
  if (!code) return false;
  const compactCode = compactScannerText(code);
  return compactCode.length >= 2 && compactScannerText(normalizedOcr).includes(compactCode);
}

export function rankScannerCandidates(
  cards: CardScannerCatalogCard[],
  ocrText: string,
  visualSimilarities: ReadonlyMap<string, number> = new Map(),
  attackSimilarities: ReadonlyMap<string, number> = new Map()
): RankedScannerCandidate[] {
  const normalizedOcr = normalizeScannerText(ocrText);
  const ocrLines = getMeaningfulOcrLines(ocrText);
  const references = extractScannerCardReferences(ocrText);

  return cards
    .map((card): RankedScannerCandidate => {
      const nameSimilarity = getCardNameSimilarity(card.name, normalizedOcr, ocrLines);
      const numberMatch = getNumberMatch(card, references);
      const setMatch = getSetMatch(card, normalizedOcr);
      const visualSimilarity = visualSimilarities.get(card.id) ?? null;
      const attackSimilarity = attackSimilarities.get(card.id) ?? null;

      let score = nameSimilarity * 52;
      if (numberMatch === "exact") score += 38;
      if (numberMatch === "local") score += 22;
      if (setMatch) score += 10;
      if (visualSimilarity != null) {
        score += Math.max(0, (visualSimilarity - 0.45) / 0.55) * 24;
      }
      if (attackSimilarity != null) {
        score += Math.max(0, (attackSimilarity - 0.45) / 0.55) * 16;
      }
      if (numberMatch && nameSimilarity >= 0.64) score += 8;
      if (numberMatch === "exact" && (visualSimilarity ?? 0) >= 0.84) score += 22;

      return {
        card,
        score: Math.min(100, Math.round(score * 10) / 10),
        nameSimilarity,
        numberMatch,
        setMatch,
        visualSimilarity,
        attackSimilarity,
      };
    })
    .filter((candidate) => {
      return (
        candidate.numberMatch != null ||
        candidate.nameSimilarity >= 0.48 ||
        (candidate.visualSimilarity ?? 0) >= 0.72 ||
        (candidate.attackSimilarity ?? 0) >= 0.72
      );
    })
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      if (right.nameSimilarity !== left.nameSimilarity) {
        return right.nameSimilarity - left.nameSimilarity;
      }
      return left.card.name.localeCompare(right.card.name);
    });
}

export function getScannerAttackObservation(
  cards: CardScannerCatalogCard[],
  ocrText: string
): ScannerFieldObservation | null {
  const references = new Set(extractScannerCardReferences(ocrText));
  const cardNames = cards.map((card) => normalizeScannerText(card.name));
  const ignored =
    /^(?:ability|artist|basic|energy|evolves from|hp|illustration|pokemon|resistance|retreat|stage \d*|trainer|weakness)$/i;
  const lines = ocrText
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length >= 4 && line.length <= 96)
    .filter((line) => /[a-z]{3}/i.test(line))
    .filter((line) => !ignored.test(line))
    .filter(
      (line) =>
        !references.has(normalizeScannerCardReference(line) ?? "") &&
        !cardNames.some(
          (name) => getScannerTextSimilarity(name, line) >= 0.88
        )
    )
    .sort((left, right) => {
      const leftWords = left.split(/\s+/).length;
      const rightWords = right.split(/\s+/).length;
      const leftScore = Math.min(leftWords, 8) * 8 + Math.min(left.length, 48);
      const rightScore = Math.min(rightWords, 8) * 8 + Math.min(right.length, 48);
      return rightScore - leftScore;
    })
    .slice(0, 2);

  if (lines.length === 0) return null;
  return {
    value: lines.join(" · ").slice(0, 140),
    confidence: 100,
    catalogMatches: 0,
  };
}

export function getScannerAttackSimilarity(
  observedText: string,
  attackTexts: readonly string[]
): number {
  const observedLines = observedText
    .split(/\s*[·\n]\s*/)
    .map((line) => line.trim())
    .filter((line) => line.length >= 3);
  if (observedLines.length === 0 || attackTexts.length === 0) return 0;

  let best = 0;
  for (const observed of observedLines) {
    for (const attackText of attackTexts) {
      best = Math.max(best, getScannerTextSimilarity(observed, attackText));
    }
  }
  return best;
}

export function getScannerNameObservation(
  cards: CardScannerCatalogCard[],
  ocrText: string
): ScannerFieldObservation | null {
  const ranked = rankScannerCandidates(cards, ocrText);
  const best = ranked[0];
  const bestName = normalizeScannerText(best?.card.name ?? "");
  const runnerUp = ranked.find(
    (candidate) => normalizeScannerText(candidate.card.name) !== bestName
  );
  const similarityGap =
    (best?.nameSimilarity ?? 0) - (runnerUp?.nameSimilarity ?? 0);
  const hasClearExactRead =
    (best?.nameSimilarity ?? 0) >= 0.82 && similarityGap >= 0.12;
  const hasClearFuzzyRead =
    (best?.nameSimilarity ?? 0) >= 0.74 && similarityGap >= 0.2;
  if (!best || (!hasClearExactRead && !hasClearFuzzyRead)) {
    return null;
  }
  return {
    value: best.card.name,
    confidence: Math.round(best.nameSimilarity * 1_000) / 10,
    catalogMatches: cards.filter(
      (card) => normalizeScannerText(card.name) === bestName
    ).length,
  };
}

export function getScannerNumberObservation(
  cards: CardScannerCatalogCard[],
  ocrText: string
): ScannerFieldObservation | null {
  const supported = extractScannerCardReferences(ocrText)
    .map((reference) => ({
      reference,
      matches: cards.filter((card) => {
        const printed = normalizeScannerCardReference(
          card.printed_card_number ?? ""
        );
        const local = normalizeScannerCardReference(card.card_number ?? "");
        return printed === reference || local === reference;
      }).length,
    }))
    .filter((candidate) => candidate.matches > 0)
    .sort((left, right) => left.matches - right.matches)[0];

  return supported
    ? {
        value: supported.reference,
        confidence: 100,
        catalogMatches: supported.matches,
      }
    : null;
}

export function getScannerConfidence(score: number): CardScannerConfidence {
  if (score >= 76) return "high";
  if (score >= 54) return "medium";
  return "low";
}

/**
 * Automatic collection queues must be considerably stricter than the visual
 * confidence badge. A score can be high because one signal is excellent; auto
 * acceptance requires independent identity signals and a clear lead over the
 * next printing.
 */
export function canAutoAcceptScannerCandidate(
  candidate: RankedScannerCandidate,
  runnerUpScore: number | null
): boolean {
  const gap = candidate.score - (runnerUpScore ?? 0);
  const artworkSimilarity = candidate.visualSimilarity ?? 0;

  if (candidate.numberMatch !== "exact" || gap < 12) return false;

  if (candidate.nameSimilarity >= 0.84) return true;

  return (
    candidate.nameSimilarity >= 0.68 &&
    artworkSimilarity >= 0.88 &&
    gap >= 14
  );
}

export function getScannerCandidateConfidence(
  candidate: RankedScannerCandidate,
  runnerUpScore: number | null
): CardScannerConfidence {
  if (canAutoAcceptScannerCandidate(candidate, runnerUpScore)) return "high";

  if (
    (candidate.numberMatch === "exact" && candidate.nameSimilarity >= 0.52) ||
    (candidate.nameSimilarity >= 0.82 &&
      (candidate.visualSimilarity ?? 0) >= 0.78)
  ) {
    return "medium";
  }

  return "low";
}

export function getScannerMatchReasons(candidate: RankedScannerCandidate): string[] {
  const reasons: string[] = [];
  if (candidate.numberMatch === "exact") reasons.push("Exact card number");
  else if (candidate.numberMatch === "local") reasons.push("Card number match");
  if (candidate.nameSimilarity >= 0.9) reasons.push("Strong name match");
  else if (candidate.nameSimilarity >= 0.6) reasons.push("Name match");
  if (candidate.setMatch) reasons.push("Set code match");
  if ((candidate.attackSimilarity ?? 0) >= 0.78) {
    reasons.push("Attack text match");
  }
  if ((candidate.visualSimilarity ?? 0) >= 0.84) reasons.push("Artwork match");
  return reasons.slice(0, 3);
}

export function getStrongestScannerText(text: string): string | null {
  const references = new Set(extractScannerCardReferences(text));
  const line = getMeaningfulOcrLines(text)
    .filter((value) => !references.has(normalizeScannerCardReference(value) ?? ""))
    .filter((value) => /[a-z]/i.test(value))
    .sort((left, right) => {
      const leftLetters = left.replace(/[^a-z]/gi, "").length;
      const rightLetters = right.replace(/[^a-z]/gi, "").length;
      return rightLetters - leftLetters;
    })[0];
  return line ?? null;
}
