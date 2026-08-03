import {
  getFirecrawlConfigSnapshot,
  scrapeFirecrawlPage,
  searchFirecrawlWeb,
  toFirecrawlApiError,
  type FirecrawlPageScrapeOptions,
  type FirecrawlPageScrapeResult,
  type FirecrawlWebSearchResponse,
} from "@/lib/firecrawl";
import {
  getScrapeDoConfigSnapshot,
  isScrapeDoRotationFailure,
  scrapeScrapeDoPage,
  searchScrapeDoWeb,
  type ScrapeDoPageScrapeOptions,
} from "@/lib/scrapedo";
import { getTavilyConfigSnapshot, searchTavilyWeb } from "@/lib/tavily";

export type PageScrapeProvider = "firecrawl" | "scrapedo";
export type WebSearchProvider = "tavily" | "firecrawl" | "scrapedo";

export interface ProviderPageScrapeResult extends FirecrawlPageScrapeResult {
  provider: PageScrapeProvider;
}

export interface ProviderWebSearchResponse extends FirecrawlWebSearchResponse {
  provider: WebSearchProvider;
}

export interface ScrapePageWithFallbackOptions extends FirecrawlPageScrapeOptions {
  /** Skip Firecrawl after its app/provider budget guard has already rejected the call. */
  skipFirecrawl?: boolean;
}

export interface SearchWebWithFallbackOptions {
  query: string;
  limit?: number;
  includeDomains?: string[];
  tbs?: string;
  topic?: "news" | "general";
  /** Skip Firecrawl after its app/provider budget guard has already rejected the call. */
  skipFirecrawl?: boolean;
  /** Card discovery benefits from Tavily first; callers can explicitly opt out. */
  useTavily?: boolean;
}

function normalizedHttpUrl(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

// CardMarket needs a DE proxy profile. Rendering remains the cheaper first
// attempt while Firecrawl is available; when its budget guard already skipped
// Firecrawl, the residential profile avoids a known datacenter rotation failure.
function isCardMarketUrl(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return hostname === "cardmarket.com" || hostname.endsWith(".cardmarket.com");
  } catch {
    return false;
  }
}

function scrapeDoOptionsForUrl(url: string): ScrapeDoPageScrapeOptions {
  if (isCardMarketUrl(url)) {
    return {
      output: "html",
      render: true,
      geoCode: "de",
      providerTimeoutMs: 65_000,
      timeoutMs: 75_000,
    };
  }
  return {};
}

function scrapeDoResidentialOptionsForUrl(url: string): ScrapeDoPageScrapeOptions {
  return {
    ...scrapeDoOptionsForUrl(url),
    // CardMarket's complete product and offer HTML is server-rendered. The
    // residential route bypasses its datacenter block without paying the
    // extra headless-browser cost (10 credits instead of 25).
    render: false,
    superProxy: true,
  };
}

function isRecoverableFirecrawlFailure(error: unknown): boolean {
  const normalized = toFirecrawlApiError(error);
  if (normalized.status >= 500) return true;
  if ([401, 402, 403, 408, 409, 425, 429].includes(normalized.status)) return true;
  return normalized.status === 400 && /api key is not configured/i.test(normalized.message);
}

function hasUsablePage(result: FirecrawlPageScrapeResult): boolean {
  return Boolean(result.html.trim() || result.markdown.trim());
}

function withPageProvider(
  result: FirecrawlPageScrapeResult,
  provider: PageScrapeProvider
): ProviderPageScrapeResult {
  return {
    ...result,
    provider,
    metadata: { ...result.metadata, provider },
  };
}

/**
 * Fetches a known public page exactly once per provider. Firecrawl stays first;
 * Scrape.do is only reached when Firecrawl is unavailable, rejected by its
 * caller-owned budget, fails operationally, or returns no usable document.
 */
export async function scrapePageWithFallback(
  rawUrl: string,
  options: ScrapePageWithFallbackOptions = {}
): Promise<ProviderPageScrapeResult> {
  const url = normalizedHttpUrl(rawUrl);
  if (!url) throw new Error("Use a valid http(s) URL.");

  const { skipFirecrawl = false, ...scrapeOptions } = options;
  let firecrawlError: unknown = null;
  if (!skipFirecrawl && getFirecrawlConfigSnapshot().configured) {
    try {
      const result = await scrapeFirecrawlPage(url, scrapeOptions);
      if (hasUsablePage(result)) return withPageProvider(result, "firecrawl");
      firecrawlError = new Error("Firecrawl returned an empty page.");
    } catch (error) {
      if (!isRecoverableFirecrawlFailure(error)) throw error;
      firecrawlError = error;
    }
  }

  if (getScrapeDoConfigSnapshot().configured) {
    const cardMarketRequest = isCardMarketUrl(url);
    const useResidentialFirst = cardMarketRequest && skipFirecrawl;
    try {
      return withPageProvider(
        await scrapeScrapeDoPage(url, {
          ...scrapeOptions,
          ...(useResidentialFirst
            ? scrapeDoResidentialOptionsForUrl(url)
            : scrapeDoOptionsForUrl(url)),
        }),
        "scrapedo"
      );
    } catch (scrapeDoError) {
      let finalScrapeDoError = scrapeDoError;
      if (
        cardMarketRequest &&
        !useResidentialFirst &&
        isScrapeDoRotationFailure(scrapeDoError)
      ) {
        try {
          return withPageProvider(
            await scrapeScrapeDoPage(url, {
              ...scrapeOptions,
              ...scrapeDoResidentialOptionsForUrl(url),
            }),
            "scrapedo"
          );
        } catch (residentialError) {
          finalScrapeDoError = residentialError;
        }
      }

      // Without Firecrawl context the Scrape.do error keeps its own type so
      // direct callers can still inspect it.
      if (!firecrawlError) throw finalScrapeDoError;
      const firecrawlMessage = toFirecrawlApiError(firecrawlError).message;
      const scrapeDoMessage =
        finalScrapeDoError instanceof Error
          ? finalScrapeDoError.message
          : String(finalScrapeDoError);
      throw new Error(
        `All scrape providers failed. Firecrawl: ${firecrawlMessage} / Scrape.do: ${scrapeDoMessage}`
      );
    }
  }

  if (firecrawlError) {
    const firecrawlMessage = toFirecrawlApiError(firecrawlError).message;
    throw new Error(
      `Firecrawl failed and no fallback scraper is configured (set SCRAPEDO_API_KEY). Firecrawl: ${firecrawlMessage}`
    );
  }
  throw new Error("No page scraping provider is configured.");
}

/**
 * Search chain for discovery flows: Tavily -> Firecrawl -> Scrape.do Google.
 * A successful response, including an empty result set, short-circuits the
 * chain so one user action cannot silently spend credits at every provider.
 */
export async function searchWebWithFallback(
  options: SearchWebWithFallbackOptions
): Promise<ProviderWebSearchResponse> {
  const query = options.query.trim();
  if (query.length < 3) throw new Error("Search query is too short.");

  const input = {
    query,
    limit: options.limit,
    includeDomains: options.includeDomains,
    tbs: options.tbs,
    topic: options.topic,
  };
  let lastError: unknown = null;

  if (options.useTavily !== false && getTavilyConfigSnapshot().configured) {
    try {
      return { ...(await searchTavilyWeb(input)), provider: "tavily" };
    } catch (error) {
      lastError = error;
    }
  }

  if (!options.skipFirecrawl && getFirecrawlConfigSnapshot().configured) {
    try {
      return { ...(await searchFirecrawlWeb(input)), provider: "firecrawl" };
    } catch (error) {
      if (!isRecoverableFirecrawlFailure(error)) throw error;
      lastError = error;
    }
  }

  if (getScrapeDoConfigSnapshot().configured) {
    return { ...(await searchScrapeDoWeb(input)), provider: "scrapedo" };
  }

  if (lastError) throw lastError;
  throw new Error("No web search provider is configured.");
}

export function firecrawlCreditsUsed(
  result: ProviderPageScrapeResult | ProviderWebSearchResponse,
  fallback: number
): number {
  return result.provider === "firecrawl" ? result.creditsUsed ?? fallback : 0;
}
