import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { CACHEABLE_IMAGE_HOSTS } from "@/lib/image-cache";

export const dynamic = "force-dynamic";

const IMAGE_CACHE_DIR = path.resolve(process.cwd(), "data", "image-cache");
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 30_000;

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

export async function GET(request: NextRequest) {
  const sourceUrl = parseSourceUrl(request.nextUrl.searchParams.get("url"));
  if (!sourceUrl) {
    return NextResponse.json({ error: "Unsupported image URL" }, { status: 400 });
  }

  const { imagePath, metaPath } = getCachePaths(sourceUrl.href);
  const cachedMeta = await readMeta(metaPath);

  if (cachedMeta) {
    try {
      return imageResponse(
        await fs.readFile(imagePath),
        cachedMeta.contentType || "application/octet-stream",
        "HIT"
      );
    } catch {
      await Promise.all([
        fs.rm(imagePath, { force: true }).catch(() => undefined),
        fs.rm(metaPath, { force: true }).catch(() => undefined),
      ]);
    }
  }

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
      return NextResponse.json(
        { error: `Image fetch failed with ${response.status}` },
        { status: 502 }
      );
    }

    const contentType = response.headers.get("content-type") ?? "application/octet-stream";
    if (!contentType.startsWith("image/")) {
      return NextResponse.json({ error: "Remote URL did not return an image" }, { status: 415 });
    }

    const contentLength = Number(response.headers.get("content-length") ?? 0);
    if (contentLength > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: "Image too large" }, { status: 413 });
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: "Image too large" }, { status: 413 });
    }

    await fs.mkdir(IMAGE_CACHE_DIR, { recursive: true });
    await Promise.all([
      fs.writeFile(imagePath, buffer),
      fs.writeFile(
        metaPath,
        JSON.stringify({ contentType, sourceUrl: sourceUrl.href } satisfies ImageMeta)
      ),
    ]);

    return imageResponse(buffer, contentType, "MISS");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}
