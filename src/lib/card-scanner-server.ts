import "server-only";

import path from "node:path";
import { readFile } from "node:fs/promises";
import sharp from "sharp";
import {
  OEM,
  PSM,
  createWorker,
  type Worker,
} from "tesseract.js";
import { db } from "@/lib/db";
import {
  canAutoAcceptScannerCandidate,
  extractScannerCardReferences,
  filterScannerCardsByNumberEvidence,
  getScannerAttackSimilarity,
  getScannerAutoAcceptContext,
  getScannerCardReferenceAliases,
  getScannerCandidateConfidence,
  getScannerMatchReasons,
  getScannerNameObservation,
  getScannerNameFromUniqueReference,
  getScannerNumberObservation,
  getStrongestScannerText,
  normalizeScannerCardReference,
  normalizeScannerText,
  rankScannerCandidates,
  type CardScannerCatalogCard,
  type CardScannerField,
  type CardScannerFieldObservations,
  type CardScannerMatch,
} from "@/lib/card-scanner";
import {
  ensureImageCached,
  parseCacheableImageUrl,
} from "@/lib/image-cache-server";
import {
  normalizeTradingCardGame,
  type TradingCardGame,
} from "@/lib/games";

const OCR_IMAGE_WIDTH = 900;
const OCR_IMAGE_HEIGHT = 1_280;
const CATALOG_CACHE_MS = 10 * 60 * 1_000;
const CANDIDATE_HASH_TIMEOUT_MS = 2_200;
const FIELD_OCR_PASS_TIMEOUT_MS = 8_000;
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

type ScannerFieldOcrResult = {
  text: string;
  expectedText: string;
  focusText: string;
  confidence: number | null;
};

const scannerCatalogCache = new Map<TradingCardGame, ScannerCatalogCacheEntry>();
const scannerArtworkHashCache = new Map<string, Promise<ScannerArtworkHash | null>>();
const scannerAttackTextCache = new Map<string, Promise<string[]>>();
let ocrWorkerPromise: Promise<Worker> | null = null;
let fieldOcrWorkerPromise: Promise<Worker> | null = null;
let ocrQueue: Promise<unknown> = Promise.resolve();
let fieldOcrQueue: Promise<unknown> = Promise.resolve();

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
  const storedId = card.tcgid?.trim();
  if (storedId) return storedId;

  const promoReference = normalizeScannerCardReference(card.card_number ?? "");
  const promo = /^(SVP|MEP|SWSH|SM|XY|BW)(\d{1,4})$/.exec(
    promoReference ?? ""
  );
  if (!promo) return null;
  const setIdByPrefix: Record<string, string> = {
    SVP: "svp",
    MEP: "mep",
    SWSH: "swshp",
    SM: "smp",
    XY: "xyp",
    BW: "bwp",
  };
  const setId = setIdByPrefix[promo[1]];
  return setId ? `${setId}-${Number(promo[2])}` : null;
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
    const source = sharp(image, {
      limitInputPixels: 28_000_000,
      animated: false,
    }).rotate();
    const sourceMetadata = await source.metadata();
    const normalizedCard = await (
      sourceMetadata.hasAlpha
        ? source.trim({
            background: { r: 0, g: 0, b: 0, alpha: 0 },
            threshold: 8,
          })
        : source
    )
      .flatten({ background: "#ffffff" })
      .png({ compressionLevel: 4 })
      .toBuffer();
    const metadata = await sharp(normalizedCard).metadata();
    if (!metadata.width || !metadata.height) return null;

    const illustrationBounds = {
      left: Math.floor(metadata.width * 0.07),
      top: Math.floor(metadata.height * 0.14),
      width: Math.max(1, Math.floor(metadata.width * 0.86)),
      height: Math.max(1, Math.floor(metadata.height * 0.43)),
    };
    const [full, illustration] = await Promise.all([
      createDifferenceHash(normalizedCard),
      createDifferenceHash(normalizedCard, illustrationBounds),
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

async function createScannedArtworkHashes(
  image: Buffer
): Promise<ScannerArtworkHash[]> {
  const metadata = await sharp(image).metadata();
  if (!metadata.width || !metadata.height) return [];
  const trims = [
    { left: 0.025, top: 0.035, width: 0.95, height: 0.94 },
    { left: 0.04, top: 0.055, width: 0.92, height: 0.91 },
    { left: 0.06, top: 0.07, width: 0.88, height: 0.88 },
  ];
  const trimmedImages = await Promise.all(
    trims.map((trim) => {
      const left = Math.floor(metadata.width! * trim.left);
      const top = Math.floor(metadata.height! * trim.top);
      const width = Math.max(
        1,
        Math.min(
          metadata.width! - left,
          Math.floor(metadata.width! * trim.width)
        )
      );
      const height = Math.max(
        1,
        Math.min(
          metadata.height! - top,
          Math.floor(metadata.height! * trim.height)
        )
      );
      return sharp(image)
        .extract({ left, top, width, height })
        .png({ compressionLevel: 4 })
        .toBuffer();
    })
  );
  const hashes = await Promise.all(
    [image, ...trimmedImages].map(createScannerArtworkHash)
  );
  return hashes.filter((hash): hash is ScannerArtworkHash => hash != null);
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
    // De lokale image-cache eerst: vrijwel elke kandidaat staat al op schijf,
    // en dat maakt de artwork-vergelijking deterministisch in plaats van
    // afhankelijk van een netwerk-fetch met korte timeout.
    const cacheable = parseCacheableImageUrl(comparableUrl);
    if (cacheable) {
      try {
        const result = await ensureImageCached(cacheable);
        const image = result.buffer ?? (await readFile(result.imagePath));
        if (image.length > 0 && image.length <= 5_000_000) {
          return await createScannerArtworkHash(image);
        }
      } catch {
        // Val terug op de directe fetch hieronder.
      }
    }
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
  // Een mislukte hash niet permanent cachen: de volgende scan verdient een
  // nieuwe poging (tijdelijke netwerk-fout mag een kaart niet blijvend
  // uitsluiten van artwork-matching).
  void pending.then((hash) => {
    if (!hash && scannerArtworkHashCache.get(comparableUrl) === pending) {
      scannerArtworkHashCache.delete(comparableUrl);
    }
  });
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

async function recognizeFieldPass(worker: Worker, image: Buffer) {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      void worker.terminate().catch(() => undefined);
      reject(new Error("Scanner field OCR timed out."));
    }, FIELD_OCR_PASS_TIMEOUT_MS);
  });
  try {
    return await Promise.race([worker.recognize(image), timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

function getOcrWorker(): Promise<Worker> {
  ocrWorkerPromise ??= createOcrWorker().catch((error) => {
    ocrWorkerPromise = null;
    throw error;
  });
  return ocrWorkerPromise;
}

function getFieldOcrWorker(): Promise<Worker> {
  fieldOcrWorkerPromise ??= createOcrWorker().catch((error) => {
    fieldOcrWorkerPromise = null;
    throw error;
  });
  return fieldOcrWorkerPromise;
}

// Tesseract expects dark text on a light background, but modern cards print
// the set/number footer (and full-art names) in WHITE text on dark panels —
// the single biggest reason scans never produced a card number. "both" returns
// the dark-first polarity pair for critical zones; "auto" negates only when
// the crop is predominantly dark.
async function buildOcrPolarityVariants(
  image: Buffer,
  mode: "auto" | "both"
): Promise<Buffer[]> {
  try {
    const stats = await sharp(image).grayscale().stats();
    const mean = stats.channels[0]?.mean ?? 255;
    if (mode === "both") {
      const negated = await sharp(image).negate({ alpha: false }).toBuffer();
      return mean < 128 ? [negated, image] : [image, negated];
    }
    if (mean < 115) {
      return [await sharp(image).negate({ alpha: false }).toBuffer()];
    }
    return [image];
  } catch {
    return [image];
  }
}

// Kaartnummers op moderne kaarten zijn lichte outline-cijfers op een drukke
// achtergrond; gewone binarisatie (en zelfs negatie) leest ze niet. Het
// rood-kanaal + hoge threshold maakt de outline leesbaar als donker-op-licht,
// en een extra blur+threshold-pass vult de holle cijfers dicht tot massieve
// glyphs — empirisch de enige combinatie die "168/086"-voetregels oplevert.
async function buildFooterInkVariants(image: Buffer): Promise<Buffer[]> {
  const variants: Buffer[] = [];
  try {
    const channelImage = await sharp(image)
      .removeAlpha()
      .extractChannel(0)
      .normalize()
      .toBuffer();
    for (const threshold of [180, 215]) {
      const ink = await sharp(channelImage)
        .blur(0.6)
        .threshold(threshold)
        .negate({ alpha: false })
        .extend({
          top: 24,
          bottom: 24,
          left: 24,
          right: 24,
          background: "#ffffff",
        })
        .toBuffer();
      variants.push(ink);
      variants.push(await sharp(ink).blur(3.5).threshold(165).toBuffer());
    }
  } catch {
    // Bij een verwerkingsfout blijft alleen de originele zone over.
  }
  return variants;
}

// Zodra een expliciet kaartnummer in de OCR-tekst staat is elke verdere
// nummer-pass verspilde tijd: de referentie wordt daarna toch tegen de
// catalogus gevalideerd. Live reads moeten in seconden klaar zijn.
function containsExplicitCardReference(
  results: ReadonlyArray<{ data: { text: string } }>
): boolean {
  return (
    extractScannerCardReferences(
      results.map((item) => item.data.text).join("\n")
    ).length > 0
  );
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
  // The card number lives in the tiny footer corners (white-on-dark on modern
  // cards). Scan both bottom corners at high scale in both polarities — the
  // whitelist from the reference pass is still active.
  const footerTop = Math.floor(metadata.height * 0.86);
  const footerHeight = Math.max(1, metadata.height - footerTop);
  const footerHalfWidth = Math.max(1, Math.floor(metadata.width / 2));
  const footerStrips = await Promise.all(
    [0, footerHalfWidth].map((left) =>
      sharp(normalizedImage)
        .extract({
          left,
          top: footerTop,
          width: Math.min(footerHalfWidth, metadata.width - left),
          height: footerHeight,
        })
        .resize({ width: 1_600, withoutEnlargement: false })
        .sharpen({ sigma: 1.1 })
        .png({ compressionLevel: 4 })
        .toBuffer()
    )
  );
  const footerTexts: string[] = [];
  for (const strip of footerStrips) {
    for (const variant of await buildOcrPolarityVariants(strip, "both")) {
      const footerResult = await worker.recognize(variant);
      const trimmed = footerResult.data.text.trim();
      if (trimmed) footerTexts.push(trimmed);
    }
  }
  const text = [
    result.data.text.trim(),
    referenceResult.data.text.trim(),
    ...footerTexts,
  ]
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
  field: CardScannerField,
  scanRegion: "expected" | "focus"
): Promise<ScannerFieldOcrResult> {
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
    .normalize()
    .sharpen({ sigma: 1.05 })
    .png({ compressionLevel: 5 })
    .toBuffer();
  const metadata = await sharp(normalizedImage).metadata();
  const isFieldBandLayout =
    Boolean(metadata.width && metadata.height) &&
    (metadata.width ?? 0) / Math.max(1, metadata.height ?? 1) >= 1.55;
  const isCardShaped =
    Boolean(metadata.width && metadata.height) &&
    (metadata.height ?? 0) / Math.max(1, metadata.width ?? 1) >= 1.18;
  let fieldZones: Buffer[] = [];
  if (metadata.width && metadata.height) {
    const extractZone = async (bounds: {
      left: number;
      top: number;
      width: number;
      height: number;
    }) => {
      const left = Math.floor(metadata.width! * bounds.left);
      const top = Math.floor(metadata.height! * bounds.top);
      const width = Math.max(
        1,
        Math.min(
          metadata.width! - left,
          Math.floor(metadata.width! * bounds.width)
        )
      );
      const height = Math.max(
        1,
        Math.min(
          metadata.height! - top,
          Math.floor(metadata.height! * bounds.height)
        )
      );
      return sharp(normalizedImage)
        .extract({ left, top, width, height })
        .resize({ width: 1_400, withoutEnlargement: false })
        .normalize()
        .sharpen({ sigma: 1.1 })
        .extend({
          top: 18,
          bottom: 18,
          left: 18,
          right: 18,
          background: "#ffffff",
        })
        .png({ compressionLevel: 4 })
        .toBuffer();
    };

    if (isFieldBandLayout) {
      const hasStackedExpectedBands =
        scanRegion === "expected" && field !== "attack";
      if (hasStackedExpectedBands) {
        // The browser stacks two independent high-resolution search bands with
        // a 24px white gutter. Reading that collage as one page made Tesseract
        // merge the title/footer with unrelated text and then re-read only the
        // upper name band. Split them back into their original zones first.
        const gutter = Math.max(
          8,
          Math.round(metadata.width * (24 / 1_440))
        );
        const bandHeight = Math.floor((metadata.height - gutter) / 2);
        if (bandHeight > 0) {
          fieldZones = await Promise.all([
            extractZone({
              left: 0,
              top: 0,
              width: 1,
              height: bandHeight / metadata.height,
            }),
            extractZone({
              left: 0,
              top: (bandHeight + gutter) / metadata.height,
              width: 1,
              height: bandHeight / metadata.height,
            }),
          ]);
        }
      }
      if (fieldZones.length === 0) {
        fieldZones = [
          await extractZone({ left: 0, top: 0, width: 1, height: 1 }),
        ];
      }
    } else if (isCardShaped) {
      const expectedBounds =
        field === "name"
          ? { left: 0.03, top: 0.01, width: 0.9, height: 0.22 }
          : field === "number"
            ? { left: 0.015, top: 0.62, width: 0.97, height: 0.36 }
            : { left: 0.03, top: 0.4, width: 0.94, height: 0.42 };
      const focusBounds =
        field === "name"
          ? { left: 0.14, top: 0.42, width: 0.72, height: 0.16 }
          : field === "number"
            ? { left: 0.23, top: 0.43, width: 0.54, height: 0.14 }
            : { left: 0.08, top: 0.35, width: 0.84, height: 0.3 };
      const zoneBounds = [expectedBounds, focusBounds];
      fieldZones = await Promise.all(zoneBounds.map(extractZone));
      if (field === "number") {
        // Modern Pokemon promo/set references are printed in the tiny
        // lower-left footer. Crop that area straight from the ORIGINAL image
        // (single lanczos upscale) — the normalized pipeline's double resize
        // plus sharpen halos degrades the tiny digits beyond recognition.
        try {
          const sourceCard = await sharp(image, {
            limitInputPixels: 28_000_000,
            animated: false,
          })
            .rotate()
            .png({ compressionLevel: 4 })
            .toBuffer();
          const sourceMetadata = await sharp(sourceCard).metadata();
          if (sourceMetadata.width && sourceMetadata.height) {
            const footerTop = Math.floor(sourceMetadata.height * 0.89);
            fieldZones.push(
              await sharp(sourceCard)
                .extract({
                  left: Math.floor(sourceMetadata.width * 0.02),
                  top: footerTop,
                  width: Math.max(
                    1,
                    Math.floor(sourceMetadata.width * 0.55)
                  ),
                  height: Math.max(1, sourceMetadata.height - footerTop),
                })
                .resize({
                  width: 1_600,
                  withoutEnlargement: false,
                  kernel: "lanczos3",
                })
                .png({ compressionLevel: 4 })
                .toBuffer()
            );
          }
        } catch {
          // Zonder footer-crop blijven de twee standaardzones over.
        }
      }
    }
  }

  const worker = await getFieldOcrWorker();
  try {
    const results: Array<{
      data: { text: string; confidence: number };
    }> = [];
    const sourceImages =
      fieldZones.length > 0 ? [...fieldZones] : [normalizedImage];
    const focusResultIndex =
      !isFieldBandLayout && fieldZones.length >= 2 ? 1 : -1;
    for (const [sourceIndex, sourceImage] of sourceImages.entries()) {
      // Live requests contain one high-resolution expected or focus band.
      // Full-card fallback requests still contain a second centre crop.
      const isCentreFocusBand =
        isFieldBandLayout
          ? scanRegion === "focus"
          : sourceIndex === focusResultIndex;
      const isFooterNumberZone =
        !isFieldBandLayout &&
        field === "number" &&
        sourceImages.length >= 3 &&
        sourceIndex === sourceImages.length - 1;
      await worker.setParameters({
        tessedit_pageseg_mode:
          isFooterNumberZone
            ? PSM.SPARSE_TEXT
            : isFieldBandLayout && field === "attack"
              ? PSM.SINGLE_BLOCK
              : isCentreFocusBand
                ? PSM.SINGLE_LINE
              : PSM.SPARSE_TEXT,
        tessedit_char_whitelist:
          field === "number"
            ? "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/#- "
            : "",
        thresholding_method: isFooterNumberZone ? "0" : "2",
        user_defined_dpi: "300",
      });
      // Number footers are white-on-dark on modern cards; read the footer via
      // ink-extraction variants and other zones via polarity variants, merged
      // into one result so zone indices stay stable. Live band-crops krijgen
      // de ink-extractie ook op de onderste band: outline-voetregels waren in
      // het live pad anders net zo onleesbaar als vroeger in de full photo.
      const includeInkVariants =
        isFieldBandLayout &&
        field === "number" &&
        sourceIndex === sourceImages.length - 1;
      const polarityVariants = isFooterNumberZone
        ? [sourceImage, ...(await buildFooterInkVariants(sourceImage))]
        : [
            ...(await buildOcrPolarityVariants(
              sourceImage,
              field === "number" ? "both" : "auto"
            )),
            ...(includeInkVariants
              ? await buildFooterInkVariants(sourceImage)
              : []),
          ];
      const zoneResults: Array<{ data: { text: string; confidence: number } }> = [];
      for (const variant of polarityVariants) {
        zoneResults.push(await recognizeFieldPass(worker, variant));
        if (field === "number" && containsExplicitCardReference(zoneResults)) {
          break;
        }
      }
      results.push(
        zoneResults.length === 1
          ? zoneResults[0]
          : {
              data: {
                text: zoneResults
                  .map((zoneResult) => zoneResult.data.text.trim())
                  .filter(Boolean)
                  .join("\n"),
                confidence: Math.max(
                  ...zoneResults.map((zoneResult) => zoneResult.data.confidence ?? 0)
                ),
              },
            }
      );
      if (field === "number" && containsExplicitCardReference(results)) {
        break;
      }
    }

    const numberResolved =
      field === "number" && containsExplicitCardReference(results);
    const primaryImage = fieldZones[0] ?? normalizedImage;
    if (
      isFieldBandLayout &&
      !numberResolved &&
      metadata.width &&
      metadata.height
    ) {
      for (const zone of fieldZones) {
        const zoneMetadata = await sharp(zone).metadata();
        if (!zoneMetadata.width || !zoneMetadata.height) continue;
        const inset = scanRegion === "focus" ? 0.02 : 0.01;
        const left = Math.floor(zoneMetadata.width * inset);
        const top = Math.floor(zoneMetadata.height * inset);
        const width = Math.max(
          1,
          zoneMetadata.width - left - Math.floor(zoneMetadata.width * inset)
        );
        const height = Math.max(
          1,
          zoneMetadata.height - top - Math.floor(zoneMetadata.height * inset)
        );
        const guidedImage = await sharp(zone)
          .extract({ left, top, width, height })
          .resize({ width: 1_800, withoutEnlargement: false })
          .normalize()
          .sharpen({ sigma: 1.15 })
          .extend({
            top: 24,
            bottom: 24,
            left: 24,
            right: 24,
            background: "#ffffff",
          })
          .png({ compressionLevel: 4 })
          .toBuffer();
        await worker.setParameters({
          tessedit_pageseg_mode:
            field === "attack"
              ? PSM.SINGLE_BLOCK
              : field === "number" && scanRegion === "focus"
                ? PSM.RAW_LINE
                : field === "number"
                  ? PSM.SPARSE_TEXT
                  : PSM.SINGLE_LINE,
          tessedit_char_whitelist:
            field === "number"
              ? "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/#- "
              : "",
          thresholding_method: "0",
          user_defined_dpi: "300",
        });
        for (const variant of await buildOcrPolarityVariants(
          guidedImage,
          field === "number" ? "both" : "auto"
        )) {
          results.push(await recognizeFieldPass(worker, variant));
          if (field === "number" && containsExplicitCardReference(results)) {
            break;
          }
        }
        if (field === "number" && containsExplicitCardReference(results)) {
          break;
        }
      }
    } else if (!isFieldBandLayout) {
      if (field === "name") {
        await worker.setParameters({
          tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
          tessedit_char_whitelist: "",
        });
        results.push(await recognizeFieldPass(worker, primaryImage));
      } else if (field === "number") {
        if (!numberResolved) {
          const footerImage = fieldZones.at(-1) ?? primaryImage;
          const thresholdImage = await sharp(footerImage)
            .grayscale()
            .normalize()
            .threshold(120)
            .png({ compressionLevel: 4 })
            .toBuffer();
          // White-on-dark footers survive threshold() as white-on-black, which
          // Tesseract cannot read — scan the inverted variant as well.
          const invertedThresholdImage = await sharp(thresholdImage)
            .negate({ alpha: false })
            .png({ compressionLevel: 4 })
            .toBuffer();
          await worker.setParameters({
            tessedit_pageseg_mode: PSM.RAW_LINE,
            tessedit_char_whitelist:
              "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/#- ",
          });
          results.push(await recognizeFieldPass(worker, thresholdImage));
          if (!containsExplicitCardReference(results)) {
            results.push(
              await recognizeFieldPass(worker, invertedThresholdImage)
            );
          }
        }
      } else {
        await worker.setParameters({
          tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
          tessedit_char_whitelist: "",
        });
        results.push(await recognizeFieldPass(worker, primaryImage));
      }
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
      expectedText: isFieldBandLayout
        ? scanRegion === "expected"
          ? text
          : ""
        : results
            .filter((_, index) => index !== focusResultIndex)
            .map((result) => result.data.text.trim())
            .filter(Boolean)
            .join("\n"),
      focusText: isFieldBandLayout
        ? scanRegion === "focus"
          ? text
          : ""
        : focusResultIndex >= 0
          ? results[focusResultIndex]?.data.text.trim() ?? ""
          : "",
      confidence:
        confidences.length > 0
          ? Math.round(Math.max(...confidences) * 10) / 10
          : null,
    };
  } catch (error) {
    // A failed/terminated worker is never reused. The next live read receives
    // a fresh worker without poisoning the independent field queue.
    fieldOcrWorkerPromise = null;
    void worker.terminate().catch(() => undefined);
    throw error;
  }
}

async function recognizeScannerField(
  image: Buffer,
  field: CardScannerField,
  scanRegion: "expected" | "focus"
): Promise<ScannerFieldOcrResult> {
  const run = fieldOcrQueue.then(() =>
    recognizeScannerFieldUnsafe(image, field, scanRegion)
  );
  fieldOcrQueue = run.catch(() => undefined);
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

function getScannerNameFamily(value: string): string {
  return normalizeScannerText(value)
    .replace(/[-\s]+(?:break|ex|gx|lv x|v|vmax|vstar)$/i, "")
    .trim();
}

function narrowScannerCatalogByName(
  catalog: CardScannerCatalogCard[],
  knownName: string | null
): CardScannerCatalogCard[] {
  const knownFamily = getScannerNameFamily(knownName ?? "");
  if (!knownFamily) return catalog;
  const familyCards = catalog.filter(
    (card) => getScannerNameFamily(card.name) === knownFamily
  );
  return familyCards.length > 0 ? familyCards : catalog;
}

async function getVisualSimilarities(
  normalizedImage: Buffer,
  candidates: CardScannerCatalogCard[]
): Promise<Map<string, number>> {
  const scannedHashes = await createScannedArtworkHashes(normalizedImage);
  if (scannedHashes.length === 0) return new Map();

  const candidateHashes = await Promise.all(
    candidates.map(async (candidate) => ({
      id: candidate.id,
      hash: candidate.image_url ? await loadRemoteArtworkHash(candidate.image_url) : null,
    }))
  );

  return new Map(
    candidateHashes
      .map(
        ({ id, hash }) =>
          [
            id,
            Math.max(
              ...scannedHashes.map((scannedHash) =>
                getArtworkSimilarity(scannedHash, hash)
              )
            ),
          ] as const
      )
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
  const hasRememberedPrimaryIdentity = Boolean(
    input.knownName?.trim() && input.knownReference?.trim()
  );
  const shouldDetectName = !input.knownName?.trim();
  const shouldDetectNumber = !input.knownReference?.trim();
  const [normalizedImage, catalog, nameOcr, numberOcr] = await Promise.all([
    normalizeScanImage(input.image),
    loadScannerCatalog(input.game),
    shouldDetectName
      ? recognizeScannerField(input.image, "name", "expected")
      : Promise.resolve(null),
    // Het kaartnummer is de beslissende disambiguator tussen drukken van
    // dezelfde naam; zonder deze pass koos de scanner altijd alleen op naam.
    shouldDetectNumber
      ? recognizeScannerField(input.image, "number", "expected")
      : Promise.resolve(null),
  ]);
  let detectedName =
    input.knownName?.trim() ||
    getScannerNameObservation(catalog, nameOcr?.text ?? "")?.value ||
    null;
  let usedFullCardOcr = false;
  let ocr: OcrResult = {
    text: nameOcr?.text ?? "",
    confidence: nameOcr?.confidence ?? null,
    normalizedImage,
  };
  if (!detectedName) {
    usedFullCardOcr = true;
    ocr = await recognizeCardText(input.image);
    detectedName =
      getScannerNameObservation(catalog, ocr.text)?.value ?? null;
  }
  const rememberedText = [detectedName, input.knownReference]
    .filter((value): value is string => Boolean(value?.trim()))
    .join("\n");
  const combinedOcrText = [rememberedText, nameOcr?.text, numberOcr?.text, ocr.text]
    .filter(Boolean)
    .join("\n");
  // Naam-vernauwing plus alle kaarten met nummer-bewijs in de OCR-tekst: een
  // verkeerd gelezen naam (bv. de "Evolves from"-regel) mag de echte kaart
  // niet uit de kandidaten houden wanneer het kaartnummer wel gelezen is.
  const nameNarrowedCatalog = narrowScannerCatalogByName(catalog, detectedName);
  const numberEvidenceCards = filterScannerCardsByNumberEvidence(
    catalog,
    combinedOcrText
  );
  const candidateCatalog =
    numberEvidenceCards.length > 0
      ? [
          ...new Map(
            [...nameNarrowedCatalog, ...numberEvidenceCards].map((card) => [
              card.id,
              card,
            ])
          ).values(),
        ]
      : nameNarrowedCatalog;
  const confirmedReferences = input.knownReference
    ? [input.knownReference]
    : [];
  const initialRank = rankScannerCandidates(
    candidateCatalog,
    combinedOcrText,
    new Map(),
    new Map(),
    confirmedReferences
  );
  const strongestTextMatch = initialRank[0];
  const textMatchIsConclusive = Boolean(
    !rememberedText &&
    strongestTextMatch?.numberMatch === "exact" &&
      strongestTextMatch.nameSimilarity >= 0.82 &&
      strongestTextMatch.score - (initialRank[1]?.score ?? 0) >= 10
  );
  const analysisCandidateLimit = hasRememberedPrimaryIdentity
    ? 3
    : detectedName
      ? Math.min(40, candidateCatalog.length)
      : MAX_VISUAL_CANDIDATES;
  const visualCandidateCards = textMatchIsConclusive
    ? []
    : initialRank
        .slice(0, analysisCandidateLimit)
        .map((candidate) => candidate.card);
  const [visualSimilarities, attackSimilarities] = await Promise.all([
    visualCandidateCards.length > 0
      ? getVisualSimilarities(ocr.normalizedImage, visualCandidateCards)
      : Promise.resolve(new Map<string, number>()),
    getAttackSimilarities(
      input.knownAttackText || (usedFullCardOcr ? ocr.text : null),
      initialRank.slice(0, analysisCandidateLimit).map((candidate) => candidate.card)
    ),
  ]);
  const ranked = rankScannerCandidates(
    candidateCatalog,
    combinedOcrText,
    visualSimilarities,
    attackSimilarities,
    confirmedReferences
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
    const { runnerUpScore, allowVisualPrintingInference } =
      getScannerAutoAcceptContext(ranked, index);
    const runnerUpGap = Math.max(0, candidate.score - (runnerUpScore ?? 0));
    const autoAccept =
      index === 0 &&
      canAutoAcceptScannerCandidate(candidate, runnerUpScore, {
        allowVisualPrintingInference,
      });
    return {
      ...candidate.card,
      price: details?.prices[0]?.cm_en_lowest_nm ?? null,
      want_item: want
        ? {
            id: want.id,
            created_at: want.created_at.toISOString(),
          }
        : null,
      confidence: autoAccept
        ? "high"
        : getScannerCandidateConfidence(candidate, runnerUpScore),
      score: candidate.score,
      reasons: getScannerMatchReasons(candidate),
      autoAccept,
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
      strongestText: detectedName ?? getStrongestScannerText(ocr.text),
      ocrConfidence: ocr.confidence,
    },
  };
}

export async function readScannerFieldImage(input: {
  image: Buffer;
  game: TradingCardGame;
  field: CardScannerField;
  scanRegion?: "expected" | "focus";
  knownName?: string | null;
  knownReference?: string | null;
}): Promise<{
  field: CardScannerField;
  value: string | null;
  confidence: number | null;
  rawText: string | null;
  catalogMatches: number;
  observations: CardScannerFieldObservations;
}> {
  const [ocr, catalog] = await Promise.all([
    recognizeScannerField(
      input.image,
      input.field,
      input.scanRegion ?? "expected"
    ),
    loadScannerCatalog(input.game),
  ]);

  const normalizedKnownName = normalizeScannerText(input.knownName ?? "");
  const normalizedKnownReference = normalizeScannerCardReference(
    input.knownReference ?? ""
  );
  const matchingNameCatalog = normalizedKnownName
    ? catalog.filter(
        (card) => normalizeScannerText(card.name) === normalizedKnownName
      )
    : [];
  const numberCatalog =
    matchingNameCatalog.length > 0 ? matchingNameCatalog : catalog;
  const matchingReferenceCatalog = normalizedKnownReference
    ? catalog.filter((card) =>
        getScannerCardReferenceAliases(card).includes(
          normalizedKnownReference
        )
      )
    : [];
  const nameCatalog =
    matchingReferenceCatalog.length > 0 ? matchingReferenceCatalog : catalog;
  const nameObservation = [
    getScannerNameObservation(nameCatalog, ocr.expectedText),
    getScannerNameObservation(nameCatalog, ocr.focusText),
  ]
    .filter((observation) => observation != null)
    .sort((left, right) => right.confidence - left.confidence)[0];
  const numberObservation = getScannerNumberObservation(
    numberCatalog,
    input.field === "number" || input.scanRegion === "focus"
      ? ocr.text
      : "",
    {
      // A broad automatic band also contains HP and attack damage. Bare
      // numbers are safe only when the collector deliberately aims the small
      // Number target; automatic reads require a printed slash/promo code.
      allowBareLocalNumber: input.scanRegion === "focus",
    }
  );
  const observations: CardScannerFieldObservations = {};

  if (nameObservation) {
    observations.name = {
      value: nameObservation.value,
      confidence: nameObservation.confidence,
      catalogMatches: nameObservation.catalogMatches,
    };
  }
  if (numberObservation) {
    observations.number = {
      value: numberObservation.value,
      confidence:
        ocr.confidence == null
          ? numberObservation.confidence
          : Math.min(numberObservation.confidence, ocr.confidence),
      catalogMatches: numberObservation.catalogMatches,
    };
    const inferredName = getScannerNameFromUniqueReference(
      catalog,
      numberObservation.value
    );
    if (!observations.name && inferredName) {
      observations.name = inferredName;
    }
  }

  // Attack text is only saved after both primary identity fields point to the
  // same printing. This prevents one bad name fragment from cascading into a
  // convincing-looking but unrelated canonical attack.
  if (input.field !== "number" && input.knownName && input.knownReference) {
    const likelyCards = catalog
      .filter((card) => {
        const nameMatches =
          normalizedKnownName &&
          normalizeScannerText(card.name) === normalizedKnownName;
        const numberMatches =
          normalizedKnownReference &&
          getScannerCardReferenceAliases(card).includes(
            normalizedKnownReference
          );
        return Boolean(nameMatches && numberMatches);
      })
      .slice(0, 8);
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
      .filter(({ similarity }) => similarity >= 0.78)
      .sort((left, right) => right.similarity - left.similarity)
      .slice(0, 2);
    const value =
      canonicalMatches.length > 0
        ? canonicalMatches.map((match) => match.value).join(" · ").slice(0, 140)
        : null;

    if (value && (ocr.confidence ?? 0) >= 30) {
      observations.attack = {
        value,
        confidence: ocr.confidence,
        catalogMatches: likelyCards.length,
      };
    }
  }

  const requestedObservation = observations[input.field] ?? null;

  return {
    field: input.field,
    value: requestedObservation?.value ?? null,
    confidence: requestedObservation?.confidence ?? null,
    rawText: ocr.text.trim().slice(0, 280) || null,
    catalogMatches: requestedObservation?.catalogMatches ?? 0,
    observations,
  };
}
