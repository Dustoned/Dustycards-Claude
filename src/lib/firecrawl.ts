const DEFAULT_FIRECRAWL_API_URL = "https://api.firecrawl.dev/v2";
const DEFAULT_FIRECRAWL_MONTHLY_CREDITS = 1000;

export interface FirecrawlConfigSnapshot {
  configured: boolean;
  apiUrl: string;
  monthlyCreditBudget: number;
  monthlyCreditOffset: number;
  creditGuide: Array<{
    feature: string;
    cost: string;
  }>;
}

export interface FirecrawlProviderCreditUsage {
  remainingCredits: number;
  planCredits: number;
  billingPeriodStart: string | null;
  billingPeriodEnd: string | null;
}

let providerCreditCache:
  | { expiresAt: number; value: FirecrawlProviderCreditUsage | null }
  | null = null;

export interface FirecrawlDocsSearchResult {
  answer: string;
  citations: Array<{
    title: string;
    url: string;
  }>;
}

export interface FirecrawlScrapeResult {
  title: string | null;
  sourceUrl: string;
  markdownPreview: string;
  markdownLength: number;
}

export interface FirecrawlWebSearchResult {
  title: string | null;
  description: string | null;
  url: string;
}

export interface FirecrawlWebSearchResponse {
  results: FirecrawlWebSearchResult[];
  creditsUsed: number | null;
  warning: string | null;
}

export interface FirecrawlPageScrapeResult {
  title: string | null;
  sourceUrl: string;
  markdown: string;
  html: string;
  links: string[];
  creditsUsed: number | null;
  metadata: Record<string, unknown>;
}

class FirecrawlRequestError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "FirecrawlRequestError";
    this.status = status;
  }
}

function normalizeEnvValue(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === "your-firecrawl-api-key") return null;
  return trimmed;
}

function getFirecrawlApiKey(): string | null {
  return normalizeEnvValue(process.env.FIRECRAWL_API_KEY);
}

function getFirecrawlApiUrl(): string {
  return normalizeEnvValue(process.env.FIRECRAWL_API_URL) ?? DEFAULT_FIRECRAWL_API_URL;
}

function getFirecrawlMonthlyCreditBudget(): number {
  const parsed = Number(process.env.FIRECRAWL_MONTHLY_CREDIT_BUDGET);
  if (Number.isFinite(parsed) && parsed > 0) return Math.floor(parsed);
  return DEFAULT_FIRECRAWL_MONTHLY_CREDITS;
}

function getFirecrawlMonthlyCreditOffset(): number {
  const parsed = Number(process.env.FIRECRAWL_MONTHLY_CREDIT_OFFSET);
  if (Number.isFinite(parsed) && parsed > 0) return Math.floor(parsed);
  return 0;
}

function getFirecrawlCreditGuide(): FirecrawlConfigSnapshot["creditGuide"] {
  return [
    { feature: "Scrape", cost: "1 credit per page" },
    { feature: "Crawl", cost: "1 credit per page" },
    { feature: "Map", cost: "1 credit per page" },
    { feature: "Search", cost: "2 credits per 10 results" },
    { feature: "Interact", cost: "2 credits per browser minute" },
  ];
}

export function getFirecrawlConfigSnapshot(): FirecrawlConfigSnapshot {
  return {
    configured: Boolean(getFirecrawlApiKey()),
    apiUrl: getFirecrawlApiUrl(),
    monthlyCreditBudget: getFirecrawlMonthlyCreditBudget(),
    monthlyCreditOffset: getFirecrawlMonthlyCreditOffset(),
    creditGuide: getFirecrawlCreditGuide(),
  };
}

export interface FirecrawlPageScrapeOptions {
  onlyMainContent?: boolean;
  fastMode?: boolean;
  maxAge?: number;
}

export function parseFirecrawlProviderCreditUsage(
  value: unknown
): FirecrawlProviderCreditUsage | null {
  const container = isRecord(value) && isRecord(value.data) ? value.data : value;
  if (!isRecord(container)) return null;
  const remaining = Number(container.remainingCredits ?? container.remaining_credits);
  const plan = Number(container.planCredits ?? container.plan_credits);
  if (!Number.isFinite(remaining) || !Number.isFinite(plan) || plan <= 0) return null;
  const periodStart = container.billingPeriodStart ?? container.billing_period_start;
  const periodEnd = container.billingPeriodEnd ?? container.billing_period_end;
  return {
    remainingCredits: Math.max(0, Math.floor(remaining)),
    planCredits: Math.max(1, Math.floor(plan)),
    billingPeriodStart: typeof periodStart === "string" ? periodStart : null,
    billingPeriodEnd: typeof periodEnd === "string" ? periodEnd : null,
  };
}

/** Provider-authoritative balance; this endpoint does not consume credits. */
export async function getFirecrawlProviderCreditUsage(options?: {
  fresh?: boolean;
}): Promise<FirecrawlProviderCreditUsage | null> {
  const now = Date.now();
  if (!options?.fresh && providerCreditCache && providerCreditCache.expiresAt > now) {
    return providerCreditCache.value;
  }
  const apiKey = getFirecrawlApiKey();
  if (!apiKey) return null;
  try {
    const response = await fetch(`${getFirecrawlApiUrl()}/team/credit-usage`, {
      headers: { authorization: `Bearer ${apiKey}`, accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return null;
    const parsed = parseFirecrawlProviderCreditUsage(await response.json().catch(() => null));
    providerCreditCache = { expiresAt: now + 30_000, value: parsed };
    return parsed;
  } catch {
    providerCreditCache = { expiresAt: now + 10_000, value: null };
    return null;
  }
}

async function postFirecrawl(path: string, payload: Record<string, unknown>): Promise<unknown> {
  const apiKey = getFirecrawlApiKey();
  if (!apiKey) {
    throw new FirecrawlRequestError("Firecrawl API key is not configured.", 400);
  }

  const response = await fetch(`${getFirecrawlApiUrl()}${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
    cache: "no-store",
    // Firecrawl gets 60s of provider-side time; a hard local cap keeps a
    // hanging request from stalling the caller (and the reverse proxy) forever.
    signal: AbortSignal.timeout(75_000),
  });

  const data = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    throw new FirecrawlRequestError(extractFirecrawlMessage(data) ?? "Firecrawl request failed.", response.status);
  }

  if (isRecord(data) && data.success === false) {
    throw new FirecrawlRequestError(extractFirecrawlMessage(data) ?? "Firecrawl request failed.", response.status);
  }

  return data;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function extractFirecrawlMessage(value: unknown): string | null {
  if (!isRecord(value)) return null;

  for (const key of ["error", "message", "detail"]) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  const nested = value.data;
  if (isRecord(nested)) return extractFirecrawlMessage(nested);
  return null;
}

function normalizeCitation(value: unknown): FirecrawlDocsSearchResult["citations"][number] | null {
  if (!isRecord(value)) return null;
  const url = typeof value.url === "string" ? value.url : typeof value.sourceUrl === "string" ? value.sourceUrl : "";
  if (!url) return null;

  const title =
    typeof value.title === "string" && value.title.trim()
      ? value.title.trim()
      : typeof value.name === "string" && value.name.trim()
        ? value.name.trim()
        : url;

  return { title, url };
}

export async function searchFirecrawlDocs(question: string): Promise<FirecrawlDocsSearchResult> {
  const data = await postFirecrawl("/support/docs-search", { question });
  const container = isRecord(data) && isRecord(data.data) ? data.data : data;
  const answer =
    isRecord(container) && typeof container.answer === "string"
      ? container.answer
      : isRecord(data) && typeof data.answer === "string"
        ? data.answer
        : "";
  const rawCitations =
    isRecord(container) && Array.isArray(container.citations)
      ? container.citations
      : isRecord(data) && Array.isArray(data.citations)
        ? data.citations
        : [];

  return {
    answer: answer.trim() || "Firecrawl returned no text answer.",
    citations: rawCitations.map(normalizeCitation).filter((entry): entry is NonNullable<typeof entry> => Boolean(entry)),
  };
}

function normalizeHttpUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function getCreditsUsed(data: unknown): number | null {
  if (!isRecord(data)) return null;
  const value = data.creditsUsed;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeSearchResult(value: unknown): FirecrawlWebSearchResult | null {
  if (!isRecord(value)) return null;
  const rawUrl = typeof value.url === "string" ? value.url : "";
  const url = normalizeHttpUrl(rawUrl);
  if (!url) return null;

  const title = typeof value.title === "string" && value.title.trim() ? value.title.trim() : null;
  const description =
    typeof value.description === "string" && value.description.trim()
      ? value.description.trim()
      : null;

  return { title, description, url };
}

export async function searchFirecrawlWeb(input: {
  query: string;
  limit?: number;
  includeDomains?: string[];
  /** Firecrawl time filter, for example `sbd:1,qdr:w`. */
  tbs?: string;
}): Promise<FirecrawlWebSearchResponse> {
  const query = input.query.trim();
  if (query.length < 3) {
    throw new FirecrawlRequestError("Search query is too short.", 400);
  }

  const data = await postFirecrawl("/search", {
    query,
    limit: Math.min(Math.max(input.limit ?? 3, 1), 10),
    sources: ["web"],
    includeDomains: input.includeDomains?.filter(Boolean),
    tbs: input.tbs?.trim() || undefined,
    ignoreInvalidURLs: true,
    timeout: 60000,
  });
  const container = isRecord(data) && isRecord(data.data) ? data.data : data;
  const rawWebResults =
    isRecord(container) && Array.isArray(container.web)
      ? container.web
      : Array.isArray(container)
        ? container
        : [];
  const warning =
    isRecord(data) && typeof data.warning === "string" && data.warning.trim()
      ? data.warning.trim()
      : null;

  return {
    results: rawWebResults
      .map(normalizeSearchResult)
      .filter((entry): entry is FirecrawlWebSearchResult => Boolean(entry)),
    creditsUsed: getCreditsUsed(data),
    warning,
  };
}

export async function scrapeFirecrawlPage(
  rawUrl: string,
  options: FirecrawlPageScrapeOptions = {}
): Promise<FirecrawlPageScrapeResult> {
  const url = normalizeHttpUrl(rawUrl);
  if (!url) {
    throw new FirecrawlRequestError("Use a valid http(s) URL.", 400);
  }

  const data = await postFirecrawl("/scrape", {
    url,
    formats: ["markdown", "html", "links"],
    onlyMainContent: options.onlyMainContent ?? false,
    fastMode: options.fastMode,
    maxAge: options.maxAge,
    removeBase64Images: true,
    blockAds: true,
    timeout: 60000,
  });
  const container = isRecord(data) && isRecord(data.data) ? data.data : data;
  const metadata = isRecord(container) && isRecord(container.metadata) ? container.metadata : {};
  const markdown =
    isRecord(container) && typeof container.markdown === "string" ? container.markdown : "";
  const html = isRecord(container) && typeof container.html === "string" ? container.html : "";
  const rawLinks = isRecord(container) && Array.isArray(container.links) ? container.links : [];
  const title =
    isRecord(metadata) && typeof metadata.title === "string" && metadata.title.trim()
      ? metadata.title.trim()
      : null;
  const sourceUrl =
    isRecord(metadata) && typeof metadata.sourceURL === "string" && metadata.sourceURL.trim()
      ? metadata.sourceURL.trim()
      : url;

  return {
    title,
    sourceUrl,
    markdown,
    html,
    links: rawLinks.filter((link): link is string => typeof link === "string"),
    creditsUsed: getCreditsUsed(data),
    metadata,
  };
}

export async function scrapeFirecrawlUrl(rawUrl: string): Promise<FirecrawlScrapeResult> {
  const url = normalizeHttpUrl(rawUrl);
  if (!url) {
    throw new FirecrawlRequestError("Use a valid http(s) URL.", 400);
  }

  const result = await scrapeFirecrawlPage(url);

  return {
    title: result.title,
    sourceUrl: result.sourceUrl,
    markdownPreview: result.markdown.slice(0, 1800),
    markdownLength: result.markdown.length,
  };
}

export function toFirecrawlApiError(error: unknown): { message: string; status: number } {
  if (error instanceof FirecrawlRequestError) {
    return { message: error.message, status: error.status };
  }

  if (error instanceof Error) {
    return { message: error.message, status: 500 };
  }

  return { message: "Firecrawl request failed.", status: 500 };
}
