import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("service worker privacy", () => {
  it("never stores private page navigations in CacheStorage", async () => {
    const source = await readFile(path.join(process.cwd(), "public", "dustycards-sw.js"), "utf8");

    expect(source).not.toContain("dustycards-pages-");
    expect(source).not.toContain("pageNetworkFirst");
    expect(source).toContain("Never intercept or persist navigations");
  });
});
