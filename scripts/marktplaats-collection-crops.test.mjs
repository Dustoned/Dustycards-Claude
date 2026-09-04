import { it, expect } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import sharp from "sharp";

it("creates actual bounded image crops and rejects a mismatched original", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "dustycards-crop-test-"));
  try {
    await sharp({ create: { width: 100, height: 200, channels: 3, background: "red" } }).png().toFile(path.join(root, "photo.png"));
    const report = { collections: [{ listingUrl: "https://www.marktplaats.nl/v/verzamelen/pokemon/m123-example", title: "Test", description: "Test photo",
      photos: [{ id: "p1", url: "https://images.marktplaats.com/test.jpg", width: 100, height: 200 }],
      cards: [{ id: "card", label: "Unidentified", crops: [{ photoId: "p1", side: "front", x: 0.5, y: 0.5, width: 0.5, height: 0.5 }] }],
    }] };
    await fs.writeFile(path.join(root, "report.json"), JSON.stringify(report));
    await fs.writeFile(path.join(root, "images.json"), JSON.stringify({ m123: { p1: "photo.png" } }));
    const args = ["--no-warnings", "scripts/marktplaats-collection-crops.mjs", "--in", path.join(root, "report.json"), "--images", path.join(root, "images.json"), "--out", path.join(root, "crops")];
    execFileSync(process.execPath, args, { timeout: 15_000, stdio: "pipe" });
    const index = JSON.parse(await fs.readFile(path.join(root, "crops", "index.json"), "utf8"));
    expect(index).toHaveLength(1);
    expect(await sharp(await fs.readFile(path.join(root, "crops", index[0].file))).metadata()).toMatchObject({ width: 50, height: 100, format: "webp" });
    report.collections[0].photos[0].width = 200;
    await fs.writeFile(path.join(root, "report.json"), JSON.stringify(report));
    expect(() => execFileSync(process.execPath, args, { timeout: 15_000, stdio: "pipe" })).toThrow();
  } finally {
    if (path.dirname(root) === os.tmpdir() && path.basename(root).startsWith("dustycards-crop-test-")) await fs.rm(root, { recursive: true, force: true });
  }
}, 30_000);
