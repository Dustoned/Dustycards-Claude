import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { compressedJsonResponse } from "@/lib/compressed-json-response";

describe("compressedJsonResponse", () => {
  it("compresses large JSON when the client accepts gzip", async () => {
    const payload = { cards: Array.from({ length: 100 }, () => ({ name: "Seismitoad" })) };
    const request = new Request("http://localhost/api/feed", {
      headers: { "Accept-Encoding": "br, gzip" },
    });

    const response = await compressedJsonResponse(request, payload, {
      headers: { "Cache-Control": "private, no-store" },
    });
    const bytes = Buffer.from(await response.arrayBuffer());

    expect(response.headers.get("Content-Encoding")).toBe("gzip");
    expect(response.headers.get("Vary")).toContain("Accept-Encoding");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(JSON.parse(gunzipSync(bytes).toString("utf8"))).toEqual(payload);
  });

  it("keeps small responses uncompressed and respects q=0", async () => {
    const request = new Request("http://localhost/api/feed", {
      headers: { "Accept-Encoding": "gzip;q=0, br" },
    });
    const response = await compressedJsonResponse(request, { ready: true });

    expect(response.headers.get("Content-Encoding")).toBeNull();
    expect(await response.json()).toEqual({ ready: true });
  });
});
