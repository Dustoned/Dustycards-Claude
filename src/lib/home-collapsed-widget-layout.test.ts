import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("collapsed Home widget layout", () => {
  it("does not stretch the collapsed button to the expanded widget beside it", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/components/ProgressiveHomeOverviewInsights.tsx"),
      "utf8"
    );
    const collapsedButton = source.match(
      /if \(collapsed\)[\s\S]*?<button[\s\S]*?className="([^"]+)"/
    )?.[1];

    expect(collapsedButton).toBeTruthy();
    expect(collapsedButton?.split(/\s+/)).not.toContain("h-full");
    expect(collapsedButton?.split(/\s+/)).toContain("min-h-11");
  });
});
