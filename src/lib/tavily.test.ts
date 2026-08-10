import { afterEach, describe, expect, it, vi } from "vitest";

import { getTavilyConfigSnapshot, searchTavilyWeb } from "@/lib/tavily";

const originalKey = process.env.TAVILY_API_KEY;

afterEach(() => {
  vi.unstubAllGlobals();
  if (originalKey == null) delete process.env.TAVILY_API_KEY;
  else process.env.TAVILY_API_KEY = originalKey;
});

describe("Tavily search adapter", () => {
  it("stays disabled for a missing or placeholder key", () => {
    process.env.TAVILY_API_KEY = "your-tavily-api-key";
    expect(getTavilyConfigSnapshot().configured).toBe(false);
  });

  it("uses a bounded basic news search and normalizes results", async () => {
    process.env.TAVILY_API_KEY = "tvly-test-key";
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          results: [
            {
              title: "  New set reveal  ",
              url: "https://www.pokebeach.com/news/new-set",
              content: "  A new chase card was revealed.  ",
            },
          ],
          usage: { credits: 1 },
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await searchTavilyWeb({
      query: "Pokemon TCG reveal",
      limit: 5,
      includeDomains: ["pokebeach.com"],
      tbs: "sbd:1,qdr:m",
    });

    expect(response).toEqual({
      results: [
        {
          title: "New set reveal",
          description: "A new chase card was revealed.",
          url: "https://www.pokebeach.com/news/new-set",
        },
      ],
      creditsUsed: 1,
      warning: null,
    });
    const request = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(request[0]).toBe("https://api.tavily.com/search");
    const init = request[1];
    expect(init.headers).toMatchObject({ authorization: "Bearer tvly-test-key" });
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({
      search_depth: "basic",
      topic: "news",
      max_results: 5,
      time_range: "month",
      include_domains: ["pokebeach.com"],
      include_raw_content: false,
      include_usage: true,
    });
    expect(body).not.toHaveProperty("safe_search");
  });
});
