import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { NextRequest, NextResponse } from "next/server";
import { CACHEABLE_IMAGE_HOSTS } from "@/lib/image-cache";

export const dynamic = "force-dynamic";

function resolveImageCacheDir() {
  if (process.env.DUSTYCARDS_IMAGE_CACHE_DIR) {
    return path.resolve(process.env.DUSTYCARDS_IMAGE_CACHE_DIR);
  }

  if (process.env.LOCALAPPDATA) {
    return path.join(process.env.LOCALAPPDATA, "DustyCards", "image-cache");
  }

  return path.join(os.homedir(), ".dustycards", "image-cache");
}

const IMAGE_CACHE_DIR = resolveImageCacheDir();
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 30_000;
const MAX_REMOTE_IMAGE_FETCHES = 3;

let activeRemoteImageFetches = 0;
const remoteImageFetchQueue: Array<() => void> = [];
const pendingDownloads = new Map<string, Promise<{ buffer: Buffer; contentType: string }>>();

interface ImageMeta {
  contentType: string;
  sourceUrl: string;
}

function getCachePaths(sourceUrl: string) {
  const hash = createHash("sha256").update(sourceUrl).digest("hex");

  return {
    imagePath: path.join(IMAGE_CACHE_DIR, `${hash}.img`),
    metaPath: path.join(IMAGE_CACHE_DIR, `${hash}.json`),
  };
}

function parseSourceUrl(value: string | null): URL | null {
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

function releaseRemoteImageFetchSlot() {
  activeRemoteImageFetches = Math.max(0, activeRemoteImageFetches - 1);
  const next = remoteImageFetchQueue.shift();
  if (next) next();
}

function imageFileResponse(imagePath: string, contentType: string, cacheState: "HIT" | "MISS") {
  const stream = Readable.toWeb(createReadStream(imagePath)) as ReadableStream<Uint8Array>;

  return new NextResponse(stream, {
    headers: {
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Type": contentType,
      "X-DustyCards-Image-Cache": cacheState,
    },
  });
}

function imageResponse(body: Buffer, contentType: string, cacheState: "HIT" | "MISS") {
  const bytes = new Uint8Array(body);

  return new NextResponse(bytes, {
    headers: {
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Type": contentType,
      "X-DustyCards-Image-Cache": cacheState,
    },
  });
}

async function fetchAndCacheImage(sourceUrl: URL, imagePath: string, metaPath: string) {
  const pending = pendingDownloads.get(sourceUrl.href);
  if (pending) return pending;

  const download = (async () => {
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

      return { buffer, contentType };
    } finally {
      clearTimeout(timeout);
      release();
    }
  })();

  pendingDownloads.set(sourceUrl.href, download);
  download.finally(() => pendingDownloads.delete(sourceUrl.href));
  return download;
}

export async function GET(request: NextRequest) {
  const sourceUrl = parseSourceUrl(request.nextUrl.searchParams.get("url"));
  if (!sourceUrl) {
    return NextResponse.json({ error: "Unsupported image URL" }, { status: 400 });
  }

  const { imagePath, metaPath } = getCachePaths(sourceUrl.href);
  const cachedMeta = await readMeta(metaPath);

  if (cachedMeta) {
    try {
      await fs.access(imagePath);
      return imageFileResponse(imagePath, cachedMeta.contentType || "application/octet-stream", "HIT");
    } catch {
      await Promise.all([
        fs.rm(imagePath, { force: true }).catch(() => undefined),
        fs.rm(metaPath, { force: true }).catch(() => undefined),
      ]);
    }
  }

  try {
    const { buffer, contentType } = await fetchAndCacheImage(sourceUrl, imagePath, metaPath);
    return imageResponse(buffer, contentType, "MISS");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
