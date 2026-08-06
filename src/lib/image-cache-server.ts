import "server-only";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { createConcurrencyLimiter } from "@/lib/concurrency-limiter";
import {
  CACHEABLE_IMAGE_HOSTS,
  getImageCacheVariantForSourceUrl,
  normalizeResponsiveImageWidth,
  TCGGO_CARD_TRANSPARENT_TRIM_VARIANT,
  type ImageCacheVariant,
} from "@/lib/image-cache";
import { getRemoteImageCandidates } from "@/lib/image-cache-fallbacks";

// Image transforms share the web process with normal page requests. One
// libvips thread per transform prevents a cold card grid from claiming both
// VPS cores; the small JS-level queue below still keeps two images moving.
sharp.concurrency(1);
sharp.cache({ memory: 64, files: 0, items: 64 });

function resolveImageCacheDir() {
  const configured = process.env.DUSTYCARDS_IMAGE_CACHE_DIR?.trim();
  return configured
    ? path.resolve(/*turbopackIgnore: true*/ configured)
    : path.resolve(/*turbopackIgnore: true*/ process.cwd(), "data", "image-cache");
}

export const IMAGE_CACHE_DIR = resolveImageCacheDir();
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 30_000;
// The remaining proxied image hosts accept parallel connections. Keep enough
// slots available for one visible row without flooding the upstream CDNs.
const MAX_REMOTE_IMAGE_FETCHES = 16;
// Sharp decodes full source images before producing a thumbnail. Bounding the
// number of decodes prevents a cold grid from multiplying CPU and native-memory
// pressure by every simultaneously requested card.
const MAX_IMAGE_TRANSFORMS = 1;

let activeRemoteImageFetches = 0;
const remoteImageFetchQueue: Array<() => void> = [];
const pendingDownloads = new Map<string, Promise<EnsureImageResult>>();
const pendingResponsiveImages = new Map<string, Promise<EnsureImageResult>>();
const imageTransformLimiter = createConcurrencyLimiter(MAX_IMAGE_TRANSFORMS);

function joinRuntimeFile(dir: string, fileName: string): string {
  const normalizedDir = dir.replace(/[\\/]+$/, "");
  return `${normalizedDir}${path.sep}${fileName}`;
}

interface ImageMeta {
  contentType: string;
  sourceUrl: string;
  variant?: ImageCacheVariant | null;
  deliveryWidth?: number;
}

export interface EnsureImageResult {
  imagePath: string;
  contentType: string;
  hit: boolean;
  /** Populated only when this call performed the download. */
  buffer: Buffer | null;
}

export function getCachePaths(sourceUrl: string, variant: ImageCacheVariant | null = null) {
  const hashInput = variant ? `${sourceUrl}\n${variant}` : sourceUrl;
  return getCachePathsForHashInput(hashInput);
}

function getCachePathsForHashInput(hashInput: string) {
  const hash = createHash("sha256").update(hashInput).digest("hex");
  return {
    imagePath: joinRuntimeFile(IMAGE_CACHE_DIR, `${hash}.img`),
    metaPath: joinRuntimeFile(IMAGE_CACHE_DIR, `${hash}.json`),
  };
}

function getResponsiveCachePaths(
  sourceUrl: string,
  variant: ImageCacheVariant | null,
  width: number
) {
  return getCachePathsForHashInput(
    `${sourceUrl}\ndelivery:webp\n${variant ?? "original"}\nwidth:${width}`
  );
}

export function parseImageCacheVariant(
  sourceUrl: URL,
  value: string | null | undefined
): ImageCacheVariant | null {
  const sourceVariant = getImageCacheVariantForSourceUrl(sourceUrl);
  if (!sourceVariant) return null;
  if (!value) return sourceVariant;
  return value === sourceVariant ? sourceVariant : null;
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
    return JSON.parse(await fs.readFile(/*turbopackIgnore: true*/ metaPath, "utf8")) as ImageMeta;
  } catch {
    return null;
  }
}

function hasImageSignature(buffer: Buffer, contentType: string): boolean {
  if (buffer.byteLength === 0) {
    return false;
  }

  const asciiStart = buffer.subarray(0, Math.min(buffer.byteLength, 32)).toString("ascii").trimStart();
  if (
    asciiStart.startsWith("<!DOCTYPE") ||
    asciiStart.startsWith("<html") ||
    asciiStart.startsWith("{")
  ) {
    return false;
  }

  const normalizedContentType = contentType.toLowerCase();
  if (normalizedContentType.includes("svg")) {
    return asciiStart.startsWith("<svg") || asciiStart.startsWith("<?xml");
  }

  if (buffer.byteLength >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return true;
  }

  if (
    buffer.byteLength >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return true;
  }

  if (
    buffer.byteLength >= 6 &&
    buffer[0] === 0x47 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x38
  ) {
    return true;
  }

  if (
    buffer.byteLength >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return true;
  }

  if (
    buffer.byteLength >= 12 &&
    buffer.subarray(4, 8).toString("ascii") === "ftyp" &&
    ["avif", "avis", "mif1", "msf1"].includes(buffer.subarray(8, 12).toString("ascii"))
  ) {
    return true;
  }

  return false;
}

function sniffImageContentType(buffer: Buffer, fallback: string): string {
  if (buffer.byteLength >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    buffer.byteLength >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    buffer.byteLength >= 6 &&
    buffer[0] === 0x47 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x38
  ) {
    return "image/gif";
  }
  if (
    buffer.byteLength >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  if (
    buffer.byteLength >= 12 &&
    buffer.subarray(4, 8).toString("ascii") === "ftyp" &&
    ["avif", "avis", "mif1", "msf1"].includes(buffer.subarray(8, 12).toString("ascii"))
  ) {
    return "image/avif";
  }
  return fallback;
}

async function isCachedImageReadable(imagePath: string, contentType: string): Promise<boolean> {
  const file = await fs.open(/*turbopackIgnore: true*/ imagePath, "r");

  try {
    const { size } = await file.stat();
    if (size === 0 || size > MAX_IMAGE_BYTES) {
      return false;
    }

    const sample = Buffer.alloc(Math.min(32, size));
    await file.read(sample, 0, sample.byteLength, 0);
    return hasImageSignature(sample, contentType);
  } finally {
    await file.close();
  }
}

async function removeCachedImage(imagePath: string, metaPath: string) {
  await Promise.all([
    fs.rm(/*turbopackIgnore: true*/ imagePath, { force: true }).catch(() => undefined),
    fs.rm(/*turbopackIgnore: true*/ metaPath, { force: true }).catch(() => undefined),
  ]);
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
  metaPath: string,
  variant: ImageCacheVariant | null
): Promise<EnsureImageResult> {
  const release = await acquireRemoteImageFetchSlot();

  try {
    let response: Response | null = null;
    const failureStatuses: number[] = [];
    for (const candidate of getRemoteImageCandidates(sourceUrl)) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      try {
        const headers: HeadersInit = {
          Accept: "image/avif,image/webp,image/png,image/jpeg,image/*,*/*;q=0.8",
        };
        if (candidate.hostname.includes("cardmarket.com")) {
          headers["User-Agent"] =
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";
          headers.Referer = "https://www.cardmarket.com/";
        } else if (candidate.hostname === "www.pokemon.com") {
          headers["User-Agent"] =
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";
          headers.Referer = "https://www.pokemon.com/";
        }

        const candidateResponse = await fetch(candidate, {
          signal: controller.signal,
          headers,
        });
        if (candidateResponse.ok) {
          response = candidateResponse;
          break;
        }
        failureStatuses.push(candidateResponse.status);
      } catch {
        failureStatuses.push(0);
      } finally {
        clearTimeout(timeout);
      }
    }

    if (!response) {
      throw new Error(`Image fetch failed with ${failureStatuses.join(",") || "no response"}`);
    }

    const remoteContentType = response.headers.get("content-type") ?? "application/octet-stream";

    const contentLength = Number(response.headers.get("content-length") ?? 0);
    if (contentLength > MAX_IMAGE_BYTES) {
      throw new Error("Image too large");
    }

    const rawBuffer = Buffer.from(await response.arrayBuffer());
    const rawContentType = sniffImageContentType(rawBuffer, remoteContentType);
    if (!hasImageSignature(rawBuffer, rawContentType)) {
      throw new Error("Remote URL returned invalid image bytes");
    }

    if (rawBuffer.byteLength > MAX_IMAGE_BYTES) {
      throw new Error("Image too large");
    }

    const prepared = await prepareCachedImageBuffer(rawBuffer, rawContentType, variant);
    const buffer = prepared.buffer;
    const contentType = prepared.contentType;

    await fs.mkdir(IMAGE_CACHE_DIR, { recursive: true });
    await Promise.all([
      fs.writeFile(/*turbopackIgnore: true*/ imagePath, buffer),
      fs.writeFile(
        /*turbopackIgnore: true*/
        metaPath,
        JSON.stringify({ contentType, sourceUrl: sourceUrl.href, variant } satisfies ImageMeta)
      ),
    ]);

    return { imagePath, contentType, hit: false, buffer };
  } finally {
    release();
  }
}

async function prepareCachedImageBuffer(
  buffer: Buffer,
  contentType: string,
  variant: ImageCacheVariant | null
): Promise<{ buffer: Buffer; contentType: string }> {
  if (variant !== TCGGO_CARD_TRANSPARENT_TRIM_VARIANT) {
    return { buffer, contentType };
  }

  const trimmed = await imageTransformLimiter.run(() => trimTransparentImagePadding(buffer));
  if (!trimmed) {
    return { buffer, contentType };
  }

  if (!hasImageSignature(trimmed, "image/png") || trimmed.byteLength > MAX_IMAGE_BYTES) {
    return { buffer, contentType };
  }

  return { buffer: trimmed, contentType: "image/png" };
}

async function prepareResponsiveImageBuffer(
  buffer: Buffer,
  contentType: string,
  width: number
): Promise<{ buffer: Buffer; contentType: string } | null> {
  // Do not flatten animated artwork or rasterize SVG assets. Card and sealed
  // thumbnails use the raster formats below and are safe to resize.
  if (!/image\/(?:avif|jpe?g|png|webp)/i.test(contentType)) {
    return null;
  }

  const image = sharp(buffer, { limitInputPixels: false });
  const metadata = await image.metadata();
  if (!metadata.width || metadata.width <= width) {
    return null;
  }

  const resized = await image
    .rotate()
    .resize({
      width,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({
      quality: 84,
      alphaQuality: 90,
      effort: 3,
      smartSubsample: true,
    })
    .toBuffer();

  if (!hasImageSignature(resized, "image/webp") || resized.byteLength > MAX_IMAGE_BYTES) {
    return null;
  }

  return { buffer: resized, contentType: "image/webp" };
}

async function trimTransparentImagePadding(buffer: Buffer): Promise<Buffer | null> {
  const image = sharp(buffer, { limitInputPixels: false }).ensureAlpha();
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;

  let left = width;
  let right = -1;
  let top = height;
  let bottom = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = data[(y * width + x) * channels + 3];
      if (alpha === 0) continue;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }

  if (right < left) {
    return null;
  }

  const trimWidth = right - left + 1;
  const trimHeight = bottom - top + 1;
  if (left === 0 && top === 0 && trimWidth === width && trimHeight === height) {
    return null;
  }

  return sharp(buffer, { limitInputPixels: false })
    .extract({ left, top, width: trimWidth, height: trimHeight })
    .png({ compressionLevel: 6, effort: 3 })
    .toBuffer();
}

async function createVariantFromOriginalCache(
  sourceUrl: URL,
  variant: ImageCacheVariant,
  imagePath: string,
  metaPath: string
): Promise<EnsureImageResult | null> {
  const originalPaths = getCachePaths(sourceUrl.href);
  const originalMeta = await readMeta(originalPaths.metaPath);
  if (!originalMeta) return null;

  const originalContentType = originalMeta.contentType || "application/octet-stream";
  try {
    const isReadableImage = await isCachedImageReadable(
      originalPaths.imagePath,
      originalContentType
    );
    if (!isReadableImage) return null;

    const originalBuffer = await fs.readFile(
      /*turbopackIgnore: true*/ originalPaths.imagePath
    );
    const prepared = await prepareCachedImageBuffer(originalBuffer, originalContentType, variant);
    await fs.mkdir(IMAGE_CACHE_DIR, { recursive: true });
    await Promise.all([
      fs.writeFile(/*turbopackIgnore: true*/ imagePath, prepared.buffer),
      fs.writeFile(
        /*turbopackIgnore: true*/
        metaPath,
        JSON.stringify({
          contentType: prepared.contentType,
          sourceUrl: sourceUrl.href,
          variant,
        } satisfies ImageMeta)
      ),
    ]);

    return {
      imagePath,
      contentType: prepared.contentType,
      hit: false,
      buffer: prepared.buffer,
    };
  } catch {
    return null;
  }
}

export async function ensureImageCached(
  sourceUrl: URL,
  options: { variant?: ImageCacheVariant | null } = {}
): Promise<EnsureImageResult> {
  const variant = options.variant ?? getImageCacheVariantForSourceUrl(sourceUrl);
  const { imagePath, metaPath } = getCachePaths(sourceUrl.href, variant);
  const cachedMeta = await readMeta(metaPath);

  if (cachedMeta) {
    try {
      const isReadableImage = await isCachedImageReadable(
        imagePath,
        cachedMeta.contentType || "application/octet-stream"
      );
      if (!isReadableImage) {
        await removeCachedImage(imagePath, metaPath);
      } else {
        return {
          imagePath,
          contentType: cachedMeta.contentType || "application/octet-stream",
          hit: true,
          buffer: null,
        };
      }
    } catch {
      await removeCachedImage(imagePath, metaPath);
    }
  }

  if (variant) {
    const variantFromOriginal = await createVariantFromOriginalCache(
      sourceUrl,
      variant,
      imagePath,
      metaPath
    );
    if (variantFromOriginal) return variantFromOriginal;
  }

  const pendingKey = `${sourceUrl.href}\n${variant ?? "original"}`;
  const inflightForVariant = pendingDownloads.get(pendingKey);
  if (inflightForVariant) return inflightForVariant;

  const download = downloadAndPersist(sourceUrl, imagePath, metaPath, variant);
  pendingDownloads.set(pendingKey, download);
  download.then(
    () => pendingDownloads.delete(pendingKey),
    () => pendingDownloads.delete(pendingKey)
  );
  return download;
}

export async function ensureResponsiveImageCached(
  sourceUrl: URL,
  options: {
    variant?: ImageCacheVariant | null;
    width?: number | string | null;
  } = {}
): Promise<EnsureImageResult> {
  const width = normalizeResponsiveImageWidth(options.width);
  const variant = options.variant ?? getImageCacheVariantForSourceUrl(sourceUrl);
  if (!width) {
    return ensureImageCached(sourceUrl, { variant });
  }

  const { imagePath, metaPath } = getResponsiveCachePaths(sourceUrl.href, variant, width);
  const cachedMeta = await readMeta(metaPath);
  if (cachedMeta) {
    try {
      const contentType = cachedMeta.contentType || "application/octet-stream";
      if (await isCachedImageReadable(imagePath, contentType)) {
        return {
          imagePath,
          contentType,
          hit: true,
          buffer: null,
        };
      }
      await removeCachedImage(imagePath, metaPath);
    } catch {
      await removeCachedImage(imagePath, metaPath);
    }
  }

  const pendingKey = `${sourceUrl.href}\n${variant ?? "original"}\nwidth:${width}`;
  const inflight = pendingResponsiveImages.get(pendingKey);
  if (inflight) return inflight;

  const createResponsiveImage = (async () => {
    const original = await ensureImageCached(sourceUrl, { variant });

    let prepared: Awaited<ReturnType<typeof prepareResponsiveImageBuffer>>;
    try {
      prepared = await imageTransformLimiter.run(async () => {
        // Cached originals are only read once a Sharp slot is available. This
        // stops queued requests from retaining dozens of full-size Buffers.
        const sourceBuffer =
          original.buffer ??
          (await fs.readFile(/*turbopackIgnore: true*/ original.imagePath));
        return prepareResponsiveImageBuffer(sourceBuffer, original.contentType, width);
      });
    } catch {
      // Responsive delivery is an optimization. A format Sharp cannot process
      // must still render via the already validated original bytes.
      return original;
    }

    if (!prepared) return original;

    await fs.mkdir(IMAGE_CACHE_DIR, { recursive: true });
    await Promise.all([
      fs.writeFile(/*turbopackIgnore: true*/ imagePath, prepared.buffer),
      fs.writeFile(
        /*turbopackIgnore: true*/
        metaPath,
        JSON.stringify({
          contentType: prepared.contentType,
          sourceUrl: sourceUrl.href,
          variant,
          deliveryWidth: width,
        } satisfies ImageMeta)
      ),
    ]);
    return {
      imagePath,
      contentType: prepared.contentType,
      hit: false,
      buffer: prepared.buffer,
    };
  })();

  pendingResponsiveImages.set(pendingKey, createResponsiveImage);
  createResponsiveImage.then(
    () => pendingResponsiveImages.delete(pendingKey),
    () => pendingResponsiveImages.delete(pendingKey)
  );
  return createResponsiveImage;
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
        const result = await ensureImageCached(url, {
          variant: getImageCacheVariantForSourceUrl(url),
        });
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
