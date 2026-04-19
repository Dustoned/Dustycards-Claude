import { buildCardMarketProductUrl } from "@/lib/cardmarket";
import { getTcgdexImageLookup, resolveTcgdexImageUrl } from "@/lib/tcgdex";

const BASE_URL = "https://cardmarket-api-tcg.p.rapidapi.com";
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_RETRY_ATTEMPTS = 2;
const RETRYABLE_STATUS_CODES = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

const headers = {
  "x-rapidapi-key": process.env.RAPIDAPI_KEY!,
  "x-rapidapi-host": process.env.RAPIDAPI_HOST!,
};

// Actual API shapes (from live testing)
interface RawEpisode {
  id: number;
  name: string;
  code?: string;
  released_at?: string;
  cards_total?: number;
  logo?: string | null;
  symbol?: string | null;
  series?: { id: number; name: string; slug: string } | null;
}

interface RawCard {
  id: number;
  name: string;
  card_number?: number | string | null;
  rarity?: string;
  hp?: number;
  supertype?: string;
  subtypes?: string[];
  artist?: { id: number; name: string; slug: string } | null;
  image?: string | null;
  tcggo_url?: string;
  tcgid?: string | number | null;
  cardmarket_id?: string | number | null;
  tcgplayer_id?: string | number | null;
  prices?: RawPrices;
}

interface RawPrices {
  cardmarket?: {
    lowest_near_mint?: number;
    lowest_near_mint_EU_only?: number;
    lowest_near_mint_DE?: number;
    lowest_near_mint_DE_EU_only?: number;
    lowest_near_mint_FR?: number;
    lowest_near_mint_FR_EU_only?: number;
    lowest_near_mint_ES?: number;
    lowest_near_mint_ES_EU_only?: number;
    lowest_near_mint_IT?: number;
    lowest_near_mint_IT_EU_only?: number;
    "30d_average"?: number;
    "7d_average"?: number;
    graded?: RawGradedPrices | null;
  };
  tcg_player?: {
    currency?: string;
    market_price?: number;
    mid_price?: number;
    low_price?: number;
  };
}

type RawGradedPrices =
  | Array<{
      grade?: string | null;
      price?: number | null;
    }>
  | Record<string, Record<string, number | null> | number | null>;

interface RawSealedProduct {
  id: number;
  name: string;
  image?: string | null;
  tcggo_url?: string | null;
  cardmarket_id?: string | number | null;
  tcgplayer_id?: string | number | null;
  links?: {
    cardmarket?: string | null;
  } | null;
  prices?: {
    cardmarket?: {
      lowest?: number;
      lowest_EU_only?: number;
      lowest_DE?: number;
      lowest_FR?: number;
      lowest_ES?: number;
      lowest_IT?: number;
      "30d_average"?: number;
      "7d_average"?: number;
    };
  } | null;
}

export interface NormalizedEpisode {
  id: string;
  name: string;
  code: string | null;
  release_date: string | null;
  card_count: number | null;
  logo_url: string | null;
  symbol_url: string | null;
  series: string | null;
}

export interface NormalizedCard {
  id: string;
  name: string;
  card_number: string | null;
  rarity: string | null;
  hp: number | null;
  supertype: string | null;
  subtypes: string | null;
  artist: string | null;
  image_url: string | null;
  cardmarket_url: string | null;
  tcggo_url: string | null;
  tcgid: string | null;
  cardmarket_id: string | null;
  tcgplayer_id: string | null;
  prices: RawPrices | undefined;
}

export interface NormalizedGradedPrice {
  label: string;
  price: number;
}

export interface TcggoHistoryPricePoint {
  date: string;
  label: string;
  cm_market: number | null;
  cm_market_de: number | null;
  cm_market_fr: number | null;
  cm_market_es: number | null;
  cm_market_it: number | null;
  tcp_market: number | null;
}

export interface NormalizedSealedProduct {
  id: string;
  name: string;
  image_url: string | null;
  tcggo_url: string | null;
  cardmarket_url: string | null;
  cardmarket_id: string | null;
  tcgplayer_id: string | null;
  price: {
    cm_lowest: number | null;
    cm_lowest_eu: number | null;
    cm_lowest_de: number | null;
    cm_lowest_fr: number | null;
    cm_lowest_es: number | null;
    cm_lowest_it: number | null;
    cm_avg_7d: number | null;
    cm_avg_30d: number | null;
  };
}

async function apiFetch<T>(path: string): Promise<T> {
  let attempt = 0;
  let lastError: Error | null = null;

  while (attempt <= MAX_RETRY_ATTEMPTS) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const res = await fetch(`${BASE_URL}${path}`, {
        headers,
        cache: "no-store",
        signal: controller.signal,
      });

      if (!res.ok) {
        const statusError = new Error(`TCGGO API ${res.status}: ${path}`);
        if (attempt < MAX_RETRY_ATTEMPTS && RETRYABLE_STATUS_CODES.has(res.status)) {
          lastError = statusError;
          attempt += 1;
          await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
          continue;
        }

        throw statusError;
      }

      return res.json() as Promise<T>;
    } catch (error) {
      const isAbortError =
        error instanceof Error &&
        (error.name === "AbortError" || error.message.includes("aborted"));
      const isRetryableNetworkError = error instanceof TypeError || isAbortError;

      if (attempt < MAX_RETRY_ATTEMPTS && isRetryableNetworkError) {
        lastError = error instanceof Error ? error : new Error(String(error));
        attempt += 1;
        await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
        continue;
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError ?? new Error(`TCGGO API request failed: ${path}`);
}

function normalizeEpisode(ep: RawEpisode): NormalizedEpisode {
  return {
    id: String(ep.id),
    name: ep.name,
    code: ep.code ?? null,
    release_date: ep.released_at ?? null,
    card_count: ep.cards_total ?? null,
    logo_url: ep.logo ?? null,
    symbol_url: ep.symbol ?? null,
    series: ep.series?.name ?? null,
  };
}

function normalizeCard(
  card: RawCard,
  tcgdexImageLookup: ReadonlyMap<string, string>
): NormalizedCard {
  const cardmarketId = card.cardmarket_id != null ? String(card.cardmarket_id) : null;
  const tcgId = card.tcgid != null ? String(card.tcgid) : null;
  const tcgdexImageUrl = resolveTcgdexImageUrl(tcgId, tcgdexImageLookup);

  return {
    id: String(card.id),
    name: card.name,
    card_number: card.card_number != null ? String(card.card_number) : null,
    rarity: card.rarity ?? null,
    hp: card.hp ?? null,
    supertype: card.supertype ?? null,
    subtypes: card.subtypes?.join(",") ?? null,
    artist: card.artist?.name ?? null,
    image_url: tcgdexImageUrl ?? card.image ?? null,
    cardmarket_url: cardmarketId ? buildCardMarketProductUrl(cardmarketId) : null,
    tcggo_url: card.tcggo_url ?? null,
    tcgid: tcgId,
    cardmarket_id: cardmarketId,
    tcgplayer_id: card.tcgplayer_id != null ? String(card.tcgplayer_id) : null,
    prices: card.prices,
  };
}

function normalizeSealedProduct(product: RawSealedProduct): NormalizedSealedProduct {
  const cardmarketId =
    product.cardmarket_id != null ? String(product.cardmarket_id) : null;
  const cardmarket = product.prices?.cardmarket;

  return {
    id: String(product.id),
    name: product.name,
    image_url: product.image ?? null,
    tcggo_url: product.tcggo_url ?? null,
    cardmarket_url:
      cardmarketId
        ? buildCardMarketProductUrl(cardmarketId)
        : product.links?.cardmarket ?? null,
    cardmarket_id: cardmarketId,
    tcgplayer_id:
      product.tcgplayer_id != null ? String(product.tcgplayer_id) : null,
    price: {
      cm_lowest: cardmarket?.lowest ?? null,
      cm_lowest_eu: cardmarket?.lowest_EU_only ?? null,
      cm_lowest_de: cardmarket?.lowest_DE ?? null,
      cm_lowest_fr: cardmarket?.lowest_FR ?? null,
      cm_lowest_es: cardmarket?.lowest_ES ?? null,
      cm_lowest_it: cardmarket?.lowest_IT ?? null,
      cm_avg_7d: cardmarket?.["7d_average"] ?? null,
      cm_avg_30d: cardmarket?.["30d_average"] ?? null,
    },
  };
}

function toHistoryDateLabel(dateKey: string): string {
  return new Intl.DateTimeFormat("nl-NL", {
    day: "numeric",
    month: "short",
  }).format(new Date(`${dateKey}T00:00:00.000Z`));
}

function normalizeGradeToken(token: string): string {
  return token
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeGradedPriceLabel(sourceKey: string, nestedKey?: string): string {
  const upperSource = sourceKey.toUpperCase();
  const normalizedNested = nestedKey ? normalizeGradeToken(nestedKey) : "";
  const match = nestedKey?.match(/(\d+(?:\.\d+)?)/);

  if (match) {
    return `${upperSource} ${match[1]}`;
  }

  if (normalizedNested) {
    if (normalizedNested.toUpperCase().startsWith(upperSource)) {
      return normalizedNested.toUpperCase();
    }

    return `${upperSource} ${normalizedNested}`;
  }

  return upperSource;
}

export function extractGradedPrices(prices: RawPrices | undefined): NormalizedGradedPrice[] {
  const graded = prices?.cardmarket?.graded;
  if (!graded) return [];

  if (Array.isArray(graded)) {
    return graded
      .flatMap((entry) => {
        if (!entry?.grade || entry.price == null) return [];
        return [{ label: entry.grade, price: entry.price }];
      })
      .sort((a, b) => b.price - a.price);
  }

  const normalized: NormalizedGradedPrice[] = [];

  for (const [sourceKey, sourceValue] of Object.entries(graded)) {
    if (sourceValue == null) continue;

    if (typeof sourceValue === "number") {
      normalized.push({
        label: normalizeGradedPriceLabel(sourceKey),
        price: sourceValue,
      });
      continue;
    }

    if (typeof sourceValue === "object") {
      for (const [nestedKey, nestedValue] of Object.entries(sourceValue)) {
        if (nestedValue == null) continue;
        normalized.push({
          label: normalizeGradedPriceLabel(sourceKey, nestedKey),
          price: nestedValue,
        });
      }
    }
  }

  return normalized.sort((a, b) => b.price - a.price);
}

interface RawHistoryPriceEntry {
  cm_low?: number | null;
  cm_low_de?: number | null;
  cm_low_fr?: number | null;
  cm_low_es?: number | null;
  cm_low_it?: number | null;
  tcg_player_market?: number | null;
}

interface RawHistoryPriceResponse {
  data?: Record<string, RawHistoryPriceEntry>;
  paging?: {
    current?: number;
    total?: number;
    per_page?: number;
  };
  results?: number;
}

export async function fetchAllEpisodes(): Promise<NormalizedEpisode[]> {
  const all: NormalizedEpisode[] = [];
  let page = 1;
  while (true) {
    const data = await apiFetch<{ data: RawEpisode[]; paging?: { total?: number } }>(
      `/pokemon/episodes?page=${page}&per_page=100`
    );
    all.push(...(data.data ?? []).map(normalizeEpisode));
    const totalPages = data.paging?.total ?? 1;
    if (page >= totalPages) break;
    page++;
  }
  return all;
}

export async function fetchCardsForEpisode(episodeId: string): Promise<NormalizedCard[]> {
  const all: NormalizedCard[] = [];
  const tcgdexImageLookup = await getTcgdexImageLookup();
  let page = 1;
  while (true) {
    const data = await apiFetch<{ data: RawCard[]; paging?: { total?: number } }>(
      `/pokemon/episodes/${episodeId}/cards?page=${page}&per_page=100`
    );
    all.push(...(data.data ?? []).map((card) => normalizeCard(card, tcgdexImageLookup)));
    const totalPages = data.paging?.total ?? 1;
    if (page >= totalPages) break;
    page++;
  }
  return all;
}

export async function fetchSealedAvailabilityForEpisode(
  episodeId: string
): Promise<boolean> {
  const data = await apiFetch<{ data: RawSealedProduct[] }>(
    `/pokemon/episodes/${episodeId}/products?page=1&per_page=1`
  );

  return (data.data?.length ?? 0) > 0;
}

export async function fetchSealedProductsForEpisode(
  episodeId: string
): Promise<NormalizedSealedProduct[]> {
  const firstPage = await apiFetch<{
    data: RawSealedProduct[];
    paging?: { total?: number };
  }>(`/pokemon/episodes/${episodeId}/products?page=1&per_page=100`);

  const all: NormalizedSealedProduct[] = (firstPage.data ?? []).map(normalizeSealedProduct);
  const totalPages = firstPage.paging?.total ?? 1;

  if (totalPages <= 1) {
    return all;
  }

  const remainingPages = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_, index) =>
      apiFetch<{
        data: RawSealedProduct[];
        paging?: { total?: number };
      }>(`/pokemon/episodes/${episodeId}/products?page=${index + 2}&per_page=100`)
    )
  );

  for (const page of remainingPages) {
    all.push(...(page.data ?? []).map(normalizeSealedProduct));
  }

  return all;
}

export async function fetchHistoryPricesByItemId(
  itemId: string,
  options?: {
    lang?: "en" | "de" | "fr" | "es" | "it";
    dateFrom?: string;
    dateTo?: string;
  }
): Promise<TcggoHistoryPricePoint[]> {
  const params = new URLSearchParams({
    id: itemId,
    sort: "asc",
    page: "1",
  });

  if (options?.lang) params.set("lang", options.lang);
  if (options?.dateFrom) params.set("date_from", options.dateFrom);
  if (options?.dateTo) params.set("date_to", options.dateTo);

  const firstPage = await apiFetch<RawHistoryPriceResponse>(`/pokemon/history-prices?${params}`);
  const totalPages = firstPage.paging?.total ?? 1;
  const remainingPages =
    totalPages > 1
      ? await Promise.all(
          Array.from({ length: totalPages - 1 }, (_, index) => {
            const pageParams = new URLSearchParams(params);
            pageParams.set("page", String(index + 2));
            return apiFetch<RawHistoryPriceResponse>(`/pokemon/history-prices?${pageParams}`);
          })
        )
      : [];
  const pages = [firstPage, ...remainingPages];

  const merged = new Map<string, RawHistoryPriceEntry>();

  for (const page of pages) {
    for (const [date, entry] of Object.entries(page.data ?? {})) {
      merged.set(date, entry);
    }
  }

  return [...merged.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, entry]) => ({
      date,
      label: toHistoryDateLabel(date),
      cm_market: entry.cm_low ?? null,
      cm_market_de: entry.cm_low_de ?? null,
      cm_market_fr: entry.cm_low_fr ?? null,
      cm_market_es: entry.cm_low_es ?? null,
      cm_market_it: entry.cm_low_it ?? null,
      tcp_market: entry.tcg_player_market ?? null,
    }));
}

export async function fetchCardDetail(cardId: string): Promise<NormalizedCard | null> {
  const tcgdexImageLookup = await getTcgdexImageLookup();
  const data = await apiFetch<{ data?: RawCard }>(`/pokemon/cards/${cardId}`);
  const card = data.data;

  if (!card) return null;

  return normalizeCard(card, tcgdexImageLookup);
}

export function extractPrices(prices: RawPrices | undefined) {
  const cm = prices?.cardmarket;
  const tcp = prices?.tcg_player;
  return {
    cm_en_lowest_nm: cm?.lowest_near_mint ?? null,
    cm_de_lowest_nm: cm?.lowest_near_mint_DE ?? null,
    cm_fr_lowest_nm: cm?.lowest_near_mint_FR ?? null,
    cm_es_lowest_nm: cm?.lowest_near_mint_ES ?? null,
    cm_it_lowest_nm: cm?.lowest_near_mint_IT ?? null,
    cm_en_avg_30d: cm?.["30d_average"] ?? null,
    cm_en_avg_7d: cm?.["7d_average"] ?? null,
    tcp_market: tcp?.market_price ?? null,
    tcp_mid: tcp?.mid_price ?? null,
    tcp_low: tcp?.low_price ?? null,
  };
}
