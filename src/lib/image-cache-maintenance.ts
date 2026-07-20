import { promises as fs } from "node:fs";
import path from "node:path";

interface ResponsiveCacheMeta {
  deliveryWidth?: unknown;
}

interface ResponsiveCacheEntry {
  imagePath: string;
  metaPath: string;
  bytes: number;
  modifiedAt: number;
}

export interface ResponsiveCacheLimits {
  maxEntries: number;
  maxBytes: number;
}

export interface ResponsiveCacheMaintenanceResult {
  entries: number;
  bytes: number;
  removedEntries: number;
  removedBytes: number;
}

async function readResponsiveCacheEntry(
  cacheDir: string,
  metaName: string
): Promise<ResponsiveCacheEntry | null> {
  const metaPath = path.join(cacheDir, metaName);

  try {
    const metadata = JSON.parse(await fs.readFile(metaPath, "utf8")) as ResponsiveCacheMeta;
    if (typeof metadata.deliveryWidth !== "number") return null;

    const imagePath = path.join(cacheDir, `${metaName.slice(0, -".json".length)}.img`);
    const [imageStat, metaStat] = await Promise.all([fs.stat(imagePath), fs.stat(metaPath)]);
    if (!imageStat.isFile()) return null;

    return {
      imagePath,
      metaPath,
      bytes: imageStat.size,
      modifiedAt: Math.max(imageStat.mtimeMs, metaStat.mtimeMs),
    };
  } catch {
    // A concurrent writer or an incomplete pair is harmless. The next bounded
    // maintenance pass can reconsider it after the write has settled.
    return null;
  }
}

/**
 * Bounds generated responsive variants only. Original/full-resolution cache
 * entries have no `deliveryWidth` metadata and are deliberately never removed.
 */
export async function trimResponsiveImageCache(
  cacheDir: string,
  limits: ResponsiveCacheLimits
): Promise<ResponsiveCacheMaintenanceResult> {
  const maxEntries = Math.max(0, Math.floor(limits.maxEntries));
  const maxBytes = Math.max(0, Math.floor(limits.maxBytes));

  let names: string[];
  try {
    names = (await fs.readdir(cacheDir)).filter((name) => name.endsWith(".json"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { entries: 0, bytes: 0, removedEntries: 0, removedBytes: 0 };
    }
    throw error;
  }

  // Intentionally inspect entries sequentially. Maintenance runs off the
  // request path and should not create its own filesystem I/O spike.
  const entries: ResponsiveCacheEntry[] = [];
  for (const name of names) {
    const entry = await readResponsiveCacheEntry(cacheDir, name);
    if (entry) entries.push(entry);
  }

  entries.sort((left, right) => left.modifiedAt - right.modifiedAt);
  let remainingEntries = entries.length;
  let remainingBytes = entries.reduce((sum, entry) => sum + entry.bytes, 0);
  let removedEntries = 0;
  let removedBytes = 0;

  for (const entry of entries) {
    if (remainingEntries <= maxEntries && remainingBytes <= maxBytes) break;

    try {
      await fs.rm(entry.imagePath, { force: true });
      await fs.rm(entry.metaPath, { force: true });
      remainingEntries -= 1;
      remainingBytes -= entry.bytes;
      removedEntries += 1;
      removedBytes += entry.bytes;
    } catch {
      // A file can be open in a response stream on Windows. Keep serving it and
      // let a later maintenance pass try again.
    }
  }

  return {
    entries: remainingEntries,
    bytes: remainingBytes,
    removedEntries,
    removedBytes,
  };
}
