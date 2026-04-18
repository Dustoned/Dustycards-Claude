const TCGDEX_CARDS_ENDPOINT = "https://api.tcgdex.net/v2/en/cards";
const HIGH_RES_IMAGE_SUFFIX = "/high.webp";
const IMAGE_REVALIDATE_SECONDS = 60 * 60 * 24;

interface TcgdexCardBrief {
  id: string;
  image?: string | null;
}

type TcgdexImageLookup = Map<string, string>;

let tcgdexImageLookupPromise: Promise<TcgdexImageLookup> | null = null;

function normalizeLookupKey(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeNumericString(value: string): string | null {
  return /^\d+$/.test(value) ? String(Number(value)) : null;
}

function buildHighResImageUrl(imageBase: string | null | undefined): string | null {
  return imageBase ? `${imageBase}${HIGH_RES_IMAGE_SUFFIX}` : null;
}

function buildLocalIdAliases(localId: string): string[] {
  const aliases = new Set([localId]);
  const numeric = normalizeNumericString(localId);
  if (numeric) {
    aliases.add(numeric);
    aliases.add(numeric.padStart(3, "0"));
  }
  return [...aliases];
}

function buildSetIdAliases(setId: string, localId: string): string[] {
  const aliases = new Set([setId]);

  const svTwoDigit = setId.match(/^sv(\d{2})$/);
  if (svTwoDigit) {
    aliases.add(`sv${Number(svTwoDigit[1])}`);
  }

  const svSingleDigit = setId.match(/^sv(\d)$/);
  if (svSingleDigit) {
    aliases.add(`sv0${svSingleDigit[1]}`);
  }

  const svHalf = setId.match(/^sv(\d{2})\.5$/);
  if (svHalf) {
    aliases.add(`sv${Number(svHalf[1])}pt5`);
  }

  const meStandard = setId.match(/^me(\d{2})$/);
  if (meStandard) {
    aliases.add(`me${Number(meStandard[1])}`);
  }

  const meHalf = setId.match(/^me(\d{2})\.5$/);
  if (meHalf) {
    aliases.add(`me${Number(meHalf[1])}pt5`);
  }

  const swshHalf = setId.match(/^swsh(\d+)\.5$/);
  if (swshHalf) {
    aliases.add(`swsh${swshHalf[1]}pt5`);
    aliases.add(`swsh${swshHalf[1]}5`);
    aliases.add("swsh45");
    if (localId.startsWith("sv")) {
      aliases.add("swsh45sv");
    }
  }

  const smHalf = setId.match(/^sm(\d+)\.5$/);
  if (smHalf) {
    aliases.add(`sm${smHalf[1]}5`);
  }

  if (setId === "me03") {
    aliases.add("por");
  }

  if (setId === "sv10.5w") {
    aliases.add("rsv10pt5");
  }

  if (setId === "sv10.5b") {
    aliases.add("zsv10pt5");
  }

  if (setId === "lc") {
    aliases.add("base6");
  }

  if (/^swsh\d+$/.test(setId) && /^tg\d+/i.test(localId)) {
    aliases.add(`${setId}tg`);
  }

  if (setId === "swsh12.5" && /^gg\d+/i.test(localId)) {
    aliases.add("swsh12pt5gg");
  }

  return [...aliases];
}

function buildCardIdAliases(cardId: string): string[] {
  const normalizedId = normalizeLookupKey(cardId);
  const hyphenIndex = normalizedId.indexOf("-");

  if (hyphenIndex === -1) {
    return [normalizedId];
  }

  const setId = normalizedId.slice(0, hyphenIndex);
  const localId = normalizedId.slice(hyphenIndex + 1);
  const aliases = new Set([normalizedId]);

  for (const setAlias of buildSetIdAliases(setId, localId)) {
    for (const localAlias of buildLocalIdAliases(localId)) {
      aliases.add(`${setAlias}-${localAlias}`);
    }
  }

  return [...aliases];
}

async function loadTcgdexImageLookup(): Promise<TcgdexImageLookup> {
  const response = await fetch(TCGDEX_CARDS_ENDPOINT, {
    next: { revalidate: IMAGE_REVALIDATE_SECONDS },
  });

  if (!response.ok) {
    throw new Error(`TCGdex API ${response.status}: ${TCGDEX_CARDS_ENDPOINT}`);
  }

  const cards = (await response.json()) as TcgdexCardBrief[];
  const lookup: TcgdexImageLookup = new Map();

  for (const card of cards) {
    const imageUrl = buildHighResImageUrl(card.image);
    if (!imageUrl) continue;

    for (const alias of buildCardIdAliases(card.id)) {
      if (!lookup.has(alias)) {
        lookup.set(alias, imageUrl);
      }
    }
  }

  return lookup;
}

export async function getTcgdexImageLookup(): Promise<TcgdexImageLookup> {
  if (!tcgdexImageLookupPromise) {
    tcgdexImageLookupPromise = loadTcgdexImageLookup().catch((error) => {
      console.error("Failed to load TCGdex image lookup", error);
      tcgdexImageLookupPromise = null;
      return new Map();
    });
  }

  return tcgdexImageLookupPromise;
}

export function resolveTcgdexImageUrl(
  cardId: string | null | undefined,
  lookup: ReadonlyMap<string, string>
): string | null {
  if (!cardId) return null;
  return lookup.get(normalizeLookupKey(cardId)) ?? null;
}
