const TCGDEX_API_BASE = "https://api.tcgdex.net/v2/en";
const TCGDEX_CARDS_ENDPOINT = `${TCGDEX_API_BASE}/cards`;
const HIGH_RES_IMAGE_SUFFIX = "/high.webp";
const IMAGE_REVALIDATE_SECONDS = 60 * 60 * 24;
const TCGDEX_REQUEST_BATCH_SIZE = 20;

interface TcgdexCardBrief {
  id: string;
  image?: string | null;
}

interface TcgdexSetCardBrief {
  id: string;
}

interface TcgdexSetResponse {
  cards?: TcgdexSetCardBrief[] | null;
}

interface TcgdexCardResponse {
  id: string;
  category?: string | null;
}

type TcgdexImageLookup = Map<string, string>;

const TCGDEX_SET_ID_BY_LOCAL_CODE = new Map<string, string>([["por", "me03"]]);

const TCGDEX_SET_ID_BY_LOCAL_NAME = new Map<string, string>([
  ["perfect order", "me03"],
]);

let tcgdexImageLookupPromise: Promise<TcgdexImageLookup> | null = null;
const tcgdexSupertypeLookupPromises = new Map<string, Promise<ReadonlyMap<string, string>>>();

function normalizeLookupKey(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeOptionalString(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function normalizeNumericString(value: string): string | null {
  return /^\d+$/.test(value) ? String(Number(value)) : null;
}

function buildHighResImageUrl(imageBase: string | null | undefined): string | null {
  return imageBase ? `${imageBase}${HIGH_RES_IMAGE_SUFFIX}` : null;
}

function buildLocalIdAliases(localId: string): string[] {
  const aliases = new Set([localId]);
  const numeric = normalizeNumericString(localId);
  if (numeric) {
    aliases.add(numeric);
    aliases.add(numeric.padStart(3, "0"));
  }
  return [...aliases];
}

function buildSetIdAliases(setId: string, localId: string): string[] {
  const aliases = new Set([setId]);

  const svTwoDigit = setId.match(/^sv(\d{2})$/);
  if (svTwoDigit) {
    aliases.add(`sv${Number(svTwoDigit[1])}`);
  }

  const svSingleDigit = setId.match(/^sv(\d)$/);
  if (svSingleDigit) {
    aliases.add(`sv0${svSingleDigit[1]}`);
  }

  const svHalf = setId.match(/^sv(\d{2})\.5$/);
  if (svHalf) {
    aliases.add(`sv${Number(svHalf[1])}pt5`);
  }

  const meStandard = setId.match(/^me(\d{2})$/);
  if (meStandard) {
    aliases.add(`me${Number(meStandard[1])}`);
  }

  const meHalf = setId.match(/^me(\d{2})\.5$/);
  if (meHalf) {
    aliases.add(`me${Number(meHalf[1])}pt5`);
  }

  const swshHalf = setId.match(/^swsh(\d+)\.5$/);
  if (swshHalf) {
    aliases.add(`swsh${swshHalf[1]}pt5`);
    aliases.add(`swsh${swshHalf[1]}5`);
    aliases.add("swsh45");
    if (localId.startsWith("sv")) {
      aliases.add("swsh45sv");
    }
  }

  const smHalf = setId.match(/^sm(\d+)\.5$/);
  if (smHalf) {
    aliases.add(`sm${smHalf[1]}5`);
  }

  if (setId === "me03") {
    aliases.add("por");
  }

  if (setId === "sv10.5w") {
    aliases.add("rsv10pt5");
  }

  if (setId === "sv10.5b") {
    aliases.add("zsv10pt5");
  }

  if (setId === "lc") {
    aliases.add("base6");
  }

  if (/^swsh\d+$/.test(setId) && /^tg\d+/i.test(localId)) {
    aliases.add(`${setId}tg`);
  }

  if (setId === "swsh12.5" && /^gg\d+/i.test(localId)) {
    aliases.add("swsh12pt5gg");
  }

  return [...aliases];
}

function buildCardIdAliases(cardId: string): string[] {
  const normalizedId = normalizeLookupKey(cardId);
  const hyphenIndex = normalizedId.indexOf("-");

  if (hyphenIndex === -1) {
    return [normalizedId];
  }

  const setId = normalizedId.slice(0, hyphenIndex);
  const localId = normalizedId.slice(hyphenIndex + 1);
  const aliases = new Set([normalizedId]);

  for (const setAlias of buildSetIdAliases(setId, localId)) {
    for (const localAlias of buildLocalIdAliases(localId)) {
      aliases.add(`${setAlias}-${localAlias}`);
    }
  }

  return [...aliases];
}

async function tcgdexFetch<T>(
  path: string,
  options?: { revalidateSeconds?: number }
): Promise<T> {
  const init: RequestInit & { next?: { revalidate: number } } =
    options?.revalidateSeconds != null
      ? { next: { revalidate: options.revalidateSeconds } }
      : { cache: "no-store" };

  const response = await fetch(path.startsWith("http") ? path : `${TCGDEX_API_BASE}${path}`, init);

  if (!response.ok) {
    throw new Error(`TCGdex API ${response.status}: ${path}`);
  }

  return response.json() as Promise<T>;
}

async function mapInBatches<T, TResult>(
  items: readonly T[],
  mapper: (item: T) => Promise<TResult>
): Promise<TResult[]> {
  const results: TResult[] = [];

  for (let index = 0; index < items.length; index += TCGDEX_REQUEST_BATCH_SIZE) {
    const batch = items.slice(index, index + TCGDEX_REQUEST_BATCH_SIZE);
    results.push(...(await Promise.all(batch.map((item) => mapper(item)))));
  }

  return results;
}

export function categoryToSupertype(category: string | null | undefined): string | null {
  const normalized = normalizeOptionalString(category)?.toLowerCase();

  if (!normalized) return null;
  if (normalized === "pokemon") return "Pok\u00e9mon";
  if (normalized === "trainer") return "Trainer";
  if (normalized === "energy") return "Energy";

  return normalizeOptionalString(category);
}

export function resolveTcgdexSetIdForEpisode(input: {
  code?: string | null;
  name?: string | null;
}): string | null {
  const normalizedCode = normalizeOptionalString(input.code)?.toLowerCase();
  if (normalizedCode && TCGDEX_SET_ID_BY_LOCAL_CODE.has(normalizedCode)) {
    return TCGDEX_SET_ID_BY_LOCAL_CODE.get(normalizedCode) ?? null;
  }

  const normalizedName = normalizeOptionalString(input.name)?.toLowerCase();
  if (normalizedName && TCGDEX_SET_ID_BY_LOCAL_NAME.has(normalizedName)) {
    return TCGDEX_SET_ID_BY_LOCAL_NAME.get(normalizedName) ?? null;
  }

  return null;
}

async function fetchTcgdexSet(setId: string): Promise<TcgdexSetResponse> {
  return tcgdexFetch<TcgdexSetResponse>(`/sets/${encodeURIComponent(setId)}`);
}

async function fetchTcgdexCard(cardId: string): Promise<TcgdexCardResponse> {
  return tcgdexFetch<TcgdexCardResponse>(`/cards/${encodeURIComponent(cardId)}`);
}

async function fetchTcgdexSetCards(setId: string): Promise<TcgdexCardResponse[]> {
  const set = await fetchTcgdexSet(setId);
  const cardIds = (set.cards ?? []).map((card) => card.id);
  return mapInBatches(cardIds, (cardId) => fetchTcgdexCard(cardId));
}

async function loadTcgdexImageLookup(): Promise<TcgdexImageLookup> {
  const cards = await tcgdexFetch<TcgdexCardBrief[]>(TCGDEX_CARDS_ENDPOINT, {
    revalidateSeconds: IMAGE_REVALIDATE_SECONDS,
  });
  const lookup: TcgdexImageLookup = new Map();

  for (const card of cards) {
    const imageUrl = buildHighResImageUrl(card.image);
    if (!imageUrl) continue;

    for (const alias of buildCardIdAliases(card.id)) {
      if (!lookup.has(alias)) {
        lookup.set(alias, imageUrl);
      }
    }
  }

  return lookup;
}

async function loadTcgdexSupertypeLookup(setId: string): Promise<ReadonlyMap<string, string>> {
  const cards = await fetchTcgdexSetCards(setId);
  const lookup = new Map<string, string>();

  for (const card of cards) {
    const supertype = categoryToSupertype(card.category);
    if (!supertype) continue;

    for (const alias of buildCardIdAliases(card.id)) {
      if (!lookup.has(alias)) {
        lookup.set(alias, supertype);
      }
    }
  }

  return lookup;
}

export async function getTcgdexImageLookup(): Promise<TcgdexImageLookup> {
  if (!tcgdexImageLookupPromise) {
    tcgdexImageLookupPromise = loadTcgdexImageLookup().catch((error) => {
      console.error("Failed to load TCGdex image lookup", error);
      tcgdexImageLookupPromise = null;
      return new Map();
    });
  }

  return tcgdexImageLookupPromise;
}

export async function getTcgdexSupertypeLookupForSet(
  setId: string
): Promise<ReadonlyMap<string, string>> {
  const normalizedSetId = normalizeLookupKey(setId);

  if (!tcgdexSupertypeLookupPromises.has(normalizedSetId)) {
    tcgdexSupertypeLookupPromises.set(
      normalizedSetId,
      loadTcgdexSupertypeLookup(normalizedSetId).catch((error) => {
        console.error(`Failed to load TCGdex supertype lookup for ${normalizedSetId}`, error);
        tcgdexSupertypeLookupPromises.delete(normalizedSetId);
        return new Map();
      })
    );
  }

  return tcgdexSupertypeLookupPromises.get(normalizedSetId) ?? new Map();
}

export function resolveTcgdexImageUrl(
  cardId: string | null | undefined,
  lookup: ReadonlyMap<string, string>
): string | null {
  if (!cardId) return null;
  return lookup.get(normalizeLookupKey(cardId)) ?? null;
}

export function resolveTcgdexSupertype(
  cardId: string | null | undefined,
  lookup: ReadonlyMap<string, string>
): string | null {
  if (!cardId) return null;
  return lookup.get(normalizeLookupKey(cardId)) ?? null;
}
