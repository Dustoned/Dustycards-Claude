import Database from "better-sqlite3";

const DB_PATH = process.env.DATABASE_URL?.startsWith("file:")
  ? process.env.DATABASE_URL.slice("file:".length)
  : "dustycards.db";
const TCGDEX_API_BASE = "https://api.tcgdex.net/v2/en";
const REQUEST_TIMEOUT_MS = 15_000;
const DIRECT_SET_IDS = new Map([
  ["por", "me03"],
  ["perfect order", "me03"],
]);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeString(value) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized || null;
}

function normalizeLookup(value) {
  return normalizeString(value)?.toLowerCase() ?? null;
}

function normalizeName(value) {
  return normalizeString(value)
    ?.normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "") ?? "";
}

function namesMatch(left, right) {
  return normalizeName(left) === normalizeName(right);
}

function normalizeCardNumber(value) {
  const normalized = normalizeString(value)?.replace(/^#+/, "") ?? null;
  return normalized || null;
}

function getCardNumberPrefix(value) {
  const normalized = normalizeCardNumber(value);
  if (!normalized || normalized.includes("/") || normalized.includes("-")) return null;
  const match = /^([A-Za-z]+)(\d+)$/.exec(normalized);
  return match?.[1].toUpperCase() ?? null;
}

function getCardNumberNumericValue(value) {
  const normalized = normalizeCardNumber(value);
  if (!normalized) return null;
  const primary = normalized.split("/")[0]?.trim() ?? normalized;
  if (/^\d+$/.test(primary)) return Number(primary);
  const prefixed = /^([A-Za-z]+)(\d+)$/.exec(primary);
  return prefixed ? Number(prefixed[2]) : null;
}

function buildPrintedCardNumber(cardNumber, officialCount, prefixedCount) {
  const normalized = normalizeCardNumber(cardNumber);
  if (!normalized) return null;
  if (normalized.includes("/") || normalized.includes("-")) return normalized;

  if (/^\d+$/.test(normalized)) {
    return officialCount && officialCount > 0 ? `${normalized}/${officialCount}` : normalized;
  }

  const prefixed = /^([A-Za-z]+)(\d+)$/.exec(normalized);
  if (prefixed && prefixedCount && prefixedCount > 0) {
    const prefix = prefixed[1].toUpperCase();
    return `${prefix}${prefixed[2]}/${prefix}${prefixedCount}`;
  }

  return normalized;
}

async function fetchJson(path) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(
      path.startsWith("http") ? path : `${TCGDEX_API_BASE}${path}`,
      { signal: controller.signal }
    );
    if (!response.ok) {
      throw new Error(`TCGdex API ${response.status}: ${path}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function unwrapCollection(response) {
  return Array.isArray(response) ? response : response?.value ?? [];
}

function directSetIdForEpisode(episode) {
  const code = normalizeLookup(episode.code);
  if (code && DIRECT_SET_IDS.has(code)) return DIRECT_SET_IDS.get(code);

  const name = normalizeLookup(episode.name);
  if (name && DIRECT_SET_IDS.has(name)) return DIRECT_SET_IDS.get(name);

  return null;
}

async function findTcgdexSet(episode) {
  const direct = directSetIdForEpisode(episode);
  if (direct) return direct;

  const name = normalizeString(episode.name);
  if (!name) return null;

  const matches = unwrapCollection(
    await fetchJson(`/sets?name=${encodeURIComponent(name)}`)
  );
  if (matches.length === 0) return null;

  let ranked = matches.filter((match) => namesMatch(match.name, name));
  if (ranked.length === 0) ranked = matches;

  if (episode.card_count != null) {
    const totalMatches = ranked.filter((match) => match.cardCount?.total === episode.card_count);
    if (totalMatches.length > 0) ranked = totalMatches;
  }

  return ranked[0]?.id ?? null;
}

async function getOfficialCardCount(episode) {
  const setId = await findTcgdexSet(episode);
  if (!setId) return null;

  const set = await fetchJson(`/sets/${encodeURIComponent(setId)}`);
  const official = set.cardCount?.official ?? null;
  return typeof official === "number" && Number.isFinite(official) && official > 0
    ? official
    : null;
}

function buildPrefixMaxByEpisode(cards) {
  const byEpisode = new Map();

  for (const card of cards) {
    const prefix = getCardNumberPrefix(card.card_number);
    if (!prefix) continue;
    const value = getCardNumberNumericValue(card.card_number);
    if (!value) continue;
    const key = `${card.episode_id}:${prefix}`;
    byEpisode.set(key, Math.max(byEpisode.get(key) ?? 0, value));
  }

  return byEpisode;
}

async function main() {
  const db = new Database(DB_PATH);
  const dryRun = process.argv.includes("--dry-run");
  const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.slice("--limit=".length)) : null;

  const episodes = db.prepare(`
    SELECT id, game, name, code, card_count, printed_card_count
    FROM Episode
    WHERE game = 'pokemon'
    ORDER BY release_date DESC, name ASC
    ${limit && Number.isFinite(limit) ? `LIMIT ${Math.max(1, Math.floor(limit))}` : ""}
  `).all();

  const cards = db.prepare(`
    SELECT id, episode_id, card_number, printed_card_number
    FROM Card
    WHERE game = 'pokemon'
  `).all();
  const prefixMaxByEpisode = buildPrefixMaxByEpisode(cards);
  const cardsByEpisode = new Map();

  for (const card of cards) {
    const list = cardsByEpisode.get(card.episode_id) ?? [];
    list.push(card);
    cardsByEpisode.set(card.episode_id, list);
  }

  const updateEpisode = db.prepare(`
    UPDATE Episode
    SET printed_card_count = ?
    WHERE id = ?
  `);
  const updateCard = db.prepare(`
    UPDATE Card
    SET printed_card_number = ?
    WHERE id = ?
  `);

  let resolvedEpisodes = 0;
  let updatedEpisodes = 0;
  let updatedCards = 0;
  let skippedEpisodes = 0;

  for (const episode of episodes) {
    let officialCount = episode.printed_card_count ?? null;

    if (!officialCount) {
      try {
        officialCount = await getOfficialCardCount(episode);
        await sleep(80);
      } catch (error) {
        console.warn(`Could not resolve printed count for ${episode.name}: ${error.message}`);
      }
    }

    if (!officialCount) {
      skippedEpisodes += 1;
      continue;
    }

    resolvedEpisodes += 1;
    const episodeCards = cardsByEpisode.get(episode.id) ?? [];
    const cardUpdates = [];

    for (const card of episodeCards) {
      const prefix = getCardNumberPrefix(card.card_number);
      const prefixedCount = prefix ? prefixMaxByEpisode.get(`${episode.id}:${prefix}`) ?? null : null;
      const printedNumber = buildPrintedCardNumber(card.card_number, officialCount, prefixedCount);
      if (printedNumber === card.printed_card_number) continue;
      cardUpdates.push({ id: card.id, printedNumber });
    }

    if (dryRun) {
      if (officialCount !== episode.printed_card_count) updatedEpisodes += 1;
      updatedCards += cardUpdates.length;
      continue;
    }

    db.transaction(() => {
      if (officialCount !== episode.printed_card_count) {
        updateEpisode.run(officialCount, episode.id);
        updatedEpisodes += 1;
      }
      for (const update of cardUpdates) {
        updateCard.run(update.printedNumber, update.id);
      }
      updatedCards += cardUpdates.length;
    })();
  }

  console.log(JSON.stringify({
    dryRun,
    episodes: episodes.length,
    resolvedEpisodes,
    skippedEpisodes,
    updatedEpisodes,
    updatedCards,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
