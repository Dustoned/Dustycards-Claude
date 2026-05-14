import "dotenv/config";
import Database from "better-sqlite3";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const GAME = "one-piece";
const DEFAULT_OPTCG_URL = "https://optcgapi.com/api/allSetCards/";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const LIVE_DB_PATH = resolve(__dirname, "../dustycards.db");
const SNAPSHOT_DB_PATH = resolve(__dirname, "../data/dustycards.app.db");

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, value = "true"] = arg.replace(/^--/, "").split("=");
    return [key, value];
  })
);

const dryRun = args.has("dry-run");
const apiUrl = args.get("url") ?? DEFAULT_OPTCG_URL;
const MANGA_RARE_LABEL = "Manga Rare";

const RARITY_LABELS = new Map([
  ["C", "Common"],
  ["UC", "Uncommon"],
  ["R", "Rare"],
  ["SR", "Super Rare"],
  ["SEC", "Secret Rare"],
  ["L", "Leader"],
  ["PR", "Promo"],
  ["TR", "Treasure Rare"],
]);

const VARIANT_RULES = [
  {
    label: MANGA_RARE_LABEL,
    match: (card) => hasOptcgTag(card, "Manga"),
    minLocalValue: 50,
    maxPriceRatio: 4.5,
  },
  {
    label: "Special Rare",
    match: (card) =>
      hasAnyOptcgTag(card, [
        "SP",
        "SPR",
        "Wanted Poster",
        "Gold",
        "Super Alternate Art",
        "Red Super Alternate Art",
      ]),
    minLocalValue: 2,
    maxPriceRatio: 7,
  },
  {
    label: "Treasure Rare",
    match: (card) => rarityLabel(card.rarity) === "Treasure Rare" || hasOptcgTag(card, "TR"),
    minLocalValue: 0,
    maxPriceRatio: 12,
  },
  {
    label: "Alternate Art",
    match: (card) => hasAnyOptcgTag(card, ["Alternate Art", "Parallel", "Full Art"]),
    minLocalValue: 0,
    maxPriceRatio: 10,
  },
];

function ensureLiveDb() {
  if (existsSync(LIVE_DB_PATH)) return;
  if (!existsSync(SNAPSHOT_DB_PATH)) {
    throw new Error(`No database found at ${LIVE_DB_PATH} or ${SNAPSHOT_DB_PATH}`);
  }

  mkdirSync(dirname(LIVE_DB_PATH), { recursive: true });
  copyFileSync(SNAPSHOT_DB_PATH, LIVE_DB_PATH);
}

function normalizeCardNumber(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";

  return raw
    .replace(/\s+/g, "")
    .replace(/^([A-Z]+)-(\d{1,2})-/i, (_, prefix, number) => {
      if (prefix.toUpperCase() === "P") return `P-`;
      return `${prefix.toUpperCase()}${number.padStart(2, "0")}-`;
    })
    .replace(/^([A-Z]+)(\d{1,2})-/i, (_, prefix, number) => `${prefix.toUpperCase()}${number.padStart(2, "0")}-`)
    .toUpperCase();
}

function extractCardNumberFromImageId(value) {
  const text = String(value ?? "").trim();
  const match = /^((?:OP|ST|EB|PRB)\d{1,2}|P)[-_]?(\d{3,4})/i.exec(text);
  if (!match) return "";

  const prefix = normalizeOnePiecePrefix(match[1]);
  return `${prefix}-${match[2].toUpperCase()}`;
}

function normalizeOnePiecePrefix(value) {
  const raw = String(value ?? "").trim().replace(/[-_\s]+/g, "").toUpperCase();
  const match = /^(OP|ST|EB|PRB)(\d{1,2})$/.exec(raw);
  if (!match) return raw;
  return `${match[1]}${match[2].padStart(2, "0")}`;
}

function optcgCardNumber(card) {
  return extractCardNumberFromImageId(card.card_image_id) || normalizeCardNumber(card.card_set_id);
}

function cleanNullable(value) {
  const text = String(value ?? "").trim();
  if (!text || text.toLowerCase() === "null") return null;
  return text;
}

function rarityLabel(value) {
  const code = cleanNullable(value)?.toUpperCase();
  if (!code) return null;
  return RARITY_LABELS.get(code) ?? code;
}

function normalizeSourceRarity(value) {
  const clean = cleanNullable(value);
  if (!clean) return null;

  const lower = clean.toLowerCase();
  if (lower === "rare") return "Rare";
  if (clean === "R") return "Rare";
  if (clean === "C") return "Common";
  if (clean === "UC") return "Uncommon";
  if (clean === "SR" || clean === "SUPER RARE") return "Super Rare";
  if (clean === "SEC" || clean === "SECRET RARE") return "Secret Rare";
  if (clean === "L" || clean === "LEADER") return "Leader";
  if (clean === "PR") return "Promo";
  if (clean === "TR") return "Treasure Rare";
  return clean;
}

function chooseRarity(currentRarity, optcgRarity) {
  return rarityLabel(optcgRarity) ?? normalizeSourceRarity(currentRarity);
}

function normalizeType(value) {
  const type = cleanNullable(value);
  if (!type) return null;

  const lower = type.toLowerCase();
  if (lower === "leader") return "Leader";
  if (lower === "character") return "Character";
  if (lower === "event") return "Event";
  if (lower === "stage") return "Stage";
  return type;
}

async function fetchOptcgCards() {
  const response = await fetch(apiUrl, {
    headers: { accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`OPTCG API ${response.status}: ${await response.text()}`);
  }

  const payload = await response.json();
  const cards = Array.isArray(payload) ? payload : payload.value;
  if (!Array.isArray(cards)) {
    throw new Error("OPTCG API response did not contain a card list.");
  }

  return cards;
}

function isParallelName(card) {
  return /\bparallel\b/i.test(String(card.card_name ?? ""));
}

function optcgTags(card) {
  return [...String(card.card_name ?? "").matchAll(/\(([^)]+)\)/g)].map((match) =>
    match[1].trim()
  );
}

function normalizeTag(value) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function hasOptcgTag(card, tag) {
  const normalizedTag = normalizeTag(tag);
  return optcgTags(card).some((candidate) => normalizeTag(candidate) === normalizedTag);
}

function hasAnyOptcgTag(card, tags) {
  return tags.some((tag) => hasOptcgTag(card, tag));
}

function buildOptcgIndex(cards) {
  const index = new Map();

  for (const card of cards) {
    const key = optcgCardNumber(card);
    if (!key) continue;

    const existing = index.get(key);
    if (!existing || (isParallelName(existing) && !isParallelName(card))) {
      index.set(key, card);
    }
  }

  return index;
}

function currentLocalValue(card) {
  const values = [card.cm_en_lowest_nm, card.tcp_market]
    .map((value) => (typeof value === "number" && Number.isFinite(value) ? value : null))
    .filter((value) => value != null && value > 0);

  return values[0] ?? null;
}

function priceDistance(localValue, targetValue) {
  if (!localValue || !targetValue) return Number.POSITIVE_INFINITY;
  return Math.abs(Math.log(localValue / targetValue));
}

function priceRatio(localValue, targetValue) {
  if (!localValue || !targetValue) return Number.POSITIVE_INFINITY;
  return Math.max(localValue / targetValue, targetValue / localValue);
}

function buildVariantRarityMap(optcgCards, localCards) {
  const localByNumber = new Map();

  for (const card of localCards) {
    const key = normalizeCardNumber(card.card_number);
    if (!key) continue;

    const cards = localByNumber.get(key) ?? [];
    cards.push(card);
    localByNumber.set(key, cards);
  }

  const usedIds = new Set();
  const variantRarities = new Map();

  for (const rule of VARIANT_RULES) {
    const entries = optcgCards
      .filter(rule.match)
      .sort((a, b) => (b.market_price ?? 0) - (a.market_price ?? 0));

    for (const entry of entries) {
      const targetPrice =
        typeof entry.market_price === "number" && Number.isFinite(entry.market_price)
          ? entry.market_price
          : null;
      const candidates = (localByNumber.get(optcgCardNumber(entry)) ?? [])
        .filter((card) => !usedIds.has(card.id))
        .map((card) => {
          const value = currentLocalValue(card);
          return {
            card,
            value,
            distance: priceDistance(value, targetPrice),
            ratio: priceRatio(value, targetPrice),
          };
        })
        .sort((a, b) => a.distance - b.distance);

      const best = candidates[0];
      if (!best || best.value == null || targetPrice == null) continue;

      if (best.value >= rule.minLocalValue && best.ratio <= rule.maxPriceRatio) {
        usedIds.add(best.card.id);
        variantRarities.set(best.card.id, rule.label);
      }
    }
  }

  return variantRarities;
}

ensureLiveDb();

const db = new Database(LIVE_DB_PATH);
db.pragma("foreign_keys = ON");

try {
  const optcgCards = await fetchOptcgCards();
  const optcgByNumber = buildOptcgIndex(optcgCards);
  const localCards = db.prepare(`
    SELECT
      c.id,
      c.name,
      c.card_number,
      c.rarity,
      c.supertype,
      c.subtypes,
      p.cm_en_lowest_nm,
      p.tcp_market
    FROM "Card" c
    LEFT JOIN "Price" p ON p.id = (
      SELECT id
      FROM "Price"
      WHERE card_id = c.id
      ORDER BY fetched_at DESC, id DESC
      LIMIT 1
    )
    WHERE c.game = ?
  `).all(GAME);
  const variantRarities = buildVariantRarityMap(optcgCards, localCards);
  const variantCounts = {};
  for (const label of variantRarities.values()) {
    variantCounts[label] = (variantCounts[label] ?? 0) + 1;
  }

  const updates = [];
  const unmatched = [];

  for (const card of localCards) {
    const optcg = optcgByNumber.get(normalizeCardNumber(card.card_number));
    if (!optcg) {
      unmatched.push(card);
      continue;
    }

    const nextRarity = variantRarities.get(card.id) ?? chooseRarity(card.rarity, optcg.rarity);
    const nextSupertype = normalizeType(optcg.card_type) ?? card.supertype ?? null;
    const nextSubtypes = cleanNullable(optcg.sub_types) ?? card.subtypes ?? null;

    if (
      nextRarity !== (card.rarity ?? null) ||
      nextSupertype !== (card.supertype ?? null) ||
      nextSubtypes !== (card.subtypes ?? null)
    ) {
      updates.push({
        id: card.id,
        rarity: nextRarity,
        supertype: nextSupertype,
        subtypes: nextSubtypes,
        before: {
          rarity: card.rarity,
          supertype: card.supertype,
          subtypes: card.subtypes,
        },
      });
    }
  }

  console.log(
    `OPTCG metadata: ${optcgCards.length} source rows, ${optcgByNumber.size} unique card numbers, ${localCards.length} local cards, ${updates.length} updates, ${unmatched.length} unmatched${dryRun ? " (dry-run)" : ""}.`
  );
  console.log("Variant buckets:", variantCounts);

  if (unmatched.length > 0) {
    console.log(
      `Unmatched examples: ${unmatched
        .slice(0, 12)
        .map((card) => `${card.card_number ?? "--"} ${card.name}`)
        .join("; ")}`
    );
  }

  if (!dryRun && updates.length > 0) {
    const updateCard = db.prepare(`
      UPDATE "Card"
      SET rarity = @rarity,
          supertype = @supertype,
          subtypes = @subtypes,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = @id
    `);

    const writeUpdates = db.transaction((rows) => {
      for (const row of rows) {
        updateCard.run({
          id: row.id,
          rarity: row.rarity,
          supertype: row.supertype,
          subtypes: row.subtypes,
        });
      }
    });

    writeUpdates(updates);

    const byRarity = new Map();
    const byType = new Map();
    for (const row of updates) {
      byRarity.set(
        row.rarity ?? "Unclassified",
        (byRarity.get(row.rarity ?? "Unclassified") ?? 0) + 1
      );
      byType.set(
        row.supertype ?? "Unclassified",
        (byType.get(row.supertype ?? "Unclassified") ?? 0) + 1
      );
    }

    console.log("Updated rarity buckets:", Object.fromEntries(byRarity));
    console.log("Updated card types:", Object.fromEntries(byType));
  }
} finally {
  db.close();
}
