import { afterEach, describe, expect, it, vi } from "vitest";
import { scrapeFirecrawlPage } from "@/lib/firecrawl";

describe("Firecrawl change tracking", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.FIRECRAWL_API_KEY;
    delete process.env.FIRECRAWL_API_KEY_SECOND;
    delete process.env.FIRECRAWL_API_KEYS;
  });

  it("requests a tagged git diff and exposes the monitoring result", async () => {
    process.env.FIRECRAWL_API_KEY = "fc-test";
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { formats: unknown[] };
      expect(body.formats).toEqual([
        "markdown",
        "html",
        "links",
        {
          type: "changeTracking",
          modes: ["git-diff"],
          tag: "dustycards-upcoming-v1",
        },
      ]);
      return new Response(JSON.stringify({
        success: true,
        data: {
          markdown: "# New reveal",
          html: "<h1>New reveal</h1>",
          links: [],
          metadata: { sourceURL: "https://example.com/reveals" },
          changeTracking: {
            previousScrapeAt: "2026-08-03T10:00:00.000Z",
            changeStatus: "changed",
            visibility: "visible",
            diff: { text: "+New reveal" },
          },
        },
      }), { status: 200, headers: { "content-type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await scrapeFirecrawlPage("https://example.com/reveals", {
      changeTracking: {
        tag: "dustycards-upcoming-v1",
        includeGitDiff: true,
      },
    });

    expect(result.changeTracking).toEqual(expect.objectContaining({
      changeStatus: "changed",
      visibility: "visible",
    }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
