import type {
  FirecrawlPageScrapeResult,
  FirecrawlWebSearchResponse,
  FirecrawlWebSearchResult,
} from "@/lib/firecrawl";

const DEFAULT_SCRAPEDO_API_URL = "https://api.scrape.do";
const DEFAULT_SCRAPEDO_TIMEOUT_MS = 60_000;
const DEFAULT_SCRAPEDO_MONTHLY_CREDITS = 1_000;
const GOOGLE_SEARCH_FALLBACK_CREDITS = 10;

export interface ScrapeDoConfigSnapshot {
  configured: boolean;
  apiUrl: string;
  monthlyCreditBudget: number;
  timeoutMs: number;
}

export interface ScrapeDoPageScrapeOptions {
  /** Firecrawl-compatible hint; Scrape.do returns the complete page. */
  onlyMainContent?: boolean;
  /** Firecrawl-compatible hint; plain Scrape.do requests are already the fast path. */
  fastMode?: boolean;
  /** Firecrawl-compatible cache hint; Scrape.do does not expose an equivalent parameter. */
  maxAge?: number;
  /** Plain HTML is the default so one request can provide both HTML and derived markdown. */
  output?: "html" | "markdown";
  /** Explicit opt-in: Scrape.do charges more when Chromium rendering is enabled. */
  render?: boolean;
  timeoutMs?: number;
}

export interface ScrapeDoWebSearchOptions {
  query: string;
  limit?: number;
  includeDomains?: string[];
  /** Firecrawl-compatible recency hint, for example `sbd:1,qdr:w`. */
  tbs?: string;
  timeoutMs?: number;
}

export class ScrapeDoRequestError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ScrapeDoRequestError";
    this.status = status;
  }
}

function normalizeEnvValue(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === "your-scrapedo-api-key") return null;
  return trimmed;
}

function getScrapeDoApiKey(): string | null {
  return normalizeEnvValue(process.env.SCRAPEDO_API_KEY);
}

function getPositiveInteger(
  value: string | number | undefined,
  fallback: number,
  minimum: number,
  maximum: number
): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < minimum) return fallback;
  return Math.min(maximum, Math.floor(parsed));
}

function getScrapeDoApiUrl(): string {
  const configured = normalizeEnvValue(process.env.SCRAPEDO_API_URL);
  if (!configured) return DEFAULT_SCRAPEDO_API_URL;

  try {
    const parsed = new URL(configured);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return DEFAULT_SCRAPEDO_API_URL;
    }
    parsed.username = "";
    parsed.password = "";
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return DEFAULT_SCRAPEDO_API_URL;
  }
}

function getScrapeDoTimeoutMs(value?: number): number {
  return getPositiveInteger(
    value ?? process.env.SCRAPEDO_TIMEOUT_MS,
    DEFAULT_SCRAPEDO_TIMEOUT_MS,
    100,
    120_000
  );
}

function getScrapeDoMonthlyCreditBudget(): number {
  return getPositiveInteger(
    process.env.SCRAPEDO_MONTHLY_CREDIT_BUDGET,
    DEFAULT_SCRAPEDO_MONTHLY_CREDITS,
    1,
    100_000_000
  );
}

export function getScrapeDoConfigSnapshot(): ScrapeDoConfigSnapshot {
  return {
    configured: Boolean(getScrapeDoApiKey()),
    apiUrl: getScrapeDoApiUrl(),
    monthlyCreditBudget: getScrapeDoMonthlyCreditBudget(),
    timeoutMs: getScrapeDoTimeoutMs(),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeHostname(value: string): string {
  return value.trim().toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
}

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split(".");
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part))) return false;
  const octets = parts.map(Number);
  if (octets.some((octet) => octet < 0 || octet > 255)) return false;
  const [first, second] = octets;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19)) ||
    first >= 224
  );
}

function isPrivateHostname(hostname: string): boolean {
  const normalized = normalizeHostname(hostname);
  if (!normalized) return true;
  if (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local") ||
    normalized.endsWith(".internal")
  ) {
    return true;
  }
  if (isPrivateIpv4(normalized)) return true;
  if (!normalized.includes(":")) return false;
  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    /^fe[89ab]/.test(normalized)
  );
}

function normalizePublicHttpUrl(value: unknown, baseUrl?: string): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = baseUrl ? new URL(value.trim(), baseUrl) : new URL(value.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (url.username || url.password || isPrivateHostname(url.hostname)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function parseHeaderNumber(headers: Headers, name: string): number | null {
  const raw = headers.get(name)?.trim();
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function parseHeaderStatus(headers: Headers, name: string): number | null {
  const parsed = Number(headers.get(name));
  return Number.isInteger(parsed) && parsed >= 100 && parsed <= 599 ? parsed : null;
}

function decodeHtmlEntities(value: string): string {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    euro: "€",
    gt: ">",
    hellip: "…",
    lt: "<",
    mdash: "—",
    nbsp: " ",
    ndash: "–",
    quot: '"',
  };

  return value.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (entity, key: string) => {
    const normalized = key.toLowerCase();
    if (normalized.startsWith("#x")) {
      const codePoint = Number.parseInt(normalized.slice(2), 16);
      try {
        return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : entity;
      } catch {
        return entity;
      }
    }
    if (normalized.startsWith("#")) {
      const codePoint = Number.parseInt(normalized.slice(1), 10);
      try {
        return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : entity;
      } catch {
        return entity;
      }
    }
    return named[normalized] ?? entity;
  });
}

function stripTags(value: string): string {
  return decodeHtmlEntities(value.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

function parseHtmlAttributes(tag: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const pattern = /([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
  for (const match of tag.matchAll(pattern)) {
    const name = match[1]?.toLowerCase();
    if (!name) continue;
    attributes[name] = decodeHtmlEntities(match[2] ?? match[3] ?? match[4] ?? "");
  }
  return attributes;
}

function extractHtmlMetadata(html: string, sourceUrl: string): Record<string, unknown> {
  const values = new Map<string, string>();
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const attributes = parseHtmlAttributes(tag);
    const key = (attributes.property || attributes.name || "").toLowerCase();
    const content = attributes.content?.trim();
    if (key && content && !values.has(key)) values.set(key, content);
  }

  const titleMatch = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? stripTags(titleMatch[1]) : values.get("og:title") ?? null;
  const rawImage = values.get("og:image") ?? values.get("twitter:image") ?? null;
  const image = rawImage ? normalizePublicHttpUrl(rawImage, sourceUrl) : null;

  return {
    sourceURL: sourceUrl,
    ...(title ? { title } : {}),
    ...(values.get("description") ? { description: values.get("description") } : {}),
    ...(values.get("og:description") ? { ogDescription: values.get("og:description") } : {}),
    ...(image ? { image, ogImage: image } : {}),
  };
}

function extractHtmlLinks(html: string, sourceUrl: string): string[] {
  const links = new Set<string>();
  for (const tag of html.match(/<a\b[^>]*>/gi) ?? []) {
    const rawHref = parseHtmlAttributes(tag).href;
    const href = normalizePublicHttpUrl(rawHref, sourceUrl);
    if (href) links.add(href);
  }
  return [...links];
}

function extractMarkdownLinks(markdown: string): string[] {
  const links = new Set<string>();
  for (const match of markdown.matchAll(/\[[^\]]*]\((https?:\/\/[^\s)]+)(?:\s+"[^"]*")?\)/gi)) {
    const url = normalizePublicHttpUrl(match[1]);
    if (url) links.add(url);
  }
  return [...links];
}

function htmlToMarkdown(html: string, sourceUrl: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/<(script|style|noscript|svg|template)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
      .replace(/<img\b[^>]*>/gi, (tag) => {
        const attributes = parseHtmlAttributes(tag);
        const src = normalizePublicHttpUrl(attributes.src, sourceUrl);
        return src ? `\n![${attributes.alt ?? ""}](${src})\n` : "";
      })
      .replace(/<a\b[^>]*>([\s\S]*?)<\/a>/gi, (tag, content: string) => {
        const href = normalizePublicHttpUrl(parseHtmlAttributes(tag).href, sourceUrl);
        const label = stripTags(content);
        return href && label ? `[${label}](${href})` : label;
      })
      .replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi, (_tag, level: string, content: string) => {
        const label = stripTags(content);
        return label ? `\n${"#".repeat(Number(level))} ${label}\n` : "";
      })
      .replace(/<li\b[^>]*>/gi, "\n- ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(?:p|div|section|article|header|footer|main|aside|nav|li|ul|ol|table|tr|blockquote)>/gi, "\n")
      .replace(/<[^>]*>/g, " ")
  )
    .replace(/[\t\f\v ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function fetchScrapeDo(
  endpoint: URL,
  timeoutMs: number,
  accept: string
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(endpoint, {
      method: "GET",
      headers: { accept },
      cache: "no-store",
      signal: controller.signal,
    });
  } catch {
    if (controller.signal.aborted) {
      throw new ScrapeDoRequestError("Scrape.do request timed out.", 504);
    }
    throw new ScrapeDoRequestError("Scrape.do request failed.", 502);
  } finally {
    clearTimeout(timeout);
  }
}

function requireApiKey(): string {
  const token = getScrapeDoApiKey();
  if (!token) throw new ScrapeDoRequestError("Scrape.do API key is not configured.", 400);
  return token;
}

function buildEndpoint(path: string): URL {
  return new URL(path, `${getScrapeDoApiUrl()}/`);
}

function responseMetadata(
  response: Response,
  input: { sourceUrl: string; render: boolean; output: "html" | "markdown" }
): Record<string, unknown> {
  return {
    provider: "scrapedo",
    sourceURL: input.sourceUrl,
    requestCost: parseHeaderNumber(response.headers, "Scrape.do-Request-Cost"),
    remainingCredits: parseHeaderNumber(response.headers, "Scrape.do-Remaining-Credits"),
    resolvedUrl: input.sourceUrl,
    targetUrl: response.headers.get("Scrape.do-Target-Url"),
    initialStatusCode: parseHeaderStatus(response.headers, "Scrape.do-Initial-Status-Code"),
    contentType: response.headers.get("content-type"),
    rendered: input.render,
    output: input.output,
  };
}

export async function scrapeScrapeDoPage(
  rawUrl: string,
  options: ScrapeDoPageScrapeOptions = {}
): Promise<FirecrawlPageScrapeResult> {
  const targetUrl = normalizePublicHttpUrl(rawUrl);
  if (!targetUrl) {
    throw new ScrapeDoRequestError("Use a valid public http(s) URL.", 400);
  }

  const output = options.output ?? "html";
  const render = options.render === true;
  const endpoint = buildEndpoint("/");
  endpoint.searchParams.set("token", requireApiKey());
  endpoint.searchParams.set("url", targetUrl);
  if (render) endpoint.searchParams.set("render", "true");
  if (output === "markdown") endpoint.searchParams.set("output", "markdown");

  const response = await fetchScrapeDo(
    endpoint,
    getScrapeDoTimeoutMs(options.timeoutMs),
    output === "markdown" ? "text/markdown, text/plain;q=0.9" : "text/html, application/xhtml+xml;q=0.9"
  );
  const body = await response.text().catch(() => "");
  if (!response.ok) {
    throw new ScrapeDoRequestError(`Scrape.do scrape failed with status ${response.status}.`, response.status);
  }

  const resolvedUrl =
    normalizePublicHttpUrl(response.headers.get("Scrape.do-Resolved-Url")) ?? targetUrl;
  const html = output === "html" ? body : "";
  const markdown = output === "markdown" ? body : htmlToMarkdown(body, resolvedUrl);
  const extractedMetadata = output === "html" ? extractHtmlMetadata(body, resolvedUrl) : {};
  const titleFromMarkdown = markdown.match(/^#\s+(.+)$/m)?.[1]?.trim() || null;
  const title =
    typeof extractedMetadata.title === "string" && extractedMetadata.title.trim()
      ? extractedMetadata.title.trim()
      : titleFromMarkdown;
  const providerMetadata = responseMetadata(response, {
    sourceUrl: resolvedUrl,
    render,
    output,
  });
  const creditsUsed = parseHeaderNumber(response.headers, "Scrape.do-Request-Cost");

  return {
    title,
    sourceUrl: resolvedUrl,
    markdown,
    html,
    links: output === "html" ? extractHtmlLinks(body, resolvedUrl) : extractMarkdownLinks(body),
    creditsUsed,
    metadata: { ...extractedMetadata, ...providerMetadata },
  };
}

function normalizeDomain(value: string): string | null {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
    const hostname = normalizeHostname(parsed.hostname).replace(/^www\./, "");
    return hostname && !isPrivateHostname(hostname) ? hostname : null;
  } catch {
    return null;
  }
}

function hostnameMatchesDomain(url: string, domain: string): boolean {
  try {
    const hostname = normalizeHostname(new URL(url).hostname).replace(/^www\./, "");
    return hostname === domain || hostname.endsWith(`.${domain}`);
  } catch {
    return false;
  }
}

function searchTimePeriod(
  tbs: string | undefined
): "last_hour" | "last_day" | "last_week" | "last_month" | "last_year" | null {
  if (!tbs) return null;
  if (/qdr:h/.test(tbs)) return "last_hour";
  if (/qdr:d/.test(tbs)) return "last_day";
  if (/qdr:w/.test(tbs)) return "last_week";
  if (/qdr:m/.test(tbs)) return "last_month";
  if (/qdr:y/.test(tbs)) return "last_year";
  return null;
}

function normalizeGoogleSearchResult(value: unknown): FirecrawlWebSearchResult | null {
  if (!isRecord(value)) return null;
  const url = normalizePublicHttpUrl(
    typeof value.link === "string" ? value.link : typeof value.url === "string" ? value.url : ""
  );
  if (!url) return null;
  const title = typeof value.title === "string" && value.title.trim() ? value.title.trim() : null;
  const description =
    typeof value.snippet === "string" && value.snippet.trim()
      ? value.snippet.trim()
      : typeof value.description === "string" && value.description.trim()
        ? value.description.trim()
        : null;
  return { title, description, url };
}

export async function searchScrapeDoWeb(
  options: ScrapeDoWebSearchOptions
): Promise<FirecrawlWebSearchResponse> {
  const query = options.query.trim();
  if (query.length < 3) {
    throw new ScrapeDoRequestError("Search query is too short.", 400);
  }

  const limit = Math.min(Math.max(Math.floor(options.limit ?? 3), 1), 10);
  const domains = [...new Set((options.includeDomains ?? []).flatMap((value) => {
    const domain = normalizeDomain(value);
    return domain ? [domain] : [];
  }))].slice(0, 10);
  const scopedQuery = domains.length > 0
    ? `${query} (${domains.map((domain) => `site:${domain}`).join(" OR ")})`
    : query;

  const endpoint = buildEndpoint("/plugin/google/search");
  endpoint.searchParams.set("token", requireApiKey());
  endpoint.searchParams.set("q", scopedQuery);
  endpoint.searchParams.set("safe", "active");
  const timePeriod = searchTimePeriod(options.tbs);
  if (timePeriod) endpoint.searchParams.set("time_period", timePeriod);

  const response = await fetchScrapeDo(
    endpoint,
    getScrapeDoTimeoutMs(options.timeoutMs),
    "application/json"
  );
  const data = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    throw new ScrapeDoRequestError(`Scrape.do search failed with status ${response.status}.`, response.status);
  }

  const rawResults = isRecord(data) && Array.isArray(data.organic_results)
    ? data.organic_results
    : [];
  const results = rawResults
    .map(normalizeGoogleSearchResult)
    .filter((entry): entry is FirecrawlWebSearchResult => Boolean(entry))
    .filter((entry) => domains.length === 0 || domains.some((domain) => hostnameMatchesDomain(entry.url, domain)))
    .slice(0, limit);

  return {
    results,
    creditsUsed:
      parseHeaderNumber(response.headers, "Scrape.do-Request-Cost") ?? GOOGLE_SEARCH_FALLBACK_CREDITS,
    warning: null,
  };
}

export function toScrapeDoApiError(error: unknown): { message: string; status: number } {
  if (error instanceof ScrapeDoRequestError) {
    return { message: error.message, status: error.status };
  }
  return { message: "Scrape.do request failed.", status: 500 };
}
