import { db } from "@/lib/db";
import { getCurrentRawCardmarketValue } from "@/lib/market-price-sanity";
import sharp from "sharp";

const TCGDEX_CARD_ENDPOINT = "https://api.tcgdex.net/v2/en/cards";
const MAX_PRINTING_CANDIDATES = 80;
const MAX_RELATED_PRINTINGS = 8;
const MIN_RULES_VERIFIED_IMAGE_SIMILARITY = 0.62;
const STRONG_REPRINT_IMAGE_SIMILARITY = 0.82;
const MAX_CACHED_ARTWORK_HASHES = 512;
const artworkHashCache = new Map<string, Promise<ArtworkHash | null>>();

type ArtworkHash = {
  full: string;
  illustration: string;
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
  rarity: string | null;
  image_url: string | null;
  cardmarket_url: string | null;
  episode_id: string;
  episode_name: string;
  episode_code: string | null;
  episode_release_date: string | null;
  price: number | null;
  match_type: "reprint";
}

type PrintingLookupCard = {
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

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map(normalizeText).filter((item): item is string => Boolean(item))
    : [];
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
  const name = normalizeText(card.name);
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
  if (left.length === 0 || left.length !== right.length) return 0;
  let equalBits = 0;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] === right[index]) equalBits += 1;
  }
  return equalBits / left.length;
}

export function getPrintingMatchType(
  current: TcgDexCardIdentity,
  candidate: TcgDexCardIdentity,
  imageSimilarity: number
): RelatedCardPrinting["match_type"] | null {
  const samePrintedIdentity =
    normalizeText(current.category) === normalizeText(candidate.category) &&
    normalizeText(current.name) === normalizeText(candidate.name) &&
    normalizeText(current.illustrator) != null &&
    normalizeText(current.illustrator) === normalizeText(candidate.illustrator);
  if (!samePrintedIdentity) return null;

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

    return rulesMatch && imageSimilarity >= MIN_RULES_VERIFIED_IMAGE_SIMILARITY
      ? "reprint"
      : null;
  }

  const sameHp =
    typeof current.hp === "number" &&
    typeof candidate.hp === "number" &&
    current.hp === candidate.hp;
  return sameHp && imageSimilarity >= STRONG_REPRINT_IMAGE_SIMILARITY
    ? "reprint"
    : null;
}

export function getConnectedPrintingIndexes(
  identities: TcgDexCardIdentity[],
  getImageSimilarity: (leftIndex: number, rightIndex: number) => number
): number[] {
  if (identities.length <= 1) return [];

  const connected = new Set<number>([0]);
  const queue = [0];
  while (queue.length > 0) {
    const currentIndex = queue.shift();
    if (currentIndex == null) break;

    for (let candidateIndex = 1; candidateIndex < identities.length; candidateIndex += 1) {
      if (connected.has(candidateIndex)) continue;
      if (
        getPrintingMatchType(
          identities[currentIndex],
          identities[candidateIndex],
          getImageSimilarity(currentIndex, candidateIndex)
        )
      ) {
        connected.add(candidateIndex);
        queue.push(candidateIndex);
      }
    }
  }

  return Array.from(connected).filter((index) => index !== 0);
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

async function createDifferenceHash(
  image: Buffer,
  extract?: { left: number; top: number; width: number; height: number }
): Promise<string> {
  let pipeline = sharp(image);
  if (extract) pipeline = pipeline.extract(extract);
  const { data } = await pipeline
    .resize(17, 16, { fit: "fill" })
    .grayscale()
    .normalize()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let hash = "";
  for (let y = 0; y < 16; y += 1) {
    for (let x = 0; x < 16; x += 1) {
      hash += data[y * 17 + x] > data[y * 17 + x + 1] ? "1" : "0";
    }
  }
  return hash;
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
      createDifferenceHash(image),
      createDifferenceHash(image, illustrationBounds),
    ]);
    return { full, illustration };
  } catch {
    return null;
  }
}

function loadArtworkHash(imageUrl: string | null): Promise<ArtworkHash | null> {
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

function getArtworkHashSimilarity(
  left: ArtworkHash | null,
  right: ArtworkHash | null
): number {
  if (!left || !right) return 0;
  return Math.max(
    getPerceptualHashSimilarity(left.full, right.full),
    getPerceptualHashSimilarity(left.illustration, right.illustration)
  );
}

async function fetchTcgdexCard(card: {
  image_url: string | null;
  tcgid?: string | null;
}): Promise<TcgDexCardIdentity | null> {
  for (const cardId of getTcgdexCardIds(card)) {
    try {
      const response = await fetch(`${TCGDEX_CARD_ENDPOINT}/${encodeURIComponent(cardId)}`, {
        headers: { accept: "application/json" },
        next: { revalidate: 60 * 60 * 24 * 7 },
        signal: AbortSignal.timeout(2_500),
      });
      if (response.ok) return (await response.json()) as TcgDexCardIdentity;
    } catch {
      // Try the stored provider id when the image-derived id is unavailable.
    }
  }

  return null;
}

export async function loadRelatedCardPrintings(
  current: PrintingLookupCard
): Promise<RelatedCardPrinting[]> {
  if (current.game !== "pokemon" || !current.image_url) return [];

  const candidates = await db.card.findMany({
    where: {
      id: { not: current.id },
      game: current.game,
      name: current.name,
      supertype: current.supertype,
      ...(current.artist ? { artist: current.artist } : { hp: current.hp }),
      image_url: { not: null },
    },
    orderBy: [{ episode: { release_date: "desc" } }, { card_number: "asc" }],
    take: MAX_PRINTING_CANDIDATES,
    select: {
      id: true,
      game: true,
      name: true,
      card_number: true,
      rarity: true,
      hp: true,
      artist: true,
      image_url: true,
      tcgid: true,
      supertype: true,
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
  });
  if (candidates.length === 0) return [];

  const [loadedIdentities, currentArtworkHash] = await Promise.all([
    Promise.all([
      fetchTcgdexCard(current),
      ...candidates.map((candidate) => fetchTcgdexCard(candidate)),
    ]),
    loadArtworkHash(current.image_url),
  ]);
  const [currentIdentity, ...candidateIdentities] = loadedIdentities;
  if (!currentArtworkHash) return [];

  const candidateArtworkHashes = await Promise.all(
    candidates.map((candidate) => loadArtworkHash(candidate.image_url))
  );
  const identities: TcgDexCardIdentity[] = [
    currentIdentity ?? {
      category: current.supertype ?? undefined,
      name: current.name,
      illustrator: current.artist ?? undefined,
      hp: current.hp ?? undefined,
    },
    ...candidates.map((candidate, index) =>
      candidateIdentities[index] ?? {
        category: candidate.supertype ?? undefined,
        name: candidate.name,
        illustrator: candidate.artist ?? undefined,
        hp: candidate.hp ?? undefined,
      }
    ),
  ];
  const artworkHashes = [currentArtworkHash, ...candidateArtworkHashes];
  const connectedIndexes = new Set(
    getConnectedPrintingIndexes(
      identities,
      (leftIndex, rightIndex) =>
        getArtworkHashSimilarity(artworkHashes[leftIndex], artworkHashes[rightIndex])
    )
  );

  return candidates
    .map((candidate, index): RelatedCardPrinting | null => {
      if (!connectedIndexes.has(index + 1)) return null;
      const latestPrice = candidate.prices[0] ?? null;

      return {
        id: candidate.id,
        name: candidate.name,
        card_number: candidate.card_number,
        rarity: candidate.rarity,
        image_url: candidate.image_url,
        cardmarket_url: candidate.cardmarket_url,
        episode_id: candidate.episode.id,
        episode_name: candidate.episode.name,
        episode_code: candidate.episode.code,
        episode_release_date: candidate.episode.release_date,
        price: latestPrice ? getCurrentRawCardmarketValue(latestPrice) : null,
        match_type: "reprint",
      };
    })
    .filter((printing): printing is RelatedCardPrinting => printing != null)
    .sort((left, right) => {
      if (left.price == null && right.price != null) return 1;
      if (left.price != null && right.price == null) return -1;
      if (left.price != null && right.price != null && left.price !== right.price) {
        return left.price - right.price;
      }
      return (right.episode_release_date ?? "").localeCompare(
        left.episode_release_date ?? ""
      );
    })
    .slice(0, MAX_RELATED_PRINTINGS);
}
