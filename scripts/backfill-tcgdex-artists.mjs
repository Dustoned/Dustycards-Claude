import Database from "better-sqlite3";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const API_BASE = "https://api.tcgdex.net/v2/en";
const BATCH_SIZE = 20;
const SET_ID_BY_LOCAL_CODE = new Map([["por", "me03"]]);
const SET_ID_BY_LOCAL_NAME = new Map([["perfect order", "me03"]]);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const db = new Database(resolve(__dirname, "../dustycards.db"));

const requestedCodes = new Set(
  process.argv
    .slice(2)
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
);

const setIdCache = new Map();
const cardCache = new Map();

function normalizeOptionalString(value) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function normalizeNumericString(value) {
  return /^\d+$/.test(value) ? String(Number(value)) : null;
}

function normalizeNameForMatch(value) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function namesMatch(left, right) {
  const normalizedLeft = normalizeOptionalString(left);
  const normalizedRight = normalizeOptionalString(right);

  if (!normalizedLeft || !normalizedRight) {
    return false;
  }

  return normalizeNameForMatch(normalizedLeft) === normalizeNameForMatch(normalizedRight);
}

function unwrapCollectionResponse(response) {
  return Array.isArray(response) ? response : response?.value ?? [];
}

function extractCardLocalId(cardId) {
  const normalizedId = normalizeOptionalString(cardId);
  if (!normalizedId) return null;

  const hyphenIndex = normalizedId.indexOf("-");
  return hyphenIndex === -1 ? normalizedId : normalizedId.slice(hyphenIndex + 1);
}

function buildLocalIdCandidates(value) {
  const normalizedValue = normalizeOptionalString(value);
  if (!normalizedValue) return [];

  const primary = normalizedValue.split("/")[0]?.trim() ?? normalizedValue;
  const compact = primary.replace(/\s+/g, "");
  const aliases = new Set([compact, compact.toUpperCase()]);
  const numeric = normalizeNumericString(compact);

  if (numeric) {
    aliases.add(numeric);
    aliases.add(numeric.padStart(3, "0"));
  }

  return [...aliases];
}

async function tcgdexFetch(path) {
  const response = await fetch(path.startsWith("http") ? path : `${API_BASE}${path}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`TCGdex API ${response.status}: ${path}`);
  }

  return response.json();
}

async function searchSetsByName(name) {
  const response = await tcgdexFetch(`/sets?name=${encodeURIComponent(name)}`);
  return unwrapCollectionResponse(response);
}

function pickBestSetMatch(matches, episode) {
  if (matches.length === 0) return null;

  const normalizedName = normalizeOptionalString(episode.name);
  let rankedMatches = normalizedName
    ? matches.filter((match) => namesMatch(match.name, normalizedName))
    : [];

  if (rankedMatches.length === 0) {
    rankedMatches = [...matches];
  }

  if (episode.card_count != null) {
    const totalMatches = rankedMatches.filter(
      (match) => match.cardCount?.total === episode.card_count
    );
    if (totalMatches.length > 0) {
      rankedMatches = totalMatches;
    }
  }

  return rankedMatches[0]?.id ?? null;
}

async function resolveSetIdForEpisode(episode) {
  const normalizedCode = normalizeOptionalString(episode.code)?.toLowerCase();
  if (normalizedCode && SET_ID_BY_LOCAL_CODE.has(normalizedCode)) {
    return SET_ID_BY_LOCAL_CODE.get(normalizedCode) ?? null;
  }

  const normalizedName = normalizeOptionalString(episode.name)?.toLowerCase();
  if (normalizedName && SET_ID_BY_LOCAL_NAME.has(normalizedName)) {
    return SET_ID_BY_LOCAL_NAME.get(normalizedName) ?? null;
  }

  if (!episode.name) {
    return null;
  }

  const cacheKey = `${normalizedCode ?? ""}|${normalizedName ?? ""}|${
    episode.card_count != null ? String(episode.card_count) : ""
  }`;
  if (!setIdCache.has(cacheKey)) {
    setIdCache.set(
      cacheKey,
      searchSetsByName(episode.name).then((matches) => pickBestSetMatch(matches, episode))
    );
  }

  return setIdCache.get(cacheKey);
}

async function fetchCardNullable(cardId) {
  if (!cardCache.has(cardId)) {
    cardCache.set(
      cardId,
      tcgdexFetch(`/cards/${encodeURIComponent(cardId)}`).catch((error) => {
        if (String(error?.message ?? "").includes("TCGdex API 404")) {
          return null;
        }

        cardCache.delete(cardId);
        throw error;
      })
    );
  }

  return cardCache.get(cardId);
}

async function resolveIllustratorForCard(setId, card) {
  const localIdSource = card.card_number ?? extractCardLocalId(card.tcgid);

  for (const localId of buildLocalIdCandidates(localIdSource)) {
    const tcgdexCard = await fetchCardNullable(`${setId}-${localId}`);
    if (!tcgdexCard?.illustrator) continue;
    if (tcgdexCard.name && !namesMatch(tcgdexCard.name, card.name)) continue;
    return tcgdexCard.illustrator;
  }

  return null;
}

async function main() {
  const episodeRows = db
    .prepare(
      `
        SELECT
          e.id AS episode_id,
          e.code,
          e.name,
          e.card_count,
          COUNT(*) AS missing
        FROM Card c
        JOIN Episode e ON e.id = c.episode_id
        WHERE c.artist IS NULL
        GROUP BY e.id
        ORDER BY missing DESC, e.name ASC
      `
    )
    .all()
    .filter((episode) =>
      requestedCodes.size === 0
        ? true
        : requestedCodes.has(String(episode.code ?? "").toLowerCase())
    );

  if (episodeRows.length === 0) {
    console.log("No episodes with missing artists matched the current filter.");
    return;
  }

  const updateArtist = db.prepare(
    `UPDATE Card SET artist = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND artist IS NULL`
  );
  const updateArtistBatch = db.transaction((rows) => {
    for (const row of rows) {
      updateArtist.run(row.illustrator, row.id);
    }
  });

  let updatedTotal = 0;
  let matchedEpisodes = 0;

  console.log(
    `Checking ${episodeRows.length} episode(s) with missing illustrator data${
      requestedCodes.size > 0 ? ` for ${[...requestedCodes].join(", ").toUpperCase()}` : ""
    }...`
  );

  for (const episode of episodeRows) {
    const setId = await resolveSetIdForEpisode(episode);
    if (!setId) {
      console.log(`- ${episode.name}: no TCGdex set match`);
      continue;
    }

    const cards = db
      .prepare(
        `
          SELECT id, name, card_number, tcgid
          FROM Card
          WHERE episode_id = ? AND artist IS NULL
          ORDER BY
            CASE WHEN card_number GLOB '[0-9]*' THEN CAST(card_number AS INTEGER) ELSE 999999 END,
            card_number ASC,
            name ASC
        `
      )
      .all(episode.episode_id);

    const rowsToUpdate = [];

    for (let index = 0; index < cards.length; index += BATCH_SIZE) {
      const batch = cards.slice(index, index + BATCH_SIZE);
      const matches = await Promise.all(
        batch.map(async (card) => {
          const illustrator = await resolveIllustratorForCard(setId, card);
          return illustrator ? { id: card.id, illustrator } : null;
        })
      );

      for (const match of matches) {
        if (match) {
          rowsToUpdate.push(match);
        }
      }
    }

    if (rowsToUpdate.length > 0) {
      updateArtistBatch(rowsToUpdate);
      updatedTotal += rowsToUpdate.length;
      matchedEpisodes += 1;
    }

    console.log(
      `- ${episode.name} (${episode.code ?? "no-code"}): ${rowsToUpdate.length}/${cards.length} filled`
    );
  }

  console.log(
    `Done. Updated ${updatedTotal} card(s) across ${matchedEpisodes} episode(s).`
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
