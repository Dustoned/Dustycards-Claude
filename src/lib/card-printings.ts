import { db } from "@/lib/db";
import { getCurrentRawCardmarketValue } from "@/lib/market-price-sanity";
import sharp from "sharp";

const TCGDEX_CARD_ENDPOINT = "https://api.tcgdex.net/v2/en/cards";
const MAX_PRINTING_CANDIDATES = 40;
const MAX_RELATED_PRINTINGS = 8;
const MIN_REPRINT_IMAGE_SIMILARITY = 0.68;
const MAX_CACHED_ARTWORK_HASHES = 512;
const artworkHashCache = new Map<string, Promise<string | null>>();

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
  const normalized = value.toLowerCase().replace(/\s+/g, " ").trim();
  return normalized || null;
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
        if (setId && localId) return `${setId}-${localId}`;
      }
    } catch {
      // Fall through to the stored source id.
    }
  }

  return input.tcgid?.trim() || null;
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
      type: normalizeText(ability.type),
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
  const currentFingerprint = buildCardIdentityFingerprint(current);
  const candidateFingerprint = buildCardIdentityFingerprint(candidate);
  return currentFingerprint &&
    candidateFingerprint &&
    currentFingerprint === candidateFingerprint &&
    imageSimilarity >= MIN_REPRINT_IMAGE_SIMILARITY
    ? "reprint"
    : null;
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

async function createArtworkHash(imageUrl: string): Promise<string | null> {
  try {
    const response = await fetch(getComparableArtworkUrl(imageUrl), {
      headers: { accept: "image/avif,image/webp,image/*" },
      next: { revalidate: 60 * 60 * 24 * 7 },
      signal: AbortSignal.timeout(2_500),
    });
    if (!response.ok) return null;
    const image = Buffer.from(await response.arrayBuffer());
    if (image.length === 0 || image.length > 5_000_000) return null;

    const { data } = await sharp(image)
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
  } catch {
    return null;
  }
}

function loadArtworkHash(imageUrl: string | null): Promise<string | null> {
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

async function fetchTcgdexCard(card: {
  image_url: string | null;
  tcgid?: string | null;
}): Promise<TcgDexCardIdentity | null> {
  const cardId = getTcgdexCardId(card);
  if (!cardId) return null;

  try {
    const response = await fetch(`${TCGDEX_CARD_ENDPOINT}/${encodeURIComponent(cardId)}`, {
      headers: { accept: "application/json" },
      next: { revalidate: 60 * 60 * 24 * 7 },
      signal: AbortSignal.timeout(2_500),
    });
    if (!response.ok) return null;
    return (await response.json()) as TcgDexCardIdentity;
  } catch {
    return null;
  }
}

export async function loadRelatedCardPrintings(
  current: PrintingLookupCard
): Promise<RelatedCardPrinting[]> {
  if (current.game !== "pokemon" || !getTcgdexCardId(current)) return [];

  const candidates = await db.card.findMany({
    where: {
      id: { not: current.id },
      game: current.game,
      name: current.name,
      hp: current.hp,
      supertype: current.supertype,
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

  const [identities, currentArtworkHash] = await Promise.all([
    Promise.all([
      fetchTcgdexCard(current),
      ...candidates.map((candidate) => fetchTcgdexCard(candidate)),
    ]),
    loadArtworkHash(current.image_url),
  ]);
  const [currentIdentity, ...candidateIdentities] = identities;
  if (!currentIdentity) return [];

  const currentFingerprint = buildCardIdentityFingerprint(currentIdentity);
  if (!currentFingerprint || !currentArtworkHash) return [];

  const candidateArtworkHashes = await Promise.all(
    candidates.map((candidate, index) => {
      const candidateIdentity = candidateIdentities[index];
      return candidateIdentity &&
        buildCardIdentityFingerprint(candidateIdentity) === currentFingerprint
        ? loadArtworkHash(candidate.image_url)
        : Promise.resolve(null);
    })
  );

  return candidates
    .map((candidate, index): RelatedCardPrinting | null => {
      const candidateIdentity = candidateIdentities[index];
      const candidateArtworkHash = candidateArtworkHashes[index];
      if (!candidateIdentity || !candidateArtworkHash) return null;
      const matchType = getPrintingMatchType(
        currentIdentity,
        candidateIdentity,
        getPerceptualHashSimilarity(currentArtworkHash, candidateArtworkHash)
      );
      if (!matchType) return null;
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
        match_type: matchType,
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
