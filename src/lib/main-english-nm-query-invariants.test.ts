import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function source(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

const USABLE_ENGLISH_NM_FILTER = [
  "cm_en_lowest_nm > 0",
  "cm_en_lowest_nm <> 9001",
];

function expectUsableEnglishNmFilter(sqlSource: string, alias: "p" | "p2") {
  for (const condition of USABLE_ENGLISH_NM_FILTER) {
    expect(sqlSource).toContain(`${alias}.${condition}`);
  }
}

describe("main English NM query invariants", () => {
  it("filters expansion daily history before choosing the latest row", () => {
    expectUsableEnglishNmFilter(source("src/lib/episode-set-prices.ts"), "p");
  });

  it("filters illustrator summary prices before choosing the latest row", () => {
    const contents = source("src/app/illustrators/page.tsx");
    expect(contents).toContain("lp.cm_en_lowest_nm AS market_price");
    expectUsableEnglishNmFilter(contents, "p2");
  });

  it("filters illustrator card and daily-history prices before ranking rows", () => {
    const contents = source("src/app/illustrators/[artist]/page.tsx");
    expect(contents).toContain("latest_cm AS");
    expect(contents).toContain("LEFT JOIN latest_cm cm");
    expectUsableEnglishNmFilter(contents, "p");
    for (const condition of USABLE_ENGLISH_NM_FILTER) {
      expect(contents.match(new RegExp(`p\\.${condition}`, "g"))).toHaveLength(2);
    }
  });
});
