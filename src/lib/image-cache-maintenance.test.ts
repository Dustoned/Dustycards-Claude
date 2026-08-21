import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  trimImageCache,
  trimResponsiveImageCache,
} from "@/lib/image-cache-maintenance";

const tempDirs: string[] = [];

async function makeCacheDir() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "dustycards-image-cache-test-"));
  tempDirs.push(dir);
  return dir;
}

async function writeEntry(
  dir: string,
  name: string,
  options: { bytes: number; responsive: boolean; modifiedAt: number; sourceUrl?: string }
) {
  const imagePath = path.join(dir, `${name}.img`);
  const metaPath = path.join(dir, `${name}.json`);
  await fs.writeFile(imagePath, Buffer.alloc(options.bytes, 1));
  await fs.writeFile(
    metaPath,
    JSON.stringify({
      ...(options.responsive ? { deliveryWidth: 192 } : { contentType: "image/webp" }),
      ...(options.sourceUrl ? { sourceUrl: options.sourceUrl } : {}),
    })
  );
  const modifiedAt = new Date(options.modifiedAt);
  await Promise.all([
    fs.utimes(imagePath, modifiedAt, modifiedAt),
    fs.utimes(metaPath, modifiedAt, modifiedAt),
  ]);
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("trimResponsiveImageCache", () => {
  it("removes the oldest responsive pairs until entry and byte limits are met", async () => {
    const dir = await makeCacheDir();
    await writeEntry(dir, "old", { bytes: 8, responsive: true, modifiedAt: 1_000 });
    await writeEntry(dir, "middle", { bytes: 7, responsive: true, modifiedAt: 2_000 });
    await writeEntry(dir, "new", { bytes: 6, responsive: true, modifiedAt: 3_000 });

    const result = await trimResponsiveImageCache(dir, { maxEntries: 2, maxBytes: 13 });

    expect(result).toEqual({
      entries: 2,
      bytes: 13,
      removedEntries: 1,
      removedBytes: 8,
    });
    await expect(fs.stat(path.join(dir, "old.img"))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(fs.stat(path.join(dir, "middle.img"))).resolves.toBeDefined();
    await expect(fs.stat(path.join(dir, "new.img"))).resolves.toBeDefined();
  });

  it("never removes original full-resolution entries", async () => {
    const dir = await makeCacheDir();
    await writeEntry(dir, "original", { bytes: 50, responsive: false, modifiedAt: 1_000 });
    await writeEntry(dir, "responsive", { bytes: 10, responsive: true, modifiedAt: 2_000 });

    const result = await trimResponsiveImageCache(dir, { maxEntries: 0, maxBytes: 0 });

    expect(result.removedEntries).toBe(1);
    await expect(fs.stat(path.join(dir, "original.img"))).resolves.toBeDefined();
    await expect(fs.stat(path.join(dir, "original.json"))).resolves.toBeDefined();
    await expect(fs.stat(path.join(dir, "responsive.img"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("treats a missing cache directory as an empty cache", async () => {
    const dir = path.join(os.tmpdir(), `dustycards-missing-cache-${Date.now()}`);
    await expect(
      trimResponsiveImageCache(dir, { maxEntries: 10, maxBytes: 1_000 })
    ).resolves.toEqual({ entries: 0, bytes: 0, removedEntries: 0, removedBytes: 0 });
  });
});

describe("trimImageCache", () => {
  it("enforces responsive and total budgets while keeping the newest pairs", async () => {
    const dir = await makeCacheDir();
    await writeEntry(dir, "old-original", {
      bytes: 40,
      responsive: false,
      modifiedAt: 1_000,
    });
    await writeEntry(dir, "old-responsive", {
      bytes: 20,
      responsive: true,
      modifiedAt: 2_000,
    });
    await writeEntry(dir, "new-original", {
      bytes: 30,
      responsive: false,
      modifiedAt: 3_000,
    });

    const result = await trimImageCache(dir, {
      maxEntries: 1,
      maxBytes: 35,
      maxResponsiveEntries: 0,
      maxResponsiveBytes: 0,
    });

    expect(result).toMatchObject({
      entries: 1,
      bytes: 30,
      responsiveEntries: 0,
      removedEntries: 2,
      removedResponsiveEntries: 1,
    });
    await expect(fs.stat(path.join(dir, "new-original.img"))).resolves.toBeDefined();
  });

  it("preserves live referenced originals while removing stale cache entries", async () => {
    const dir = await makeCacheDir();
    await writeEntry(dir, "live-original", {
      bytes: 40,
      responsive: false,
      modifiedAt: 1_000,
      sourceUrl: "https://images.test/live.webp",
    });
    await writeEntry(dir, "stale-original", {
      bytes: 30,
      responsive: false,
      modifiedAt: 2_000,
      sourceUrl: "https://images.test/stale.webp",
    });

    const result = await trimImageCache(dir, {
      maxEntries: 1,
      maxBytes: 40,
      maxResponsiveEntries: 10,
      maxResponsiveBytes: 100,
      protectedSourceUrls: new Set(["https://images.test/live.webp"]),
    });

    expect(result).toMatchObject({ entries: 1, bytes: 40, removedEntries: 1 });
    await expect(fs.stat(path.join(dir, "live-original.img"))).resolves.toBeDefined();
    await expect(fs.stat(path.join(dir, "stale-original.img"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("treats the total byte budget as hard even when every entry is referenced", async () => {
    const dir = await makeCacheDir();
    await writeEntry(dir, "old-live", {
      bytes: 40,
      responsive: false,
      modifiedAt: 1_000,
      sourceUrl: "https://images.test/old.webp",
    });
    await writeEntry(dir, "new-live", {
      bytes: 30,
      responsive: false,
      modifiedAt: 2_000,
      sourceUrl: "https://images.test/new.webp",
    });

    const result = await trimImageCache(dir, {
      maxEntries: 1,
      maxBytes: 30,
      maxResponsiveEntries: 10,
      maxResponsiveBytes: 100,
      protectedSourceUrls: new Set([
        "https://images.test/old.webp",
        "https://images.test/new.webp",
      ]),
    });

    expect(result).toMatchObject({ entries: 1, bytes: 30, removedEntries: 1 });
    await expect(fs.stat(path.join(dir, "old-live.img"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });
});
