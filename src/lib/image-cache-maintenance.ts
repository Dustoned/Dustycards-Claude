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
  responsive: boolean;
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

export interface ImageCacheLimits {
  maxEntries: number;
  maxBytes: number;
  maxResponsiveEntries: number;
  maxResponsiveBytes: number;
}

export interface ImageCacheMaintenanceResult extends ResponsiveCacheMaintenanceResult {
  responsiveEntries: number;
  responsiveBytes: number;
  removedResponsiveEntries: number;
  removedResponsiveBytes: number;
}

async function readCacheEntry(
  cacheDir: string,
  metaName: string
): Promise<ResponsiveCacheEntry | null> {
  const metaPath = path.join(cacheDir, metaName);

  try {
    const metadata = JSON.parse(await fs.readFile(metaPath, "utf8")) as ResponsiveCacheMeta;
    const imagePath = path.join(cacheDir, `${metaName.slice(0, -".json".length)}.img`);
    const [imageStat, metaStat] = await Promise.all([fs.stat(imagePath), fs.stat(metaPath)]);
    if (!imageStat.isFile()) return null;

    return {
      imagePath,
      metaPath,
      bytes: imageStat.size,
      modifiedAt: Math.max(imageStat.mtimeMs, metaStat.mtimeMs),
      responsive: typeof metadata.deliveryWidth === "number",
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
    const entry = await readCacheEntry(cacheDir, name);
    if (entry?.responsive) entries.push(entry);
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

async function removeCacheEntry(entry: ResponsiveCacheEntry): Promise<boolean> {
  try {
    await fs.rm(entry.imagePath, { force: true });
    await fs.rm(entry.metaPath, { force: true });
    return true;
  } catch {
    return false;
  }
}

/**
 * Bounds the complete persistent cache from a low-priority maintenance worker.
 * Responsive variants receive their own tighter budget first; the total budget
 * then removes the oldest remaining pairs regardless of kind. Nothing here runs
 * in the web request process.
 */
export async function trimImageCache(
  cacheDir: string,
  limits: ImageCacheLimits
): Promise<ImageCacheMaintenanceResult> {
  const maxEntries = Math.max(0, Math.floor(limits.maxEntries));
  const maxBytes = Math.max(0, Math.floor(limits.maxBytes));
  const maxResponsiveEntries = Math.max(0, Math.floor(limits.maxResponsiveEntries));
  const maxResponsiveBytes = Math.max(0, Math.floor(limits.maxResponsiveBytes));

  let names: string[];
  try {
    names = (await fs.readdir(cacheDir)).filter((name) => name.endsWith(".json"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {
        entries: 0,
        bytes: 0,
        responsiveEntries: 0,
        responsiveBytes: 0,
        removedEntries: 0,
        removedBytes: 0,
        removedResponsiveEntries: 0,
        removedResponsiveBytes: 0,
      };
    }
    throw error;
  }

  const entries: ResponsiveCacheEntry[] = [];
  for (const name of names) {
    const entry = await readCacheEntry(cacheDir, name);
    if (entry) entries.push(entry);
  }
  entries.sort((left, right) => left.modifiedAt - right.modifiedAt);

  let remainingEntries = entries.length;
  let remainingBytes = entries.reduce((sum, entry) => sum + entry.bytes, 0);
  let responsiveEntries = entries.filter((entry) => entry.responsive).length;
  let responsiveBytes = entries.reduce(
    (sum, entry) => sum + (entry.responsive ? entry.bytes : 0),
    0
  );
  let removedEntries = 0;
  let removedBytes = 0;
  let removedResponsiveEntries = 0;
  let removedResponsiveBytes = 0;
  const removed = new Set<ResponsiveCacheEntry>();

  for (const entry of entries) {
    if (
      responsiveEntries <= maxResponsiveEntries &&
      responsiveBytes <= maxResponsiveBytes
    ) {
      break;
    }
    if (!entry.responsive || !(await removeCacheEntry(entry))) continue;
    removed.add(entry);
    remainingEntries -= 1;
    remainingBytes -= entry.bytes;
    responsiveEntries -= 1;
    responsiveBytes -= entry.bytes;
    removedEntries += 1;
    removedBytes += entry.bytes;
    removedResponsiveEntries += 1;
    removedResponsiveBytes += entry.bytes;
  }

  for (const entry of entries) {
    if (remainingEntries <= maxEntries && remainingBytes <= maxBytes) break;
    if (removed.has(entry) || !(await removeCacheEntry(entry))) continue;
    remainingEntries -= 1;
    remainingBytes -= entry.bytes;
    removedEntries += 1;
    removedBytes += entry.bytes;
    if (entry.responsive) {
      responsiveEntries -= 1;
      responsiveBytes -= entry.bytes;
      removedResponsiveEntries += 1;
      removedResponsiveBytes += entry.bytes;
    }
  }

  return {
    entries: remainingEntries,
    bytes: remainingBytes,
    responsiveEntries,
    responsiveBytes,
    removedEntries,
    removedBytes,
    removedResponsiveEntries,
    removedResponsiveBytes,
  };
}
