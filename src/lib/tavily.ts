import type { FirecrawlWebSearchResponse } from "@/lib/firecrawl";

const DEFAULT_TAVILY_API_URL = "https://api.tavily.com";

export interface TavilyConfigSnapshot {
  configured: boolean;
  apiUrl: string;
}

export interface TavilyWebSearchOptions {
  query: string;
  limit?: number;
  includeDomains?: string[];
  /** Firecrawl-compatible recency hint used by the catalyst discovery layer. */
  tbs?: string;
  topic?: "news" | "general";
}

class TavilyRequestError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "TavilyRequestError";
    this.status = status;
  }
}

function normalizeEnvValue(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === "your-tavily-api-key") return null;
  return trimmed;
}

function getTavilyApiKey(): string | null {
  return normalizeEnvValue(process.env.TAVILY_API_KEY);
}

function getTavilyApiUrl(): string {
  return normalizeEnvValue(process.env.TAVILY_API_URL) ?? DEFAULT_TAVILY_API_URL;
}

export function getTavilyConfigSnapshot(): TavilyConfigSnapshot {
  return {
    configured: Boolean(getTavilyApiKey()),
    apiUrl: getTavilyApiUrl(),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function extractMessage(value: unknown): string | null {
  if (!isRecord(value)) return null;
  for (const key of ["error", "message", "detail"]) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return null;
}

function normalizeUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function tavilyTimeRange(tbs: string | undefined): "day" | "week" | "month" | "year" | null {
  if (!tbs) return null;
  if (/qdr:h|qdr:d/.test(tbs)) return "day";
  if (/qdr:w/.test(tbs)) return "week";
  if (/qdr:m/.test(tbs)) return "month";
  if (/qdr:y/.test(tbs)) return "year";
  return null;
}

/**
 * Bounded Tavily search adapter for Signal Radar discovery. Full article
 * extraction intentionally remains with Firecrawl so each provider has one job.
 */
export async function searchTavilyWeb(
  options: TavilyWebSearchOptions
): Promise<FirecrawlWebSearchResponse> {
  const apiKey = getTavilyApiKey();
  if (!apiKey) throw new TavilyRequestError("Tavily API key is not configured.", 400);

  const response = await fetch(`${getTavilyApiUrl()}/search`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      query: options.query.trim(),
      search_depth: "basic",
      topic: options.topic ?? "news",
      max_results: Math.max(1, Math.min(10, Math.floor(options.limit ?? 5))),
      time_range: tavilyTimeRange(options.tbs),
      include_domains: options.includeDomains ?? [],
      include_answer: false,
      include_raw_content: false,
      include_images: false,
      include_usage: true,
      safe_search: true,
    }),
    cache: "no-store",
  });

  const data = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    throw new TavilyRequestError(extractMessage(data) ?? "Tavily search failed.", response.status);
  }

  const results = isRecord(data) && Array.isArray(data.results) ? data.results : [];
  const usage = isRecord(data) && isRecord(data.usage) ? data.usage : null;
  const credits = Number(usage?.credits);

  return {
    results: results.flatMap((entry) => {
      if (!isRecord(entry)) return [];
      const url = normalizeUrl(entry.url);
      if (!url) return [];
      return [{
        title: typeof entry.title === "string" ? entry.title.trim() || null : null,
        description: typeof entry.content === "string" ? entry.content.trim() || null : null,
        url,
      }];
    }),
    creditsUsed: Number.isFinite(credits) ? Math.max(0, Math.ceil(credits)) : 1,
    warning: null,
  };
}
