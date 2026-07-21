import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getScrapeDoConfigSnapshot,
  scrapeScrapeDoPage,
  ScrapeDoRequestError,
  searchScrapeDoWeb,
} from "@/lib/scrapedo";

const originalEnv = {
  apiKey: process.env.SCRAPEDO_API_KEY,
  apiUrl: process.env.SCRAPEDO_API_URL,
  budget: process.env.SCRAPEDO_MONTHLY_CREDIT_BUDGET,
  timeout: process.env.SCRAPEDO_TIMEOUT_MS,
};

function restore(name: string, value: string | undefined) {
  if (value == null) delete process.env[name];
  else process.env[name] = value;
}

afterEach(() => {
  vi.unstubAllGlobals();
  restore("SCRAPEDO_API_KEY", originalEnv.apiKey);
  restore("SCRAPEDO_API_URL", originalEnv.apiUrl);
  restore("SCRAPEDO_MONTHLY_CREDIT_BUDGET", originalEnv.budget);
  restore("SCRAPEDO_TIMEOUT_MS", originalEnv.timeout);
});

describe("Scrape.do provider adapter", () => {
  it("treats missing and placeholder credentials as unconfigured", () => {
    process.env.SCRAPEDO_API_KEY = "your-scrapedo-api-key";
    process.env.SCRAPEDO_MONTHLY_CREDIT_BUDGET = "2500";

    expect(getScrapeDoConfigSnapshot()).toMatchObject({
      configured: false,
      apiUrl: "https://api.scrape.do",
      monthlyCreditBudget: 2500,
      timeoutMs: 60_000,
    });
  });

  it("scrapes plain HTML once and derives Firecrawl-compatible content", async () => {
    process.env.SCRAPEDO_API_KEY = "sdo-test-secret";
    const html = `<!doctype html>
      <html><head>
        <title> Card &amp; market </title>
        <meta property="og:image" content="/card.png">
        <meta name="description" content="Collector page">
      </head><body>
        <script>secretNoise()</script>
        <h1>Market update</h1>
        <p>Price is &euro;42.</p>
        <a href="/deals">More deals</a>
      </body></html>`;
    const fetchMock = vi.fn(async () =>
      new Response(html, {
        status: 200,
        headers: {
          "content-type": "text/html; charset=utf-8",
          "Scrape.do-Request-Cost": "3",
          "Scrape.do-Remaining-Credits": "97",
          "Scrape.do-Resolved-Url": "https://example.com/final",
          "Scrape.do-Target-Url": "https://example.com/start",
          "Scrape.do-Initial-Status-Code": "301",
        },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await scrapeScrapeDoPage("https://example.com/start");

    expect(result).toMatchObject({
      title: "Card & market",
      sourceUrl: "https://example.com/final",
      html,
      links: ["https://example.com/deals"],
      creditsUsed: 3,
      metadata: {
        provider: "scrapedo",
        sourceURL: "https://example.com/final",
        requestCost: 3,
        remainingCredits: 97,
        resolvedUrl: "https://example.com/final",
        targetUrl: "https://example.com/start",
        initialStatusCode: 301,
        rendered: false,
        output: "html",
        description: "Collector page",
        ogImage: "https://example.com/card.png",
      },
    });
    expect(result.markdown).toContain("# Market update");
    expect(result.markdown).toContain("Price is €42.");
    expect(result.markdown).toContain("[More deals](https://example.com/deals)");
    expect(result.markdown).not.toContain("secretNoise");
    expect(JSON.stringify(result)).not.toContain("sdo-test-secret");

    const request = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(request[0].origin).toBe("https://api.scrape.do");
    expect(request[0].pathname).toBe("/");
    expect(request[0].searchParams.get("token")).toBe("sdo-test-secret");
    expect(request[0].searchParams.get("url")).toBe("https://example.com/start");
    expect(request[0].searchParams.has("render")).toBe(false);
    expect(request[0].searchParams.has("geoCode")).toBe(false);
    expect(request[0].searchParams.has("timeout")).toBe(false);
    expect(request[0].searchParams.has("output")).toBe(false);
  });

  it("only enables rendering and provider markdown when explicitly requested", async () => {
    process.env.SCRAPEDO_API_KEY = "sdo-test-secret";
    const fetchMock = vi.fn(async () =>
      new Response("# Rendered card\n\n[Source](https://example.com/source)", {
        status: 200,
        headers: {
          "content-type": "text/markdown",
          "Scrape.do-Request-Cost": "5",
        },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await scrapeScrapeDoPage("https://example.com/card", {
      output: "markdown",
      render: true,
      geoCode: "DE",
      providerTimeoutMs: 90_000,
      timeoutMs: 100_000,
    });

    expect(result).toMatchObject({
      title: "Rendered card",
      html: "",
      markdown: "# Rendered card\n\n[Source](https://example.com/source)",
      links: ["https://example.com/source"],
      creditsUsed: 5,
      metadata: { provider: "scrapedo", rendered: true, output: "markdown" },
    });
    const requestUrl = (fetchMock.mock.calls[0] as unknown as [URL])[0];
    expect(requestUrl.searchParams.get("render")).toBe("true");
    expect(requestUrl.searchParams.get("geoCode")).toBe("de");
    expect(requestUrl.searchParams.get("timeout")).toBe("90000");
    expect(requestUrl.searchParams.get("output")).toBe("markdown");
  });

  it("rejects non-public targets before spending a request", async () => {
    process.env.SCRAPEDO_API_KEY = "sdo-test-secret";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(scrapeScrapeDoPage("file:///etc/passwd")).rejects.toMatchObject({ status: 400 });
    await expect(scrapeScrapeDoPage("http://127.0.0.1/private")).rejects.toMatchObject({ status: 400 });
    await expect(scrapeScrapeDoPage("http://[::1]/private")).rejects.toMatchObject({ status: 400 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never leaks the API token through transport errors", async () => {
    process.env.SCRAPEDO_API_KEY = "do-not-leak-this-token";
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("request with do-not-leak-this-token failed");
    }));

    const error = await scrapeScrapeDoPage("https://example.com").catch((caught) => caught);
    expect(error).toBeInstanceOf(ScrapeDoRequestError);
    expect(error).toMatchObject({ status: 502, message: "Scrape.do request failed." });
    expect(String(error)).not.toContain("do-not-leak-this-token");
  });

  it("maps Google organic search, enforces domains, recency, limits and the 10-credit fallback", async () => {
    process.env.SCRAPEDO_API_KEY = "sdo-test-secret";
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          organic_results: [
            {
              title: " First result ",
              link: "https://news.example.com/card/reveal",
              snippet: " New chase revealed. ",
            },
            {
              title: "Wrong domain",
              link: "https://tracker.invalid/card",
              snippet: "Must be filtered",
            },
            {
              title: "Second result",
              link: "https://example.com/card/two",
              snippet: "Another result",
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await searchScrapeDoWeb({
      query: "Pokemon chase reveal",
      limit: 1,
      includeDomains: ["https://example.com/path"],
      tbs: "sbd:1,qdr:w",
    });

    expect(result).toEqual({
      results: [
        {
          title: "First result",
          description: "New chase revealed.",
          url: "https://news.example.com/card/reveal",
        },
      ],
      creditsUsed: 10,
      warning: null,
    });
    const requestUrl = (fetchMock.mock.calls[0] as unknown as [URL])[0];
    expect(requestUrl.pathname).toBe("/plugin/google/search");
    expect(requestUrl.searchParams.get("q")).toBe(
      "Pokemon chase reveal (site:example.com)"
    );
    expect(requestUrl.searchParams.get("safe")).toBe("active");
    expect(requestUrl.searchParams.get("time_period")).toBe("last_week");
  });

  it("uses the authoritative provider cost header for Google search", async () => {
    process.env.SCRAPEDO_API_KEY = "sdo-test-secret";
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify({ organic_results: [] }), {
        status: 200,
        headers: {
          "content-type": "application/json",
          "Scrape.do-Request-Cost": "12",
        },
      })
    ));

    await expect(searchScrapeDoWeb({ query: "Pokemon market" })).resolves.toMatchObject({
      creditsUsed: 12,
    });
  });

  it("aborts a request after the configured timeout", async () => {
    process.env.SCRAPEDO_API_KEY = "sdo-test-secret";
    vi.stubGlobal("fetch", vi.fn(async (_url: URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
      })
    ));

    await expect(
      scrapeScrapeDoPage("https://example.com/slow", { timeoutMs: 100 })
    ).rejects.toMatchObject({ status: 504, message: "Scrape.do request timed out." });
  });
});
