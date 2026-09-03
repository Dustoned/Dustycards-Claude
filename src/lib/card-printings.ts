import { db } from "@/lib/db";
import { getCurrentRawCardmarketValue } from "@/lib/market-price-sanity";
import sharp from "sharp";

const TCGDEX_CARD_ENDPOINT = "https://api.tcgdex.net/v2/en/cards";
export const CARD_REPRINT_MODEL_VERSION = "reprint-v12-exact-rules";
const MIN_LINEAGE_VERIFIED_IMAGE_SIMILARITY = 0.84;
const LIKELY_REPRINT_IMAGE_SIMILARITY = 0.68;
const STRONG_REPRINT_IMAGE_SIMILARITY = 0.92;
const COLOR_SIGNATURE_PREFIX = "rgb1:";
const MAX_CACHED_ARTWORK_HASHES = 512;
const MAX_CACHED_TCGDEX_SEARCHES = 256;
const artworkHashCache = new Map<string, Promise<ArtworkHash | null>>();
const tcgdexSearchCache = new Map<string, Promise<TcgDexCardBrief[]>>();

export type ArtworkHash = {
  full: string;
  illustration: string;
};

type TcgDexCardBrief = {
  id?: string;
  name?: string;
  image?: string;
};

type TcgDexAbility = {
  type?: string;
  name?: string;
  effect?: string;
};

type TcgDexAttack = {
  cost?: string[];
  name?: string;
  effect?: string;
  damage?: string | number;
};

export type TcgDexCardIdentity = {
  category?: string;
  name?: string;
  illustrator?: string;
  hp?: number;
  types?: string[];
  evolveFrom?: string;
  stage?: string;
  suffix?: string;
  trainerType?: string;
  energyType?: string;
  effect?: string;
  abilities?: TcgDexAbility[];
  attacks?: TcgDexAttack[];
  weaknesses?: Array<{ type?: string; value?: string }>;
  resistances?: Array<{ type?: string; value?: string }>;
  retreat?: number;
};

export interface RelatedCardPrinting {
  id: string;
  name: string;
  card_number: string | null;
  version: string | null;
  rarity: string | null;
  image_url: string | null;
  cardmarket_url: string | null;
  episode_id: string;
  episode_name: string;
  episode_code: string | null;
  episode_release_date: string | null;
  price: number | null;
  match_type: "reprint";
  match_method?: CardPrintingMatchMethod;
  image_similarity?: number;
}

export type PrintingLookupCard = {
  id: string;
  game: string;
  name: string;
  hp: number | null;
  artist: string | null;
  image_url: string | null;
  tcgid?: string | null;
  supertype: string | null;
  episode: {
    id: string;
    name: string;
    code: string | null;
    release_date: string | null;
  };
};

export type CardPrintingMatchMethod =
  | "rules-exact"
  | "rules-and-art"
  | "lineage-and-art"
  | "likely-art"
  | "strong-art"
  | "manual-include";

export type CardPrintingMatch = {
  matchType: RelatedCardPrinting["match_type"];
  method: CardPrintingMatchMethod;
  imageSimilarity: number;
};

/**
 * Print families describe a card being issued again in another expansion.
 * Same-expansion rarity and artwork variants are collector variants, not
 * automatic reprints. An explicit review decision may still link an unusual
 * same-expansion pair when that relationship has been verified manually.
 */
export function isEligiblePrintFamilyPair(
  sourceEpisodeId: string,
  targetEpisodeId: string,
  matchMethod: string
): boolean {
  return matchMethod === "manual-include" || sourceEpisodeId !== targetEpisodeId;
}

export type CardPrintingEvidenceResult = {
  identity: TcgDexCardIdentity | null;
  artworkHash: ArtworkHash | null;
  sourceStatus: "complete" | "image-only" | "missing-image";
};

function normalizeText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  return normalized || null;
}

function normalizeRulesLabel(value: unknown): string | null {
  const normalized = normalizeText(value);
  if (!normalized) return null;
  if (["pokemon power", "poke-power", "pokepower"].includes(normalized)) {
    return "pokemon power";
  }
  if (["pokemon body", "poke-body", "pokebody"].includes(normalized)) {
    return "pokemon body";
  }
  return normalized;
}

function normalizeCardName(value: unknown): string | null {
  const normalized = normalizeText(value);
  if (!normalized) return null;
  return normalized.replace(/[^a-z0-9]+/g, " ").trim() || null;
}

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map(normalizeText).filter((item): item is string => Boolean(item))
    : [];
}

export function haveSameKnownPrintingArtist(
  left: string | null | undefined,
  right: string | null | undefined
): boolean {
  const normalizedLeft = normalizeText(left);
  const normalizedRight = normalizeText(right);
  return normalizedLeft != null && normalizedLeft === normalizedRight;
}

export function getTcgdexCardId(input: {
  image_url?: string | null;
  tcgid?: string | null;
}): string | null {
  if (input.image_url) {
    try {
      const url = new URL(input.image_url);
      if (url.hostname === "assets.tcgdex.net") {
        const parts = url.pathname.split("/").filter(Boolean);
        const languageIndex = parts.findIndex((part) => part === "en");
        const setId = languageIndex >= 0 ? parts[languageIndex + 2] : null;
        const localId = languageIndex >= 0 ? parts[languageIndex + 3] : null;
        if (setId && localId) {
          if (/^TG\d+$/i.test(localId)) return `${setId}.5tg-${localId}`;
          if (/^GG\d+$/i.test(localId)) return `${setId}gg-${localId}`;
          return `${setId}-${localId}`;
        }
      }
    } catch {
      // Fall through to the stored source id.
    }
  }

  return input.tcgid?.trim() || null;
}

function getTcgdexCardIds(input: {
  image_url?: string | null;
  tcgid?: string | null;
}): string[] {
  return Array.from(
    new Set(
      [getTcgdexCardId(input), input.tcgid?.trim()]
        .filter((cardId): cardId is string => Boolean(cardId))
    )
  );
}

export function buildCardIdentityFingerprint(card: TcgDexCardIdentity): string | null {
  const category = normalizeText(card.category);
  const name = normalizeCardName(card.name);
  if (!category || !name) return null;

  const fingerprint = {
    category,
    name,
    illustrator: normalizeText(card.illustrator),
    hp: typeof card.hp === "number" ? card.hp : null,
    types: normalizeStringArray(card.types),
    evolveFrom: normalizeText(card.evolveFrom),
    stage: normalizeText(card.stage),
    suffix: normalizeText(card.suffix),
    trainerType: normalizeText(card.trainerType),
    energyType: normalizeText(card.energyType),
    effect: normalizeText(card.effect),
    abilities: (card.abilities ?? []).map((ability) => ({
      type: normalizeRulesLabel(ability.type),
      name: normalizeText(ability.name),
      effect: normalizeText(ability.effect),
    })),
    attacks: (card.attacks ?? []).map((attack) => ({
      cost: normalizeStringArray(attack.cost),
      name: normalizeText(attack.name),
      effect: normalizeText(attack.effect),
      damage:
        typeof attack.damage === "number"
          ? String(attack.damage)
          : normalizeText(attack.damage),
    })),
    weaknesses: (card.weaknesses ?? []).map((weakness) => ({
      type: normalizeText(weakness.type),
      value: normalizeText(weakness.value),
    })),
    resistances: (card.resistances ?? []).map((resistance) => ({
      type: normalizeText(resistance.type),
      value: normalizeText(resistance.value),
    })),
    retreat: typeof card.retreat === "number" ? card.retreat : null,
  };

  const hasRulesIdentity =
    fingerprint.effect != null ||
    fingerprint.abilities.length > 0 ||
    fingerprint.attacks.length > 0 ||
    fingerprint.energyType != null;

  return hasRulesIdentity ? JSON.stringify(fingerprint) : null;
}

function buildCoreRulesFingerprint(card: TcgDexCardIdentity): string | null {
  const fingerprint = {
    effect: normalizeText(card.effect),
    energyType: normalizeText(card.energyType),
    abilities: (card.abilities ?? []).map((ability) => ({
      type: normalizeRulesLabel(ability.type),
      name: normalizeText(ability.name),
      effect: normalizeText(ability.effect),
    })),
    attacks: (card.attacks ?? []).map((attack) => ({
      cost: normalizeStringArray(attack.cost),
      name: normalizeText(attack.name),
      effect: normalizeText(attack.effect),
      damage:
        typeof attack.damage === "number"
          ? String(attack.damage)
          : normalizeText(attack.damage),
    })),
  };
  const hasCoreRules =
    fingerprint.effect != null ||
    fingerprint.energyType != null ||
    fingerprint.abilities.length > 0 ||
    fingerprint.attacks.length > 0;

  return hasCoreRules ? JSON.stringify(fingerprint) : null;
}

/**
 * A reissue may modernize HP, damage and effect wording while preserving the
 * recognizable card line. Attack and Ability names are far more stable than
 * the full rules text and, combined with artwork similarity, separate real
 * reprints from another card drawn by the same illustrator.
 */
export function buildCardLineageFingerprint(card: TcgDexCardIdentity): string | null {
  const category = normalizeText(card.category);
  const name = normalizeCardName(card.name);
  const illustrator = normalizeText(card.illustrator);
  if (!category || !name || !illustrator) return null;

  const abilityNames = (card.abilities ?? [])
    .map((ability) => normalizeText(ability.name))
    .filter((value): value is string => Boolean(value));
  const attackNames = (card.attacks ?? [])
    .map((attack) => normalizeText(attack.name))
    .filter((value): value is string => Boolean(value));
  const effect = normalizeText(card.effect);
  const hasLineage = abilityNames.length > 0 || attackNames.length > 0 || effect != null;
  if (!hasLineage) return null;

  return JSON.stringify({
    category,
    name,
    illustrator,
    abilityNames,
    attackNames,
    trainerType: normalizeText(card.trainerType),
    energyType: normalizeText(card.energyType),
    effect: abilityNames.length === 0 && attackNames.length === 0 ? effect : null,
  });
}

function knownScalarMatches(left: string | number | null, right: string | number | null) {
  return left == null || right == null || left === right;
}

function knownArrayMatches(left: unknown[], right: unknown[]) {
  return left.length === 0 ||
    right.length === 0 ||
    JSON.stringify(left) === JSON.stringify(right);
}

function haveCompatibleKnownIdentityFields(
  current: TcgDexCardIdentity,
  candidate: TcgDexCardIdentity
): boolean {
  const currentTypes = normalizeStringArray(current.types);
  const candidateTypes = normalizeStringArray(candidate.types);
  const currentWeaknesses = (current.weaknesses ?? []).map((weakness) => ({
    type: normalizeText(weakness.type),
    value: normalizeText(weakness.value),
  }));
  const candidateWeaknesses = (candidate.weaknesses ?? []).map((weakness) => ({
    type: normalizeText(weakness.type),
    value: normalizeText(weakness.value),
  }));
  const currentResistances = (current.resistances ?? []).map((resistance) => ({
    type: normalizeText(resistance.type),
    value: normalizeText(resistance.value),
  }));
  const candidateResistances = (candidate.resistances ?? []).map((resistance) => ({
    type: normalizeText(resistance.type),
    value: normalizeText(resistance.value),
  }));

  return (
    knownScalarMatches(current.hp ?? null, candidate.hp ?? null) &&
    knownScalarMatches(normalizeText(current.evolveFrom), normalizeText(candidate.evolveFrom)) &&
    knownScalarMatches(normalizeText(current.stage), normalizeText(candidate.stage)) &&
    knownScalarMatches(normalizeText(current.suffix), normalizeText(candidate.suffix)) &&
    knownScalarMatches(normalizeText(current.trainerType), normalizeText(candidate.trainerType)) &&
    knownScalarMatches(current.retreat ?? null, candidate.retreat ?? null) &&
    knownArrayMatches(currentTypes, candidateTypes) &&
    knownArrayMatches(currentWeaknesses, candidateWeaknesses) &&
    knownArrayMatches(currentResistances, candidateResistances)
  );
}

export function getPerceptualHashSimilarity(left: string, right: string): number {
  if (left.startsWith(COLOR_SIGNATURE_PREFIX) || right.startsWith(COLOR_SIGNATURE_PREFIX)) {
    if (!left.startsWith(COLOR_SIGNATURE_PREFIX) || !right.startsWith(COLOR_SIGNATURE_PREFIX)) {
      return 0;
    }
    const leftPixels = Buffer.from(left.slice(COLOR_SIGNATURE_PREFIX.length), "base64");
    const rightPixels = Buffer.from(right.slice(COLOR_SIGNATURE_PREFIX.length), "base64");
    if (leftPixels.length === 0 || leftPixels.length !== rightPixels.length) return 0;

    let absoluteDifference = 0;
    let squaredDifference = 0;
    for (let index = 0; index < leftPixels.length; index += 1) {
      const difference = Math.abs(leftPixels[index] - rightPixels[index]);
      absoluteDifference += difference;
      squaredDifference += difference * difference;
    }
    const meanDifference = absoluteDifference / leftPixels.length;
    const rootMeanSquareDifference = Math.sqrt(squaredDifference / leftPixels.length);
    const normalizedDifference = (meanDifference * 0.6 + rootMeanSquareDifference * 0.4) / 255;
    return Math.max(0, Math.min(1, 1 - normalizedDifference));
  }

  if (left.length === 0 || left.length !== right.length) return 0;
  let equalBits = 0;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] === right[index]) equalBits += 1;
  }
  return equalBits / left.length;
}

export function getPrintingMatchDetails(
  current: TcgDexCardIdentity,
  candidate: TcgDexCardIdentity,
  imageSimilarity: number
): CardPrintingMatch | null {
  const sameNamedCard =
    normalizeText(current.category) === normalizeText(candidate.category) &&
    normalizeCardName(current.name) === normalizeCardName(candidate.name);
  if (!sameNamedCard) return null;

  const sameIllustrator = haveSameKnownPrintingArtist(
    current.illustrator,
    candidate.illustrator
  );
  const currentFingerprint = buildCardIdentityFingerprint(current);
  const candidateFingerprint = buildCardIdentityFingerprint(candidate);
  if (currentFingerprint && candidateFingerprint) {
    const currentCoreRules = buildCoreRulesFingerprint(current);
    const candidateCoreRules = buildCoreRulesFingerprint(candidate);
    const rulesMatch =
      currentFingerprint === candidateFingerprint ||
      (
        currentCoreRules != null &&
        currentCoreRules === candidateCoreRules &&
        haveCompatibleKnownIdentityFields(current, candidate)
      );

    if (rulesMatch) {
      // A regular, rainbow, gold, promo or trainer-gallery treatment can use
      // entirely different artwork (and even a different credited artist)
      // while still being the same playable card. Exact rules plus compatible
      // identity fields are stronger evidence than artwork similarity.
      return {
        matchType: "reprint",
        method: "rules-exact",
        imageSimilarity,
      };
    }
  }

  if (!sameIllustrator) return null;

  const currentLineage = buildCardLineageFingerprint(current);
  const candidateLineage = buildCardLineageFingerprint(candidate);
  const matchingLineage =
    currentLineage != null &&
    currentLineage === candidateLineage;

  // When both providers expose attacks, abilities or an effect, a different
  // rules lineage means these are different cards despite similar colours or
  // the same illustrator. Never send that obvious mismatch to manual review.
  if (currentLineage != null && candidateLineage != null && !matchingLineage) {
    return null;
  }

  if (imageSimilarity >= STRONG_REPRINT_IMAGE_SIMILARITY) {
    return { matchType: "reprint", method: "strong-art", imageSimilarity };
  }

  if (
    matchingLineage &&
    imageSimilarity >= MIN_LINEAGE_VERIFIED_IMAGE_SIMILARITY
  ) {
    return { matchType: "reprint", method: "lineage-and-art", imageSimilarity };
  }

  if (matchingLineage && imageSimilarity >= LIKELY_REPRINT_IMAGE_SIMILARITY) {
    return { matchType: "reprint", method: "likely-art", imageSimilarity };
  }

  return null;
}

export function getPrintingMatchType(
  current: TcgDexCardIdentity,
  candidate: TcgDexCardIdentity,
  imageSimilarity: number
): RelatedCardPrinting["match_type"] | null {
  return getPrintingMatchDetails(current, candidate, imageSimilarity)?.matchType ?? null;
}

export function getConnectedPrintingIndexes(
  identities: TcgDexCardIdentity[],
  getImageSimilarity: (leftIndex: number, rightIndex: number) => number
): number[] {
  if (identities.length <= 1) return [];

  const directMatches: number[] = [];
  for (let candidateIndex = 1; candidateIndex < identities.length; candidateIndex += 1) {
    if (
      getPrintingMatchType(
        identities[0],
        identities[candidateIndex],
        getImageSimilarity(0, candidateIndex)
      )
    ) {
      directMatches.push(candidateIndex);
    }
  }
  return directMatches;
}

function getComparableArtworkUrl(imageUrl: string): string {
  try {
    const url = new URL(imageUrl);
    if (url.hostname !== "assets.tcgdex.net") return imageUrl;
    if (/\/(?:high|low)\.webp$/i.test(url.pathname)) {
      url.pathname = url.pathname.replace(/\/(?:high|low)\.webp$/i, "/low.webp");
    } else {
      url.pathname = `${url.pathname.replace(/\/$/, "")}/low.webp`;
    }
    return url.toString();
  } catch {
    return imageUrl;
  }
}

async function createColorSignature(
  image: Buffer,
  width: number,
  height: number,
  extract?: { left: number; top: number; width: number; height: number }
): Promise<string> {
  let pipeline = sharp(image);
  if (extract) pipeline = pipeline.extract(extract);
  const data = await pipeline
    .resize(width, height, { fit: "fill" })
    .removeAlpha()
    .toColourspace("srgb")
    .raw()
    .toBuffer();
  return `${COLOR_SIGNATURE_PREFIX}${data.toString("base64")}`;
}

async function createArtworkHash(imageUrl: string): Promise<ArtworkHash | null> {
  try {
    const response = await fetch(getComparableArtworkUrl(imageUrl), {
      headers: { accept: "image/avif,image/webp,image/*" },
      next: { revalidate: 60 * 60 * 24 * 7 },
      signal: AbortSignal.timeout(2_500),
    });
    if (!response.ok) return null;
    const image = Buffer.from(await response.arrayBuffer());
    if (image.length === 0 || image.length > 5_000_000) return null;
    const metadata = await sharp(image).metadata();
    if (!metadata.width || !metadata.height) return null;

    const illustrationBounds = {
      left: Math.floor(metadata.width * 0.07),
      top: Math.floor(metadata.height * 0.14),
      width: Math.max(1, Math.floor(metadata.width * 0.86)),
      height: Math.max(1, Math.floor(metadata.height * 0.43)),
    };
    const [full, illustration] = await Promise.all([
      createColorSignature(image, 10, 14),
      createColorSignature(image, 10, 6, illustrationBounds),
    ]);
    return { full, illustration };
  } catch {
    return null;
  }
}

export function loadArtworkHash(imageUrl: string | null): Promise<ArtworkHash | null> {
  if (!imageUrl) return Promise.resolve(null);
  const cacheKey = getComparableArtworkUrl(imageUrl);
  const cached = artworkHashCache.get(cacheKey);
  if (cached) return cached;

  if (artworkHashCache.size >= MAX_CACHED_ARTWORK_HASHES) {
    const oldestKey = artworkHashCache.keys().next().value;
    if (oldestKey) artworkHashCache.delete(oldestKey);
  }
  const pending = createArtworkHash(cacheKey);
  artworkHashCache.set(cacheKey, pending);
  return pending;
}

export function getArtworkHashSimilarity(
  left: ArtworkHash | null,
  right: ArtworkHash | null
): number {
  if (!left || !right) return 0;
  const fullSimilarity = getPerceptualHashSimilarity(left.full, right.full);
  const illustrationSimilarity = getPerceptualHashSimilarity(
    left.illustration,
    right.illustration
  );
  const usesColorSignatures = left.full.startsWith(COLOR_SIGNATURE_PREFIX)
    && right.full.startsWith(COLOR_SIGNATURE_PREFIX)
    && left.illustration.startsWith(COLOR_SIGNATURE_PREFIX)
    && right.illustration.startsWith(COLOR_SIGNATURE_PREFIX);
  return usesColorSignatures
    ? fullSimilarity * 0.35 + illustrationSimilarity * 0.65
    : Math.max(fullSimilarity, illustrationSimilarity);
}

function getTcgDexProviderPrefix(tcgid: string | null | undefined): string | null {
  const prefix = tcgid?.trim().split("-")[0]?.toLowerCase().replace(/[^a-z0-9]/g, "");
  return prefix || null;
}

async function searchTcgdexCardsByName(name: string): Promise<TcgDexCardBrief[]> {
  const cacheKey = normalizeText(name) ?? name.trim().toLowerCase();
  const queryName = normalizeCardName(name) ?? name.trim();
  const cached = tcgdexSearchCache.get(cacheKey);
  if (cached) return cached;

  if (tcgdexSearchCache.size >= MAX_CACHED_TCGDEX_SEARCHES) {
    const oldestKey = tcgdexSearchCache.keys().next().value;
    if (oldestKey) tcgdexSearchCache.delete(oldestKey);
  }

  const pending = (async () => {
    try {
      const response = await fetch(
        `${TCGDEX_CARD_ENDPOINT}?name=${encodeURIComponent(queryName)}`,
        {
          headers: { accept: "application/json" },
          next: { revalidate: 60 * 60 * 24 * 7 },
          signal: AbortSignal.timeout(4_000),
        }
      );
      if (!response.ok) return [];
      const payload = (await response.json()) as unknown;
      return Array.isArray(payload) ? payload as TcgDexCardBrief[] : [];
    } catch {
      return [];
    }
  })();
  tcgdexSearchCache.set(cacheKey, pending);
  return pending;
}

function isCompatibleIdentityFallback(
  card: PrintingLookupCard,
  identity: TcgDexCardIdentity
): boolean {
  if (normalizeCardName(identity.name) !== normalizeCardName(card.name)) return false;
  const storedArtist = normalizeText(card.artist);
  const providerArtist = normalizeText(identity.illustrator);
  if (
    storedArtist &&
    providerArtist &&
    providerArtist !== storedArtist
  ) return false;
  const storedCategory = normalizeText(card.supertype);
  const providerCategory = normalizeText(identity.category);
  if (
    storedCategory &&
    providerCategory &&
    providerCategory !== storedCategory
  ) return false;
  return true;
}

async function fetchTcgdexCardById(cardId: string): Promise<TcgDexCardIdentity | null> {
  try {
    const response = await fetch(`${TCGDEX_CARD_ENDPOINT}/${encodeURIComponent(cardId)}`, {
      headers: { accept: "application/json" },
      next: { revalidate: 60 * 60 * 24 * 7 },
      signal: AbortSignal.timeout(2_500),
    });
    return response.ok ? (await response.json()) as TcgDexCardIdentity : null;
  } catch {
    return null;
  }
}

export async function fetchTcgdexCard(
  card: PrintingLookupCard
): Promise<TcgDexCardIdentity | null> {
  for (const cardId of getTcgdexCardIds(card)) {
    const identity = await fetchTcgdexCardById(cardId);
    if (identity && isCompatibleIdentityFallback(card, identity)) return identity;
  }

  // Some provider ids use a different set-local id than TCGdex (notably the
  // Celebrations Classic Collection). Search only the same provider-prefix
  // family and verify name, illustrator and category before accepting it.
  const providerPrefix = getTcgDexProviderPrefix(card.tcgid);
  if (providerPrefix) {
    const candidates = (await searchTcgdexCardsByName(card.name))
      .filter((candidate) => {
        const candidatePrefix = getTcgDexProviderPrefix(candidate.id);
        return candidatePrefix != null && (
          candidatePrefix.startsWith(providerPrefix) ||
          providerPrefix.startsWith(candidatePrefix)
        );
      })
      .slice(0, 4);
    for (const candidate of candidates) {
      if (!candidate.id) continue;
      const identity = await fetchTcgdexCardById(candidate.id);
      if (identity && isCompatibleIdentityFallback(card, identity)) return identity;
    }
  }

  return null;
}

export async function buildCardPrintingEvidence(
  card: PrintingLookupCard
): Promise<CardPrintingEvidenceResult> {
  const [identity, artworkHash] = await Promise.all([
    fetchTcgdexCard(card),
    loadArtworkHash(card.image_url),
  ]);

  return {
    identity,
    artworkHash,
    sourceStatus: !artworkHash
      ? "missing-image"
      : identity
        ? "complete"
        : "image-only",
  };
}

export function buildFallbackCardIdentity(card: PrintingLookupCard): TcgDexCardIdentity {
  return {
    category: card.supertype ?? undefined,
    name: card.name,
    illustrator: card.artist ?? undefined,
    hp: card.hp ?? undefined,
  };
}

export async function loadRelatedCardPrintings(
  current: PrintingLookupCard
): Promise<RelatedCardPrinting[]> {
  if (current.game !== "pokemon") return [];
  // Keep card detail available while an older worker/test client is still on the
  // pre-reprint Prisma shape during a rolling migration.
  if (!db.cardPrintingRelation?.findMany) return [];

  const relations = await db.cardPrintingRelation.findMany({
    where: {
      source_card_id: current.id,
      model_version: CARD_REPRINT_MODEL_VERSION,
      // Low-confidence visual candidates only become visible after approval.
      match_method: { not: "likely-art" },
    },
    select: {
      match_method: true,
      image_similarity: true,
      targetCard: {
        select: {
          id: true,
          name: true,
          card_number: true,
          version: true,
          rarity: true,
          artist: true,
          image_url: true,
          cardmarket_url: true,
          episode: {
            select: { id: true, name: true, code: true, release_date: true },
          },
          prices: {
            where: { cm_en_lowest_nm: { gt: 0, not: 9001 } },
            orderBy: [{ fetched_at: "desc" }, { id: "desc" }],
            take: 1,
            select: { cm_en_lowest_nm: true },
          },
        },
      },
    },
  });
  return relations
    .filter((relation) => {
      const matchMethod = relation.match_method as CardPrintingMatchMethod;
      return isEligiblePrintFamilyPair(
        current.episode.id,
        relation.targetCard.episode.id,
        matchMethod
      ) && (
        matchMethod !== "rules-and-art" ||
        haveSameKnownPrintingArtist(current.artist, relation.targetCard.artist)
      );
    })
    .map((relation): RelatedCardPrinting => {
      const card = relation.targetCard;
      const latestPrice = card.prices[0] ?? null;
      return {
        id: card.id,
        name: card.name,
        card_number: card.card_number,
        version: card.version,
        rarity: card.rarity,
        image_url: card.image_url,
        cardmarket_url: card.cardmarket_url,
        episode_id: card.episode.id,
        episode_name: card.episode.name,
        episode_code: card.episode.code,
        episode_release_date: card.episode.release_date,
        price: latestPrice ? getCurrentRawCardmarketValue(latestPrice) : null,
        match_type: "reprint",
        match_method: relation.match_method as CardPrintingMatchMethod,
        image_similarity: relation.image_similarity,
      };
    })
    .sort((left, right) => {
      if (left.price == null && right.price != null) return 1;
      if (left.price != null && right.price == null) return -1;
      if (left.price != null && right.price != null && left.price !== right.price) {
        return left.price - right.price;
      }
      return (right.episode_release_date ?? "").localeCompare(
        left.episode_release_date ?? ""
      );
    });
}
