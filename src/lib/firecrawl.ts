const DEFAULT_FIRECRAWL_API_URL = "https://api.firecrawl.dev/v2";
const DEFAULT_FIRECRAWL_MONTHLY_CREDITS = 1000;

export interface FirecrawlConfigSnapshot {
  configured: boolean;
  apiUrl: string;
  monthlyCreditBudget: number;
  creditGuide: Array<{
    feature: string;
    cost: string;
  }>;
}

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
    creditGuide: getFirecrawlCreditGuide(),
  };
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

export async function scrapeFirecrawlUrl(rawUrl: string): Promise<FirecrawlScrapeResult> {
  const url = normalizeHttpUrl(rawUrl);
  if (!url) {
    throw new FirecrawlRequestError("Use a valid http(s) URL.", 400);
  }

  const data = await postFirecrawl("/scrape", {
    url,
    formats: ["markdown"],
    onlyMainContent: true,
  });
  const container = isRecord(data) && isRecord(data.data) ? data.data : data;
  const metadata = isRecord(container) && isRecord(container.metadata) ? container.metadata : {};
  const markdown =
    isRecord(container) && typeof container.markdown === "string" ? container.markdown : "";
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
    markdownPreview: markdown.slice(0, 1800),
    markdownLength: markdown.length,
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
