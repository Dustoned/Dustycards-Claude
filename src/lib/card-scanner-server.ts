import "server-only";

import path from "node:path";
import sharp from "sharp";
import { OEM, PSM, createWorker, type Worker } from "tesseract.js";
import { db } from "@/lib/db";
import {
  canAutoAcceptScannerCandidate,
  extractScannerCardReferences,
  getScannerAttackSimilarity,
  getScannerCandidateConfidence,
  getScannerMatchReasons,
  getScannerNameObservation,
  getScannerNumberObservation,
  getStrongestScannerText,
  normalizeScannerCardReference,
  normalizeScannerText,
  rankScannerCandidates,
  type CardScannerCatalogCard,
  type CardScannerField,
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
const MAX_ATTACK_CACHE_ENTRIES = 512;
const TCGDEX_CARD_ENDPOINT = "https://api.tcgdex.net/v2/en/cards";
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
const scannerAttackTextCache = new Map<string, Promise<string[]>>();
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

function getTcgdexScannerCardId(card: CardScannerCatalogCard): string | null {
  if (card.image_url) {
    try {
      const url = new URL(card.image_url);
      if (url.hostname === "assets.tcgdex.net") {
        const parts = url.pathname.split("/").filter(Boolean);
        const languageIndex = parts.findIndex((part) => part === "en");
        const setId = languageIndex >= 0 ? parts[languageIndex + 2] : null;
        const localId = languageIndex >= 0 ? parts[languageIndex + 3] : null;
        if (setId && localId) return `${setId}-${localId}`;
      }
    } catch {
      // Fall through to the stored TCGdex id.
    }
  }
  return card.tcgid?.trim() || null;
}

async function fetchScannerAttackTexts(
  card: CardScannerCatalogCard
): Promise<string[]> {
  const cardId = getTcgdexScannerCardId(card);
  if (!cardId || card.game !== "pokemon") return [];

  const cached = scannerAttackTextCache.get(cardId);
  if (cached) return cached;
  if (scannerAttackTextCache.size >= MAX_ATTACK_CACHE_ENTRIES) {
    const oldestKey = scannerAttackTextCache.keys().next().value;
    if (oldestKey) scannerAttackTextCache.delete(oldestKey);
  }

  const pending = (async () => {
    try {
      const response = await fetch(
        `${TCGDEX_CARD_ENDPOINT}/${encodeURIComponent(cardId)}`,
        {
          headers: { accept: "application/json" },
          next: { revalidate: 60 * 60 * 24 * 7 },
          signal: AbortSignal.timeout(2_500),
        }
      );
      if (!response.ok) return [];
      const data = (await response.json()) as {
        attacks?: Array<{ name?: string; effect?: string }>;
      };
      return (data.attacks ?? [])
        .flatMap((attack) => [attack.name, attack.effect])
        .filter((value): value is string => Boolean(value?.trim()));
    } catch {
      return [];
    }
  })();
  scannerAttackTextCache.set(cardId, pending);
  return pending;
}

async function getAttackSimilarities(
  observedText: string | null | undefined,
  candidates: CardScannerCatalogCard[]
): Promise<Map<string, number>> {
  if (!observedText?.trim() || candidates.length === 0) return new Map();
  const rows = await Promise.all(
    candidates.map(async (candidate) => ({
      id: candidate.id,
      similarity: getScannerAttackSimilarity(
        observedText,
        await fetchScannerAttackTexts(candidate)
      ),
    }))
  );
  return new Map(
    rows
      .filter(({ similarity }) => similarity >= 0.45)
      .map(({ id, similarity }) => [id, similarity])
  );
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

async function recognizeScannerFieldUnsafe(
  image: Buffer,
  field: CardScannerField
): Promise<{ text: string; confidence: number | null }> {
  const normalizedImage = await sharp(image, {
    limitInputPixels: 28_000_000,
    animated: false,
  })
    .rotate()
    .resize({
      width: 1_400,
      height: 1_400,
      fit: "inside",
      withoutEnlargement: false,
    })
    .flatten({ background: "#ffffff" })
    .grayscale()
    .normalize()
    .sharpen({ sigma: 1.05 })
    .png({ compressionLevel: 5 })
    .toBuffer();
  const worker = await getOcrWorker();
  await worker.setParameters({
    tessedit_pageseg_mode: PSM.SPARSE_TEXT,
    tessedit_char_whitelist:
      field === "number"
        ? "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/#- "
        : "",
  });
  const result = await worker.recognize(normalizedImage);
  const results = [result];

  if (field === "name" || field === "number") {
    const thresholdImage = await sharp(normalizedImage)
      .threshold(field === "name" ? 145 : 130)
      .png({ compressionLevel: 4 })
      .toBuffer();
    await worker.setParameters({
      tessedit_pageseg_mode:
        field === "name" ? PSM.SINGLE_BLOCK : PSM.SPARSE_TEXT,
      tessedit_char_whitelist:
        field === "number"
          ? "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/#- "
          : "",
    });
    results.push(await worker.recognize(thresholdImage));
  } else if (field === "attack") {
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
      tessedit_char_whitelist: "",
    });
    results.push(await worker.recognize(normalizedImage));
  }

  const text = results
    .map((item) => item.data.text.trim())
    .filter(Boolean)
    .join("\n");
  const confidences = results
    .map((item) => item.data.confidence)
    .filter((value): value is number => Number.isFinite(value));
  return {
    text,
    confidence: confidences.length > 0
      ? Math.round(Math.max(...confidences) * 10) / 10
      : null,
  };
}

async function recognizeScannerField(
  image: Buffer,
  field: CardScannerField
): Promise<{ text: string; confidence: number | null }> {
  const run = ocrQueue.then(() => recognizeScannerFieldUnsafe(image, field));
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
        tcgid: true,
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
  knownName?: string | null;
  knownReference?: string | null;
  knownAttackText?: string | null;
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
  const rememberedText = [input.knownName, input.knownReference]
    .filter((value): value is string => Boolean(value?.trim()))
    .join("\n");
  const combinedOcrText = [rememberedText, ocr.text].filter(Boolean).join("\n");
  const initialRank = rankScannerCandidates(catalog, combinedOcrText);
  const strongestTextMatch = initialRank[0];
  const textMatchIsConclusive = Boolean(
    !rememberedText &&
    strongestTextMatch?.numberMatch === "exact" &&
      strongestTextMatch.nameSimilarity >= 0.82 &&
      strongestTextMatch.score - (initialRank[1]?.score ?? 0) >= 10
  );
  const visualCandidateCards = textMatchIsConclusive
    ? []
    : initialRank
        .slice(0, MAX_VISUAL_CANDIDATES)
        .map((candidate) => candidate.card);
  const [visualSimilarities, attackSimilarities] = await Promise.all([
    visualCandidateCards.length > 0
      ? getVisualSimilarities(ocr.normalizedImage, visualCandidateCards)
      : Promise.resolve(new Map<string, number>()),
    getAttackSimilarities(
      input.knownAttackText,
      initialRank.slice(0, MAX_VISUAL_CANDIDATES).map((candidate) => candidate.card)
    ),
  ]);
  const ranked = rankScannerCandidates(
    catalog,
    combinedOcrText,
    visualSimilarities,
    attackSimilarities
  ).slice(0, 5);
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
        attackSimilarity: candidate.attackSimilarity,
      },
    };
  });

  return {
    matches,
    detected: {
      cardReferences: extractScannerCardReferences(combinedOcrText),
      strongestText: input.knownName ?? getStrongestScannerText(ocr.text),
      ocrConfidence: ocr.confidence,
    },
  };
}

export async function readScannerFieldImage(input: {
  image: Buffer;
  game: TradingCardGame;
  field: CardScannerField;
  knownName?: string | null;
  knownReference?: string | null;
}): Promise<{
  field: CardScannerField;
  value: string | null;
  confidence: number | null;
  rawText: string | null;
  catalogMatches: number;
}> {
  const [ocr, catalog] = await Promise.all([
    recognizeScannerField(input.image, input.field),
    loadScannerCatalog(input.game),
  ]);

  if (input.field === "number") {
    const observation = getScannerNumberObservation(catalog, ocr.text);

    return {
      field: input.field,
      value: observation?.value ?? null,
      confidence: observation ? ocr.confidence : null,
      rawText: ocr.text.trim().slice(0, 280) || null,
      catalogMatches: observation?.catalogMatches ?? 0,
    };
  }

  if (input.field === "attack") {
    const normalizedKnownName = normalizeScannerText(input.knownName ?? "");
    const normalizedKnownReference = normalizeScannerCardReference(
      input.knownReference ?? ""
    );
    const likelyCards = catalog
      .filter((card) => {
        if (
          normalizedKnownName &&
          normalizeScannerText(card.name) === normalizedKnownName
        ) {
          return true;
        }
        if (!normalizedKnownReference) return false;
        return [card.printed_card_number, card.card_number].some(
          (value) =>
            normalizeScannerCardReference(value ?? "") ===
            normalizedKnownReference
        );
      })
      .slice(0, 20);
    const canonicalTerms = [
      ...new Set(
        (
          await Promise.all(
            likelyCards.map((card) => fetchScannerAttackTexts(card))
          )
        ).flat()
      ),
    ];
    const canonicalMatches = canonicalTerms
      .map((value) => ({
        value,
        similarity: getScannerAttackSimilarity(ocr.text, [value]),
      }))
      .filter(({ similarity }) => similarity >= 0.62)
      .sort((left, right) => right.similarity - left.similarity)
      .slice(0, 2);
    const value =
      canonicalMatches.length > 0
        ? canonicalMatches.map((match) => match.value).join(" · ").slice(0, 140)
        : null;

    return {
      field: input.field,
      value: value && (ocr.confidence ?? 0) >= 20 ? value : null,
      confidence: value ? ocr.confidence : null,
      rawText: ocr.text.trim().slice(0, 280) || null,
      catalogMatches: likelyCards.length,
    };
  }

  const observation = getScannerNameObservation(catalog, ocr.text);

  return {
    field: input.field,
    value: observation?.value ?? null,
    confidence: observation?.confidence ?? null,
    rawText: ocr.text.trim().slice(0, 280) || null,
    catalogMatches: observation?.catalogMatches ?? 0,
  };
}
