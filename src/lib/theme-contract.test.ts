import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  APPEARANCE_CSS_VARIABLE_NAMES,
  APPEARANCE_THEME_PRESETS,
  appearancePaletteToCssVariables,
} from "@/lib/appearance-themes";

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return sourceFiles(fullPath);
      return /\.(?:ts|tsx)$/.test(entry.name) ? [fullPath] : [];
    })
  );
  return files.flat();
}

describe("appearance theme contract", () => {
  it("exposes the same complete CSS-variable contract for every preset", () => {
    const expected = [...APPEARANCE_CSS_VARIABLE_NAMES].sort();

    for (const preset of APPEARANCE_THEME_PRESETS) {
      expect(Object.keys(appearancePaletteToCssVariables(preset.palette)).sort()).toEqual(
        expected
      );
    }
  });

  it("keeps fixed graphite utility surfaces out of app components", async () => {
    const root = path.resolve(process.cwd(), "src");
    const files = await sourceFiles(root);
    const offenders: string[] = [];
    const fixedSurface = /(?:^|\s)(?:bg|hover:bg|focus:bg)-\[#[0-9a-f]{3,8}\]/i;

    await Promise.all(
      files.map(async (file) => {
        if (file.endsWith(`${path.sep}GradedSlabPreview.tsx`)) return;
        const source = await readFile(file, "utf8");
        if (fixedSurface.test(source)) {
          offenders.push(path.relative(process.cwd(), file));
        }
      })
    );

    expect(offenders.sort()).toEqual([]);
  });
});
