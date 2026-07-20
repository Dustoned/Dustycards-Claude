import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  firecrawlConfig: vi.fn(),
  scrapeFirecrawl: vi.fn(),
  searchFirecrawl: vi.fn(),
  scrapeDoConfig: vi.fn(),
  scrapeScrapeDo: vi.fn(),
  searchScrapeDo: vi.fn(),
  tavilyConfig: vi.fn(),
  searchTavily: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/firecrawl", () => ({
  getFirecrawlConfigSnapshot: mocks.firecrawlConfig,
  scrapeFirecrawlPage: mocks.scrapeFirecrawl,
  searchFirecrawlWeb: mocks.searchFirecrawl,
  toFirecrawlApiError: (error: unknown) => ({
    message: error instanceof Error ? error.message : "Firecrawl failed.",
    status:
      typeof error === "object" && error && "status" in error
        ? Number((error as { status: unknown }).status)
        : 500,
  }),
}));
vi.mock("@/lib/scrapedo", () => ({
  getScrapeDoConfigSnapshot: mocks.scrapeDoConfig,
  scrapeScrapeDoPage: mocks.scrapeScrapeDo,
  searchScrapeDoWeb: mocks.searchScrapeDo,
}));
vi.mock("@/lib/tavily", () => ({
  getTavilyConfigSnapshot: mocks.tavilyConfig,
  searchTavilyWeb: mocks.searchTavily,
}));

import { scrapePageWithFallback, searchWebWithFallback } from "@/lib/scrape-provider";

const page = (sourceUrl: string) => ({
  title: "Example",
  sourceUrl,
  markdown: "Useful content",
  html: "<main>Useful content</main>",
  links: [],
  creditsUsed: 1,
  metadata: {},
});

const search = {
  results: [{ title: "Example", description: null, url: "https://example.com/" }],
  creditsUsed: 1,
  warning: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.firecrawlConfig.mockReturnValue({ configured: true });
  mocks.scrapeDoConfig.mockReturnValue({ configured: true });
  mocks.tavilyConfig.mockReturnValue({ configured: true });
  mocks.scrapeFirecrawl.mockResolvedValue(page("https://example.com/"));
  mocks.scrapeScrapeDo.mockResolvedValue(page("https://example.com/"));
  mocks.searchTavily.mockResolvedValue(search);
  mocks.searchFirecrawl.mockResolvedValue(search);
  mocks.searchScrapeDo.mockResolvedValue({ ...search, creditsUsed: 10 });
});

describe("scrape provider fallback", () => {
  it("short-circuits after a successful Firecrawl page scrape", async () => {
    const result = await scrapePageWithFallback("https://example.com/page");
    expect(result.provider).toBe("firecrawl");
    expect(mocks.scrapeScrapeDo).not.toHaveBeenCalled();
  });

  it("uses Scrape.do after a recoverable Firecrawl failure", async () => {
    mocks.scrapeFirecrawl.mockRejectedValue(Object.assign(new Error("quota reached"), { status: 429 }));
    const result = await scrapePageWithFallback("https://example.com/page");
    expect(result.provider).toBe("scrapedo");
    expect(mocks.scrapeScrapeDo).toHaveBeenCalledTimes(1);
  });

  it("can skip Firecrawl when its budget guard already rejected the call", async () => {
    const result = await scrapePageWithFallback("https://example.com/page", { skipFirecrawl: true });
    expect(result.provider).toBe("scrapedo");
    expect(mocks.scrapeFirecrawl).not.toHaveBeenCalled();
  });

  it("does not hide caller errors behind a fallback request", async () => {
    mocks.scrapeFirecrawl.mockRejectedValue(Object.assign(new Error("bad option"), { status: 400 }));
    await expect(scrapePageWithFallback("https://example.com/page")).rejects.toThrow("bad option");
    expect(mocks.scrapeScrapeDo).not.toHaveBeenCalled();
  });
});

describe("search provider fallback", () => {
  it("uses Tavily first and makes no paid fallback requests after success", async () => {
    const result = await searchWebWithFallback({ query: "Pokemon market news" });
    expect(result.provider).toBe("tavily");
    expect(mocks.searchFirecrawl).not.toHaveBeenCalled();
    expect(mocks.searchScrapeDo).not.toHaveBeenCalled();
  });

  it("falls through Tavily and Firecrawl failures to Scrape.do", async () => {
    mocks.searchTavily.mockRejectedValue(new Error("Tavily unavailable"));
    mocks.searchFirecrawl.mockRejectedValue(Object.assign(new Error("Firecrawl quota"), { status: 429 }));
    const result = await searchWebWithFallback({ query: "Pokemon market news" });
    expect(result.provider).toBe("scrapedo");
    expect(mocks.searchScrapeDo).toHaveBeenCalledTimes(1);
  });

  it("respects a caller-owned Firecrawl budget rejection", async () => {
    mocks.searchTavily.mockRejectedValue(new Error("Tavily unavailable"));
    const result = await searchWebWithFallback({
      query: "Pokemon market news",
      skipFirecrawl: true,
    });
    expect(result.provider).toBe("scrapedo");
    expect(mocks.searchFirecrawl).not.toHaveBeenCalled();
  });
});
