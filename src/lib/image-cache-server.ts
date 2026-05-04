import "server-only";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { CACHEABLE_IMAGE_HOSTS } from "@/lib/image-cache";

function resolveImageCacheDir() {
  if (process.env.DUSTYCARDS_IMAGE_CACHE_DIR) {
    return path.resolve(process.env.DUSTYCARDS_IMAGE_CACHE_DIR);
  }

  if (process.env.LOCALAPPDATA) {
    return path.join(process.env.LOCALAPPDATA, "DustyCards", "image-cache");
  }

  return path.join(os.homedir(), ".dustycards", "image-cache");
}

export const IMAGE_CACHE_DIR = resolveImageCacheDir();
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 30_000;
// Both tcgdex and tcggo serve images via fast CDNs and accept many parallel
// connections; bumping from 3 to 10 cuts image-warm time roughly 3x.
const MAX_REMOTE_IMAGE_FETCHES = 10;

let activeRemoteImageFetches = 0;
const remoteImageFetchQueue: Array<() => void> = [];
const pendingDownloads = new Map<string, Promise<EnsureImageResult>>();

interface ImageMeta {
  contentType: string;
  sourceUrl: string;
}

export interface EnsureImageResult {
  imagePath: string;
  contentType: string;
  hit: boolean;
  /** Populated only when this call performed the download. */
  buffer: Buffer | null;
}

export function getCachePaths(sourceUrl: string) {
  const hash = createHash("sha256").update(sourceUrl).digest("hex");
  return {
    imagePath: path.join(IMAGE_CACHE_DIR, `${hash}.img`),
    metaPath: path.join(IMAGE_CACHE_DIR, `${hash}.json`),
  };
}

export function parseCacheableImageUrl(value: string | null | undefined): URL | null {
  if (!value) return null;

  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (!CACHEABLE_IMAGE_HOSTS.has(url.hostname)) return null;
    return url;
  } catch {
    return null;
  }
}

async function readMeta(metaPath: string): Promise<ImageMeta | null> {
  try {
    return JSON.parse(await fs.readFile(metaPath, "utf8")) as ImageMeta;
  } catch {
    return null;
  }
}

function releaseRemoteImageFetchSlot() {
  activeRemoteImageFetches = Math.max(0, activeRemoteImageFetches - 1);
  const next = remoteImageFetchQueue.shift();
  if (next) next();
}

async function acquireRemoteImageFetchSlot(): Promise<() => void> {
  if (activeRemoteImageFetches < MAX_REMOTE_IMAGE_FETCHES) {
    activeRemoteImageFetches += 1;
    return releaseRemoteImageFetchSlot;
  }

  return new Promise((resolve) => {
    remoteImageFetchQueue.push(() => {
      activeRemoteImageFetches += 1;
      resolve(releaseRemoteImageFetchSlot);
    });
  });
}

async function downloadAndPersist(
  sourceUrl: URL,
  imagePath: string,
  metaPath: string
): Promise<EnsureImageResult> {
  const release = await acquireRemoteImageFetchSlot();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(sourceUrl, {
      signal: controller.signal,
      headers: {
        Accept: "image/avif,image/webp,image/png,image/jpeg,image/*,*/*;q=0.8",
      },
    });

    if (!response.ok) {
      throw new Error(`Image fetch failed with ${response.status}`);
    }

    const contentType = response.headers.get("content-type") ?? "application/octet-stream";
    if (!contentType.startsWith("image/")) {
      throw new Error("Remote URL did not return an image");
    }

    const contentLength = Number(response.headers.get("content-length") ?? 0);
    if (contentLength > MAX_IMAGE_BYTES) {
      throw new Error("Image too large");
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength > MAX_IMAGE_BYTES) {
      throw new Error("Image too large");
    }

    await fs.mkdir(IMAGE_CACHE_DIR, { recursive: true });
    await Promise.all([
      fs.writeFile(imagePath, buffer),
      fs.writeFile(
        metaPath,
        JSON.stringify({ contentType, sourceUrl: sourceUrl.href } satisfies ImageMeta)
      ),
    ]);

    return { imagePath, contentType, hit: false, buffer };
  } finally {
    clearTimeout(timeout);
    release();
  }
}

export async function ensureImageCached(sourceUrl: URL): Promise<EnsureImageResult> {
  const { imagePath, metaPath } = getCachePaths(sourceUrl.href);
  const cachedMeta = await readMeta(metaPath);

  if (cachedMeta) {
    try {
      await fs.access(imagePath);
      return {
        imagePath,
        contentType: cachedMeta.contentType || "application/octet-stream",
        hit: true,
        buffer: null,
      };
    } catch {
      await Promise.all([
        fs.rm(imagePath, { force: true }).catch(() => undefined),
        fs.rm(metaPath, { force: true }).catch(() => undefined),
      ]);
    }
  }

  const inflight = pendingDownloads.get(sourceUrl.href);
  if (inflight) return inflight;

  const download = downloadAndPersist(sourceUrl, imagePath, metaPath);
  pendingDownloads.set(sourceUrl.href, download);
  download.finally(() => pendingDownloads.delete(sourceUrl.href));
  return download;
}

export interface WarmCardImagesOptions {
  /** Max concurrent in-flight downloads (default 3, matching the route slot count). */
  concurrency?: number;
  /** Optional callback invoked after each URL completes (success or failure). */
  onProgress?: (state: WarmCardImagesProgress) => void;
  /** Abort signal to stop the warmer mid-run. */
  signal?: AbortSignal;
}

export interface WarmCardImagesProgress {
  total: number;
  processed: number;
  hits: number;
  downloaded: number;
  skipped: number;
  failed: number;
}

export interface WarmCardImagesResult extends WarmCardImagesProgress {
  durationMs: number;
}

/**
 * Pre-warms the on-disk image cache for the given remote URLs.
 * Non-cacheable hosts are skipped (counted in `skipped`).
 * Errors are swallowed per-URL and reflected in `failed`.
 */
export async function warmCardImages(
  urls: ReadonlyArray<string | null | undefined>,
  options: WarmCardImagesOptions = {}
): Promise<WarmCardImagesResult> {
  const concurrency = Math.max(1, options.concurrency ?? 3);
  const startedAt = Date.now();

  const queue: URL[] = [];
  let skipped = 0;
  const seen = new Set<string>();

  for (const url of urls) {
    const parsed = parseCacheableImageUrl(url);
    if (!parsed) {
      skipped += 1;
      continue;
    }
    if (seen.has(parsed.href)) continue;
    seen.add(parsed.href);
    queue.push(parsed);
  }

  const total = queue.length + skipped;
  const progress: WarmCardImagesProgress = {
    total,
    processed: skipped,
    hits: 0,
    downloaded: 0,
    skipped,
    failed: 0,
  };

  options.onProgress?.(progress);

  let nextIndex = 0;
  async function worker() {
    while (nextIndex < queue.length) {
      if (options.signal?.aborted) return;

      const index = nextIndex;
      nextIndex += 1;
      const url = queue[index];

      try {
        const result = await ensureImageCached(url);
        if (result.hit) {
          progress.hits += 1;
        } else {
          progress.downloaded += 1;
        }
      } catch {
        progress.failed += 1;
      } finally {
        progress.processed += 1;
        options.onProgress?.(progress);
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, queue.length) }, () => worker())
  );

  return { ...progress, durationMs: Date.now() - startedAt };
}
