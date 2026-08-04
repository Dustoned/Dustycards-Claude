import {
  collectFirecrawlApiKeys,
  rotateFirecrawlApiKeys,
} from "@/lib/firecrawl-key-pool";

const DEFAULT_FIRECRAWL_API_URL = "https://api.firecrawl.dev/v2";
const DEFAULT_FIRECRAWL_MONTHLY_CREDITS = 1000;
const FIRECRAWL_KEY_FAILOVER_STATUSES = new Set([401, 402, 403, 429]);

export interface FirecrawlConfigSnapshot {
  configured: boolean;
  apiKeyCount: number;
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
let nextFirecrawlKeyIndex = 0;
const firecrawlKeyCooldowns = new Map<string, number>();

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
  changeTracking?: FirecrawlChangeTrackingResult | null;
}

export interface FirecrawlChangeTrackingResult {
  previousScrapeAt: string | null;
  changeStatus: "new" | "same" | "changed" | "removed";
  visibility: "visible" | "hidden" | null;
  diff: Record<string, unknown> | null;
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

function getFirecrawlApiKeys(): string[] {
  return collectFirecrawlApiKeys({
    primary: process.env.FIRECRAWL_API_KEY,
    secondary: process.env.FIRECRAWL_API_KEY_SECOND,
    pool: process.env.FIRECRAWL_API_KEYS,
  });
}

function getFirecrawlKeyAttempts(): string[] {
  const keys = getFirecrawlApiKeys();
  const now = Date.now();
  const available = keys.filter((key) => (firecrawlKeyCooldowns.get(key) ?? 0) <= now);
  const attempts = rotateFirecrawlApiKeys(available.length > 0 ? available : keys, nextFirecrawlKeyIndex);
  if (keys.length > 0) nextFirecrawlKeyIndex = (nextFirecrawlKeyIndex + 1) % keys.length;
  return attempts;
}

function coolDownFirecrawlKey(apiKey: string, response: Response): void {
  const retryAfter = Number(response.headers.get("retry-after"));
  const delayMs = response.status === 429 && Number.isFinite(retryAfter) && retryAfter > 0
    ? retryAfter * 1_000
    : response.status === 402
      ? 10 * 60_000
      : 5 * 60_000;
  firecrawlKeyCooldowns.set(apiKey, Date.now() + delayMs);
}

function getFirecrawlApiUrl(): string {
  return normalizeEnvValue(process.env.FIRECRAWL_API_URL) ?? DEFAULT_FIRECRAWL_API_URL;
}

function getFirecrawlMonthlyCreditBudget(): number {
  const parsed = Number(process.env.FIRECRAWL_MONTHLY_CREDIT_BUDGET);
  if (Number.isFinite(parsed) && parsed > 0) return Math.floor(parsed);
  return DEFAULT_FIRECRAWL_MONTHLY_CREDITS * Math.max(1, getFirecrawlApiKeys().length);
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
  const apiKeyCount = getFirecrawlApiKeys().length;
  return {
    configured: apiKeyCount > 0,
    apiKeyCount,
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
  /** Store and compare a persistent Firecrawl snapshot for this URL. */
  changeTracking?: {
    tag?: string;
    includeGitDiff?: boolean;
  };
}

function parseFirecrawlChangeTracking(value: unknown): FirecrawlChangeTrackingResult | null {
  if (!isRecord(value)) return null;
  const changeStatus = value.changeStatus;
  if (!["new", "same", "changed", "removed"].includes(String(changeStatus))) return null;
  const visibility = value.visibility;
  return {
    previousScrapeAt:
      typeof value.previousScrapeAt === "string" ? value.previousScrapeAt : null,
    changeStatus: changeStatus as FirecrawlChangeTrackingResult["changeStatus"],
    visibility:
      visibility === "visible" || visibility === "hidden" ? visibility : null,
    diff: isRecord(value.diff) ? value.diff : null,
  };
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
  const apiKeys = getFirecrawlApiKeys();
  if (apiKeys.length === 0) return null;
  try {
    const balances = (await Promise.all(apiKeys.map(async (apiKey) => {
      const response = await fetch(`${getFirecrawlApiUrl()}/team/credit-usage`, {
        headers: { authorization: `Bearer ${apiKey}`, accept: "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok) return null;
      return parseFirecrawlProviderCreditUsage(await response.json().catch(() => null));
    }))).filter((value): value is FirecrawlProviderCreditUsage => Boolean(value));
    const parsed = balances.length > 0
      ? {
          remainingCredits: balances.reduce((sum, balance) => sum + balance.remainingCredits, 0),
          planCredits: balances.reduce((sum, balance) => sum + balance.planCredits, 0),
          billingPeriodStart: balances.map((balance) => balance.billingPeriodStart).filter((value): value is string => Boolean(value)).sort()[0] ?? null,
          billingPeriodEnd: balances.map((balance) => balance.billingPeriodEnd).filter((value): value is string => Boolean(value)).sort().at(-1) ?? null,
        } satisfies FirecrawlProviderCreditUsage
      : null;
    providerCreditCache = { expiresAt: now + 30_000, value: parsed };
    return parsed;
  } catch {
    providerCreditCache = { expiresAt: now + 10_000, value: null };
    return null;
  }
}

async function postFirecrawl(path: string, payload: Record<string, unknown>): Promise<unknown> {
  const apiKeys = getFirecrawlKeyAttempts();
  if (apiKeys.length === 0) {
    throw new FirecrawlRequestError("Firecrawl API key is not configured.", 400);
  }

  let lastError: FirecrawlRequestError | null = null;
  for (const [index, apiKey] of apiKeys.entries()) {
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
    if (!response.ok || (isRecord(data) && data.success === false)) {
      const error = new FirecrawlRequestError(
        extractFirecrawlMessage(data) ?? "Firecrawl request failed.",
        response.status
      );
      lastError = error;
      const hasFallback = index < apiKeys.length - 1;
      if (FIRECRAWL_KEY_FAILOVER_STATUSES.has(response.status)) {
        coolDownFirecrawlKey(apiKey, response);
        if (hasFallback) continue;
      }
      throw error;
    }

    firecrawlKeyCooldowns.delete(apiKey);
    providerCreditCache = null;
    return data;
  }

  throw lastError ?? new FirecrawlRequestError("Firecrawl request failed.", 500);
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

  const formats: Array<string | Record<string, unknown>> = ["markdown", "html", "links"];
  if (options.changeTracking) {
    formats.push({
      type: "changeTracking",
      ...(options.changeTracking.includeGitDiff === false ? {} : { modes: ["git-diff"] }),
      ...(options.changeTracking.tag?.trim()
        ? { tag: options.changeTracking.tag.trim().slice(0, 100) }
        : {}),
    });
  }

  const data = await postFirecrawl("/scrape", {
    url,
    formats,
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
    changeTracking: isRecord(container)
      ? parseFirecrawlChangeTracking(container.changeTracking)
      : null,
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
