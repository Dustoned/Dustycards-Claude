import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

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
const DB_PATH = path.resolve(process.cwd(), "dustycards.db");
const CACHEABLE_IMAGE_HOSTS = new Set(["assets.tcgdex.net", "images.tcggo.com"]);
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const CONCURRENCY = 8;

function getCachePaths(sourceUrl) {
  const hash = crypto.createHash("sha256").update(sourceUrl).digest("hex");

  return {
    imagePath: path.join(IMAGE_CACHE_DIR, `${hash}.img`),
    metaPath: path.join(IMAGE_CACHE_DIR, `${hash}.json`),
  };
}

function parseSourceUrl(value) {
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

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function cacheImage(sourceUrl) {
  const { imagePath, metaPath } = getCachePaths(sourceUrl);
  if ((await fileExists(imagePath)) && (await fileExists(metaPath))) {
    return "cached";
  }

  const response = await fetch(sourceUrl, {
    headers: {
      Accept: "image/avif,image/webp,image/png,image/jpeg,image/*,*/*;q=0.8",
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const contentType = response.headers.get("content-type") ?? "application/octet-stream";
  if (!contentType.startsWith("image/")) {
    throw new Error(`Unexpected content-type ${contentType}`);
  }

  const contentLength = Number(response.headers.get("content-length") ?? 0);
  if (contentLength > MAX_IMAGE_BYTES) {
    throw new Error(`Image exceeds ${MAX_IMAGE_BYTES} bytes`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength > MAX_IMAGE_BYTES) {
    throw new Error(`Image exceeds ${MAX_IMAGE_BYTES} bytes`);
  }

  await fs.mkdir(IMAGE_CACHE_DIR, { recursive: true });
  await Promise.all([
    fs.writeFile(imagePath, buffer),
    fs.writeFile(metaPath, JSON.stringify({ contentType, sourceUrl })),
  ]);

  return "downloaded";
}

function loadImageUrls() {
  const db = new Database(DB_PATH, { readonly: true });

  try {
    const rows = db
      .prepare(
        `
        SELECT image_url AS url FROM "Card" WHERE image_url IS NOT NULL AND TRIM(image_url) <> ''
        UNION
        SELECT logo_url AS url FROM "Episode" WHERE logo_url IS NOT NULL AND TRIM(logo_url) <> ''
        UNION
        SELECT image_url AS url FROM "SealedProduct" WHERE image_url IS NOT NULL AND TRIM(image_url) <> ''
      `
      )
      .all();

    return [
      ...new Set(
        rows
          .map((row) => parseSourceUrl(row.url)?.href)
          .filter((url) => typeof url === "string")
      ),
    ];
  } finally {
    db.close();
  }
}

async function run() {
  console.log(`Using image cache: ${IMAGE_CACHE_DIR}`);

  const urls = loadImageUrls();
  let nextIndex = 0;
  let cached = 0;
  let downloaded = 0;
  let failed = 0;

  async function worker() {
    while (nextIndex < urls.length) {
      const index = nextIndex;
      nextIndex += 1;

      const url = urls[index];
      try {
        const result = await cacheImage(url);
        if (result === "cached") cached += 1;
        if (result === "downloaded") downloaded += 1;
      } catch (error) {
        failed += 1;
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[${index + 1}/${urls.length}] failed ${url}: ${message}`);
      }

      if ((index + 1) % 100 === 0 || index + 1 === urls.length) {
        console.log(
          `[${index + 1}/${urls.length}] downloaded=${downloaded} cached=${cached} failed=${failed}`
        );
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, urls.length) }, () => worker()));

  console.log(`Done. downloaded=${downloaded} cached=${cached} failed=${failed}`);
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
