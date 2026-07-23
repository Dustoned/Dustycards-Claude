import "server-only";

import path from "node:path";
import sharp from "sharp";
import { OEM, PSM, createWorker, type Worker } from "tesseract.js";
import { db } from "@/lib/db";
import {
  canAutoAcceptScannerCandidate,
  extractScannerCardReferences,
  getScannerCandidateConfidence,
  getScannerMatchReasons,
  getStrongestScannerText,
  rankScannerCandidates,
  type CardScannerCatalogCard,
  type CardScannerMatch,
} from "@/lib/card-scanner";
import {
  normalizeTradingCardGame,
  type TradingCardGame,
} from "@/lib/games";

const OCR_IMAGE_WIDTH = 900;
const OCR_IMAGE_HEIGHT = 1_280;
const CATALOG_CACHE_MS = 10 * 60 * 1_000;
const CANDIDATE_HASH_TIMEOUT_MS = 2_200;
const MAX_VISUAL_CANDIDATES = 8;
const MAX_HASH_CACHE_ENTRIES = 512;
const TESSERACT_WORKER_PATH = path.join(
  process.cwd(),
  "node_modules",
  "tesseract.js",
  "src",
  "worker-script",
  "node",
  "index.js"
);
const TESSERACT_LANGUAGE_PATH = path.join(
  process.cwd(),
  "node_modules",
  "@tesseract.js-data",
  "eng",
  "4.0.0"
);

type ScannerArtworkHash = {
  full: string;
  illustration: string;
};

type ScannerCatalogCacheEntry = {
  expiresAt: number;
  promise: Promise<CardScannerCatalogCard[]>;
};

type OcrResult = {
  text: string;
  confidence: number | null;
  normalizedImage: Buffer;
};

const scannerCatalogCache = new Map<TradingCardGame, ScannerCatalogCacheEntry>();
const scannerArtworkHashCache = new Map<string, Promise<ScannerArtworkHash | null>>();
let ocrWorkerPromise: Promise<Worker> | null = null;
let ocrQueue: Promise<unknown> = Promise.resolve();

function getComparableCardImageUrl(imageUrl: string): string {
  try {
    const url = new URL(imageUrl);
    if (url.hostname === "assets.tcgdex.net") {
      if (/\/(?:high|low)\.webp$/i.test(url.pathname)) {
        url.pathname = url.pathname.replace(/\/(?:high|low)\.webp$/i, "/low.webp");
      } else {
        url.pathname = `${url.pathname.replace(/\/$/, "")}/low.webp`;
      }
    }
    return url.toString();
  } catch {
    return imageUrl;
  }
}

async function createDifferenceHash(
  image: Buffer,
  extract?: { left: number; top: number; width: number; height: number }
): Promise<string> {
  let pipeline = sharp(image, { limitInputPixels: 28_000_000 });
  if (extract) pipeline = pipeline.extract(extract);
  const { data } = await pipeline
    .resize(17, 16, { fit: "fill" })
    .grayscale()
    .normalize()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let hash = "";
  for (let y = 0; y < 16; y += 1) {
    for (let x = 0; x < 16; x += 1) {
      hash += data[y * 17 + x] > data[y * 17 + x + 1] ? "1" : "0";
    }
  }
  return hash;
}

async function createScannerArtworkHash(image: Buffer): Promise<ScannerArtworkHash | null> {
  try {
    const metadata = await sharp(image, { limitInputPixels: 28_000_000 }).metadata();
    if (!metadata.width || !metadata.height) return null;

    const illustrationBounds = {
      left: Math.floor(metadata.width * 0.07),
      top: Math.floor(metadata.height * 0.14),
      width: Math.max(1, Math.floor(metadata.width * 0.86)),
      height: Math.max(1, Math.floor(metadata.height * 0.43)),
    };
    const [full, illustration] = await Promise.all([
      createDifferenceHash(image),
      createDifferenceHash(image, illustrationBounds),
    ]);
    return { full, illustration };
  } catch {
    return null;
  }
}

function getHashSimilarity(left: string, right: string): number {
  if (!left || left.length !== right.length) return 0;
  let equal = 0;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] === right[index]) equal += 1;
  }
  return equal / left.length;
}

function getArtworkSimilarity(
  left: ScannerArtworkHash | null,
  right: ScannerArtworkHash | null
): number {
  if (!left || !right) return 0;
  return Math.max(
    getHashSimilarity(left.full, right.full),
    getHashSimilarity(left.illustration, right.illustration)
  );
}

async function loadRemoteArtworkHash(imageUrl: string): Promise<ScannerArtworkHash | null> {
  const comparableUrl = getComparableCardImageUrl(imageUrl);
  const cached = scannerArtworkHashCache.get(comparableUrl);
  if (cached) return cached;

  if (scannerArtworkHashCache.size >= MAX_HASH_CACHE_ENTRIES) {
    const oldest = scannerArtworkHashCache.keys().next().value;
    if (oldest) scannerArtworkHashCache.delete(oldest);
  }

  const pending = (async () => {
    try {
      const response = await fetch(comparableUrl, {
        headers: {
          accept: "image/avif,image/webp,image/*",
          "user-agent": "DustyCards card scanner",
        },
        signal: AbortSignal.timeout(CANDIDATE_HASH_TIMEOUT_MS),
      });
      if (!response.ok) return null;
      const image = Buffer.from(await response.arrayBuffer());
      if (image.length === 0 || image.length > 5_000_000) return null;
      return createScannerArtworkHash(image);
    } catch {
      return null;
    }
  })();
  scannerArtworkHashCache.set(comparableUrl, pending);
  return pending;
}

async function createOcrWorker(): Promise<Worker> {
  const worker = await createWorker("eng", OEM.LSTM_ONLY, {
    workerPath: TESSERACT_WORKER_PATH,
    langPath: TESSERACT_LANGUAGE_PATH,
    gzip: true,
    cacheMethod: "readOnly",
  });
  await worker.setParameters({
    tessedit_pageseg_mode: PSM.SPARSE_TEXT,
    preserve_interword_spaces: "1",
    user_defined_dpi: "300",
  });
  return worker;
}

function getOcrWorker(): Promise<Worker> {
  ocrWorkerPromise ??= createOcrWorker().catch((error) => {
    ocrWorkerPromise = null;
    throw error;
  });
  return ocrWorkerPromise;
}

async function normalizeScanImage(image: Buffer): Promise<Buffer> {
  return sharp(image, { limitInputPixels: 28_000_000, animated: false })
    .rotate()
    .resize({
      width: OCR_IMAGE_WIDTH,
      height: OCR_IMAGE_HEIGHT,
      fit: "inside",
      withoutEnlargement: false,
    })
    .flatten({ background: "#ffffff" })
    .grayscale()
    .normalize()
    .sharpen({ sigma: 0.9 })
    .png({ compressionLevel: 6 })
    .toBuffer();
}

async function recognizeCardTextUnsafe(image: Buffer): Promise<OcrResult> {
  const normalizedImage = await normalizeScanImage(image);
  const metadata = await sharp(normalizedImage).metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error("The selected image could not be read.");
  }

  const worker = await getOcrWorker();
  await worker.setParameters({
    tessedit_pageseg_mode: PSM.SPARSE_TEXT,
    tessedit_char_whitelist: "",
  });
  const topHeight = Math.max(1, Math.floor(metadata.height * 0.38));
  const bottomTop = Math.floor(metadata.height * 0.68);
  const bottomHeight = Math.max(1, metadata.height - bottomTop);
  const bandGap = 28;
  const [topBand, bottomBand] = await Promise.all([
    sharp(normalizedImage)
      .extract({ left: 0, top: 0, width: metadata.width, height: topHeight })
      .toBuffer(),
    sharp(normalizedImage)
      .extract({
        left: 0,
        top: bottomTop,
        width: metadata.width,
        height: bottomHeight,
      })
      .toBuffer(),
  ]);
  const ocrBands = await sharp({
    create: {
      width: metadata.width,
      height: topHeight + bandGap + bottomHeight,
      channels: 3,
      background: "#ffffff",
    },
  })
    .composite([
      { input: topBand, left: 0, top: 0 },
      { input: bottomBand, left: 0, top: topHeight + bandGap },
    ])
    .png({ compressionLevel: 4 })
    .toBuffer();
  const result = await worker.recognize(ocrBands);
  await worker.setParameters({
    tessedit_pageseg_mode: PSM.SPARSE_TEXT,
    tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/#- ",
  });
  const referenceBand = await sharp(bottomBand)
    .resize({ width: 1_200, withoutEnlargement: false })
    .normalize()
    .sharpen({ sigma: 1.15 })
    .png({ compressionLevel: 4 })
    .toBuffer();
  const referenceResult = await worker.recognize(referenceBand);
  const text = [result.data.text.trim(), referenceResult.data.text.trim()]
    .filter(Boolean)
    .join("\n");
  const confidences = [
    result.data.confidence,
    referenceResult.data.confidence,
  ].filter(
    (value): value is number => Number.isFinite(value)
  );

  return {
    text,
    confidence:
      confidences.length > 0
        ? Math.round(
            (confidences.reduce((sum, value) => sum + value, 0) / confidences.length) * 10
          ) / 10
        : null,
    normalizedImage,
  };
}

async function recognizeCardText(image: Buffer): Promise<OcrResult> {
  const run = ocrQueue.then(() => recognizeCardTextUnsafe(image));
  ocrQueue = run.catch(() => undefined);
  return run;
}

async function loadScannerCatalog(game: TradingCardGame): Promise<CardScannerCatalogCard[]> {
  const now = Date.now();
  const cached = scannerCatalogCache.get(game);
  if (cached && cached.expiresAt > now) return cached.promise;

  const promise = db.card
    .findMany({
      where: { game },
      select: {
        id: true,
        game: true,
        name: true,
        card_number: true,
        printed_card_number: true,
        rarity: true,
        image_url: true,
        episode: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
      },
    })
    .then((cards) =>
      cards.map((card) => ({
        ...card,
        game: normalizeTradingCardGame(card.game),
      }))
    );
  scannerCatalogCache.set(game, {
    expiresAt: now + CATALOG_CACHE_MS,
    promise,
  });
  return promise;
}

async function getVisualSimilarities(
  normalizedImage: Buffer,
  candidates: CardScannerCatalogCard[]
): Promise<Map<string, number>> {
  const scannedHash = await createScannerArtworkHash(normalizedImage);
  if (!scannedHash) return new Map();

  const candidateHashes = await Promise.all(
    candidates.map(async (candidate) => ({
      id: candidate.id,
      hash: candidate.image_url ? await loadRemoteArtworkHash(candidate.image_url) : null,
    }))
  );

  return new Map(
    candidateHashes
      .map(({ id, hash }) => [id, getArtworkSimilarity(scannedHash, hash)] as const)
      .filter(([, similarity]) => similarity > 0)
  );
}

export async function scanCardImage(input: {
  image: Buffer;
  game: TradingCardGame;
  userId: string;
}): Promise<{
  matches: CardScannerMatch[];
  detected: {
    cardReferences: string[];
    strongestText: string | null;
    ocrConfidence: number | null;
  };
}> {
  const [ocr, catalog] = await Promise.all([
    recognizeCardText(input.image),
    loadScannerCatalog(input.game),
  ]);
  const initialRank = rankScannerCandidates(catalog, ocr.text);
  const strongestTextMatch = initialRank[0];
  const textMatchIsConclusive = Boolean(
    strongestTextMatch?.numberMatch === "exact" &&
      strongestTextMatch.nameSimilarity >= 0.82 &&
      strongestTextMatch.score - (initialRank[1]?.score ?? 0) >= 10
  );
  const visualCandidateCards = textMatchIsConclusive
    ? []
    : initialRank
        .slice(0, MAX_VISUAL_CANDIDATES)
        .map((candidate) => candidate.card);
  const visualSimilarities =
    visualCandidateCards.length > 0
      ? await getVisualSimilarities(ocr.normalizedImage, visualCandidateCards)
      : new Map<string, number>();
  const ranked = rankScannerCandidates(catalog, ocr.text, visualSimilarities).slice(0, 5);
  const ids = ranked.map((candidate) => candidate.card.id);

  const detailedCards =
    ids.length > 0
      ? await db.card.findMany({
          where: { id: { in: ids } },
          select: {
            id: true,
            prices: {
              where: {
                cm_en_lowest_nm: { gt: 0, not: 9001 },
              },
              orderBy: [{ fetched_at: "desc" }, { id: "desc" }],
              take: 1,
              select: { cm_en_lowest_nm: true },
            },
            wants: {
              where: { user_id: input.userId },
              orderBy: { created_at: "desc" },
              take: 1,
              select: { id: true, created_at: true },
            },
          },
        })
      : [];
  const detailsById = new Map(detailedCards.map((card) => [card.id, card]));

  const matches = ranked.map((candidate, index): CardScannerMatch => {
    const details = detailsById.get(candidate.card.id);
    const want = details?.wants[0] ?? null;
    const runnerUpScore =
      index === 0 ? ranked[1]?.score ?? null : ranked[0]?.score ?? null;
    const runnerUpGap = Math.max(0, candidate.score - (runnerUpScore ?? 0));
    return {
      ...candidate.card,
      price: details?.prices[0]?.cm_en_lowest_nm ?? null,
      want_item: want
        ? {
            id: want.id,
            created_at: want.created_at.toISOString(),
          }
        : null,
      confidence: getScannerCandidateConfidence(candidate, runnerUpScore),
      score: candidate.score,
      reasons: getScannerMatchReasons(candidate),
      autoAccept:
        index === 0 && canAutoAcceptScannerCandidate(candidate, runnerUpScore),
      runnerUpGap,
      evidence: {
        nameSimilarity: candidate.nameSimilarity,
        numberMatch: candidate.numberMatch,
        setMatch: candidate.setMatch,
        artworkSimilarity: candidate.visualSimilarity,
      },
    };
  });

  return {
    matches,
    detected: {
      cardReferences: extractScannerCardReferences(ocr.text),
      strongestText: getStrongestScannerText(ocr.text),
      ocrConfidence: ocr.confidence,
    },
  };
}
