const TCGDEX_API_BASE = "https://api.tcgdex.net/v2/en";
const TCGDEX_CARDS_ENDPOINT = `${TCGDEX_API_BASE}/cards`;
const HIGH_RES_IMAGE_SUFFIX = "/high.webp";
const IMAGE_REVALIDATE_SECONDS = 60 * 60 * 24;
const TCGDEX_REQUEST_BATCH_SIZE = 20;
const TCGDEX_REQUEST_TIMEOUT_MS = 15_000;
const TCGDEX_MAX_RETRY_ATTEMPTS = 1;
const TCGDEX_RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);

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

interface TcgdexSetSearchResult {
  id: string;
  name: string;
  cardCount?: {
    total?: number | null;
    official?: number | null;
  } | null;
}

interface TcgdexCardResponse {
  id: string;
  name?: string | null;
  localId?: string | null;
  category?: string | null;
  illustrator?: string | null;
}

type TcgdexCollectionResponse<T> = T[] | { value?: T[] | null };
type TcgdexImageLookup = Map<string, string>;

const TCGDEX_SET_ID_BY_LOCAL_CODE = new Map<string, string>([["por", "me03"]]);

const TCGDEX_SET_ID_BY_LOCAL_NAME = new Map<string, string>([
  ["perfect order", "me03"],
]);

let tcgdexImageLookupPromise: Promise<TcgdexImageLookup> | null = null;
const tcgdexSupertypeLookupPromises = new Map<string, Promise<ReadonlyMap<string, string>>>();
const tcgdexResolvedSetIdPromises = new Map<string, Promise<string | null>>();
const tcgdexCardDetailPromises = new Map<string, Promise<TcgdexCardResponse | null>>();

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

function normalizeNameForMatch(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function namesMatch(left: string | null | undefined, right: string | null | undefined): boolean {
  const normalizedLeft = normalizeOptionalString(left);
  const normalizedRight = normalizeOptionalString(right);

  if (!normalizedLeft || !normalizedRight) {
    return false;
  }

  return normalizeNameForMatch(normalizedLeft) === normalizeNameForMatch(normalizedRight);
}

function unwrapCollectionResponse<T>(response: TcgdexCollectionResponse<T>): T[] {
  return Array.isArray(response) ? response : response.value ?? [];
}

function isTcgdexNotFoundError(error: unknown): boolean {
  return error instanceof Error && error.message.includes("TCGdex API 404");
}

function buildEpisodeLookupKey(input: {
  code?: string | null;
  name?: string | null;
  cardCount?: number | null;
}): string {
  return [
    normalizeOptionalString(input.code)?.toLowerCase() ?? "",
    normalizeOptionalString(input.name)?.toLowerCase() ?? "",
    input.cardCount != null ? String(input.cardCount) : "",
  ].join("|");
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

    if (setId === "swsh4.5" && localId.startsWith("sv")) {
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

export function buildTcgdexCardIdAliases(cardId: string): string[] {
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

function extractCardLocalId(cardId: string | null | undefined): string | null {
  const normalizedId = normalizeOptionalString(cardId);
  if (!normalizedId) return null;

  const hyphenIndex = normalizedId.indexOf("-");
  return hyphenIndex === -1 ? normalizedId : normalizedId.slice(hyphenIndex + 1);
}

function buildTcgdexLocalIdCandidates(value: string | null | undefined): string[] {
  const normalizedValue = normalizeOptionalString(value);
  if (!normalizedValue) return [];

  const primary = normalizedValue.split("/")[0]?.trim() ?? normalizedValue;
  const compact = primary.replace(/\s+/g, "");
  const aliases = new Set<string>([compact, compact.toUpperCase()]);
  const numeric = normalizeNumericString(compact);

  if (numeric) {
    aliases.add(numeric);
    aliases.add(numeric.padStart(3, "0"));
  }

  return [...aliases];
}

async function tcgdexFetch<T>(
  path: string,
  options?: { revalidateSeconds?: number }
): Promise<T> {
  let attempt = 0;
  let lastError: Error | null = null;

  while (attempt <= TCGDEX_MAX_RETRY_ATTEMPTS) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TCGDEX_REQUEST_TIMEOUT_MS);
    const init: RequestInit & { next?: { revalidate: number } } =
      options?.revalidateSeconds != null
        ? {
            next: { revalidate: options.revalidateSeconds },
            signal: controller.signal,
          }
        : { cache: "no-store", signal: controller.signal };

    try {
      const response = await fetch(
        path.startsWith("http") ? path : `${TCGDEX_API_BASE}${path}`,
        init
      );

      if (!response.ok) {
        const statusError = new Error(`TCGdex API ${response.status}: ${path}`);

        if (
          attempt < TCGDEX_MAX_RETRY_ATTEMPTS &&
          TCGDEX_RETRYABLE_STATUS_CODES.has(response.status)
        ) {
          lastError = statusError;
          attempt += 1;
          await new Promise((resolve) => setTimeout(resolve, 300 * attempt));
          continue;
        }

        throw statusError;
      }

      return response.json() as Promise<T>;
    } catch (error) {
      const isAbortError =
        error instanceof Error &&
        (error.name === "AbortError" || error.message.includes("aborted"));
      const isRetryableNetworkError = error instanceof TypeError || isAbortError;

      if (attempt < TCGDEX_MAX_RETRY_ATTEMPTS && isRetryableNetworkError) {
        lastError = error instanceof Error ? error : new Error(String(error));
        attempt += 1;
        await new Promise((resolve) => setTimeout(resolve, 300 * attempt));
        continue;
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError ?? new Error(`TCGdex API request failed: ${path}`);
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

async function searchTcgdexSetsByName(name: string): Promise<TcgdexSetSearchResult[]> {
  const response = await tcgdexFetch<TcgdexCollectionResponse<TcgdexSetSearchResult>>(
    `/sets?name=${encodeURIComponent(name)}`,
    { revalidateSeconds: IMAGE_REVALIDATE_SECONDS }
  );

  return unwrapCollectionResponse(response);
}

function pickBestSetMatch(
  matches: readonly TcgdexSetSearchResult[],
  input: { name?: string | null; cardCount?: number | null }
): string | null {
  if (matches.length === 0) return null;

  const normalizedName = normalizeOptionalString(input.name);
  let rankedMatches = normalizedName
    ? matches.filter((match) => namesMatch(match.name, normalizedName))
    : [];

  if (rankedMatches.length === 0) {
    rankedMatches = [...matches];
  }

  if (input.cardCount != null) {
    const totalMatches = rankedMatches.filter((match) => match.cardCount?.total === input.cardCount);
    if (totalMatches.length > 0) {
      rankedMatches = totalMatches;
    }
  }

  return rankedMatches[0]?.id ?? null;
}

export async function findTcgdexSetIdForEpisode(input: {
  code?: string | null;
  name?: string | null;
  cardCount?: number | null;
}): Promise<string | null> {
  const directMatch = resolveTcgdexSetIdForEpisode(input);
  if (directMatch) {
    return directMatch;
  }

  const normalizedName = normalizeOptionalString(input.name);
  if (!normalizedName) {
    return null;
  }

  const cacheKey = buildEpisodeLookupKey(input);
  if (!tcgdexResolvedSetIdPromises.has(cacheKey)) {
    tcgdexResolvedSetIdPromises.set(
      cacheKey,
      searchTcgdexSetsByName(normalizedName).then((matches) =>
        pickBestSetMatch(matches, {
          name: normalizedName,
          cardCount: input.cardCount ?? null,
        })
      )
    );
  }

  return tcgdexResolvedSetIdPromises.get(cacheKey) ?? null;
}

async function fetchTcgdexSet(setId: string): Promise<TcgdexSetResponse> {
  return tcgdexFetch<TcgdexSetResponse>(`/sets/${encodeURIComponent(setId)}`);
}

async function fetchTcgdexCard(cardId: string): Promise<TcgdexCardResponse> {
  return tcgdexFetch<TcgdexCardResponse>(`/cards/${encodeURIComponent(cardId)}`);
}

async function fetchTcgdexCardNullable(cardId: string): Promise<TcgdexCardResponse | null> {
  const normalizedCardId = normalizeLookupKey(cardId);
  const requestCardId = normalizeOptionalString(cardId) ?? cardId;

  if (!tcgdexCardDetailPromises.has(normalizedCardId)) {
    tcgdexCardDetailPromises.set(
      normalizedCardId,
      fetchTcgdexCard(requestCardId).catch((error) => {
        if (isTcgdexNotFoundError(error)) {
          return null;
        }

        tcgdexCardDetailPromises.delete(normalizedCardId);
        throw error;
      })
    );
  }

  return tcgdexCardDetailPromises.get(normalizedCardId) ?? null;
}

async function fetchTcgdexSetCards(setId: string): Promise<TcgdexCardResponse[]> {
  const set = await fetchTcgdexSet(setId);
  const cardIds = (set.cards ?? []).map((card) => card.id);
  return mapInBatches(cardIds, async (cardId) => {
    const detail = await fetchTcgdexCardNullable(cardId);
    if (!detail) {
      throw new Error(`TCGdex card disappeared during set sync: ${cardId}`);
    }
    return detail;
  });
}

async function loadTcgdexImageLookup(): Promise<TcgdexImageLookup> {
  const cards = await tcgdexFetch<TcgdexCardBrief[]>(TCGDEX_CARDS_ENDPOINT);
  const lookup: TcgdexImageLookup = new Map();

  for (const card of cards) {
    const imageUrl = buildHighResImageUrl(card.image);
    if (!imageUrl) continue;

    for (const alias of buildTcgdexCardIdAliases(card.id)) {
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

    for (const alias of buildTcgdexCardIdAliases(card.id)) {
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

export async function getTcgdexIllustratorLookupForCards(
  episode: {
    code?: string | null;
    name?: string | null;
    cardCount?: number | null;
  },
  cards: ReadonlyArray<{
    id: string;
    name: string;
    card_number: string | null;
    tcgid: string | null;
    artist?: string | null;
  }>
): Promise<ReadonlyMap<string, string>> {
  const setId = await findTcgdexSetIdForEpisode(episode);
  if (!setId) {
    return new Map();
  }

  const lookup = new Map<string, string>();
  const pendingCards = cards.filter((card) => {
    if (card.artist) return false;
    return Boolean(card.card_number || extractCardLocalId(card.tcgid));
  });

  if (pendingCards.length === 0) {
    return lookup;
  }

  const matches = await mapInBatches(pendingCards, async (card) => {
    const localIdSource = card.card_number ?? extractCardLocalId(card.tcgid);

    for (const localId of buildTcgdexLocalIdCandidates(localIdSource)) {
      const tcgdexCard = await fetchTcgdexCardNullable(`${setId}-${localId}`);
      if (!tcgdexCard?.illustrator) continue;
      if (tcgdexCard.name && !namesMatch(tcgdexCard.name, card.name)) continue;

      return {
        cardId: card.id,
        illustrator: tcgdexCard.illustrator,
      };
    }

    return null;
  });

  for (const match of matches) {
    if (!match) continue;
    lookup.set(match.cardId, match.illustrator);
  }

  return lookup;
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
