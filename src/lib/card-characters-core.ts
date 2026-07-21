import {
  POKEMON_CHARACTER_SPRITES,
  TRAINER_CHARACTER_SPRITES,
} from "@/generated/card-characters.generated";

export type CardCharacterKind = "pokemon" | "trainer";

export interface CardCharacterMatch {
  kind: CardCharacterKind;
  name: string;
  slug: string;
  spritePath: string;
  pixelArt: boolean;
}

export interface CardCharacterInput {
  game?: string | null;
  name?: string | null;
  supertype?: string | null;
}

type IndexedCharacter = CardCharacterMatch & {
  normalizedName: string;
};

export interface CardCharacterSearchCandidate {
  match: "equals" | "startsWith" | "contains";
  value: string;
}

const NON_PERSON_TRAINER_SLUGS = new Set([
  "team-aqua",
  "team-galactic",
  "team-magma",
  "team-plasma",
  "team-rocket",
  "team-skull",
  "team-star",
  "team-yell",
]);

export function normalizeCharacterText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’‘`´]/g, "'")
    .replace(/♀/g, " female ")
    .replace(/♂/g, " male ")
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9']+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getWholeNameRange(
  value: string,
  candidate: string
): { start: number; end: number } | null {
  if (!value || !candidate) return null;
  const paddedValue = ` ${value} `;
  let index = paddedValue.indexOf(` ${candidate} `);
  if (index < 0) {
    index = paddedValue.indexOf(` ${candidate}'s `);
  }
  if (index < 0) return null;
  return { start: index, end: index + candidate.length };
}

const POKEMON_INDEX: IndexedCharacter[] = POKEMON_CHARACTER_SPRITES.map(
  ({ name, slug, asset }) => ({
    kind: "pokemon" as const,
    name,
    slug,
    spritePath: asset ?? "",
    pixelArt: true,
    normalizedName: normalizeCharacterText(name),
  })
).sort((left, right) => right.normalizedName.length - left.normalizedName.length);

const TRAINER_INDEX: IndexedCharacter[] = TRAINER_CHARACTER_SPRITES.map(
  ({ name, slug, pixelArt, asset }) => ({
    kind: "trainer" as const,
    name,
    slug,
    spritePath: asset ?? "",
    pixelArt,
    normalizedName: normalizeCharacterText(name),
  })
)
  .filter(
    (entry, index, entries) =>
      Boolean(entry.normalizedName) &&
      !NON_PERSON_TRAINER_SLUGS.has(entry.slug) &&
      entries.findIndex((candidate) => candidate.slug === entry.slug) === index
  )
  .sort((left, right) => right.normalizedName.length - left.normalizedName.length);

const CHARACTER_BY_ROUTE = new Map<string, IndexedCharacter>(
  [...POKEMON_INDEX, ...TRAINER_INDEX].map((entry) => [
    `${entry.kind}:${entry.slug}`,
    entry,
  ])
);

function getPossessiveOwner(normalizedCardName: string): string | null {
  const match = normalizedCardName.match(/^(.+?)'s(?:\s|$)/);
  return match?.[1]?.trim() || null;
}

interface TrainerTitleContext {
  normalizedTitle: string;
  possessiveOwner: string | null;
  parentheticalIdentities: Set<string>;
  connectorSegments: Set<string>;
}

function getTrainerTitleContext(cardName: string): TrainerTitleContext {
  const normalizedTitle = normalizeCharacterText(cardName);
  const parentheticalIdentities = new Set<string>();
  const connectorSegments = new Set<string>();

  for (const match of cardName.matchAll(/\(([^()]*)\)/g)) {
    const identity = normalizeCharacterText(match[1] ?? "");
    if (identity) parentheticalIdentities.add(identity);
  }

  // Normalization strips ampersands. Inspect the original title so a deliberate
  // pair such as `Red & Blue` cannot be confused with prose like `Red Card`.
  if (/\s(?:&|and)\s/i.test(cardName)) {
    for (const segment of cardName.split(/\s+(?:&|and)\s+/i)) {
      const normalizedSegment = normalizeCharacterText(segment);
      if (normalizedSegment) connectorSegments.add(normalizedSegment);
    }
  }

  return {
    normalizedTitle,
    possessiveOwner: getPossessiveOwner(normalizedTitle),
    parentheticalIdentities,
    connectorSegments,
  };
}

function isTrainerMatch(
  entry: IndexedCharacter,
  title: TrainerTitleContext
): boolean {
  return (
    title.normalizedTitle === entry.normalizedName ||
    title.possessiveOwner === entry.normalizedName ||
    title.parentheticalIdentities.has(entry.normalizedName) ||
    title.connectorSegments.has(entry.normalizedName)
  );
}

export function getCardCharacters(input: CardCharacterInput): CardCharacterMatch[] {
  if (input.game && input.game !== "pokemon") return [];

  const normalizedCardName = normalizeCharacterText(input.name ?? "");
  if (!normalizedCardName) return [];

  const trainerTitle = getTrainerTitleContext(input.name ?? "");
  const matches: CardCharacterMatch[] = [];
  const seen = new Set<string>();
  const pokemonRanges: Array<{ start: number; end: number }> = [];
  const trainerRanges: Array<{ start: number; end: number }> = [];

  for (const entry of POKEMON_INDEX) {
    const range = getWholeNameRange(normalizedCardName, entry.normalizedName);
    if (!range) continue;
    if (
      pokemonRanges.some(
        (accepted) => range.start >= accepted.start && range.end <= accepted.end
      )
    ) {
      continue;
    }
    const key = `${entry.kind}:${entry.slug}`;
    if (seen.has(key)) continue;
    seen.add(key);
    pokemonRanges.push(range);
    matches.push({
      kind: entry.kind,
      name: entry.name,
      slug: entry.slug,
      spritePath: entry.spritePath,
      pixelArt: entry.pixelArt,
    });
  }

  for (const entry of TRAINER_INDEX) {
    if (!isTrainerMatch(entry, trainerTitle)) {
      continue;
    }
    const range = getWholeNameRange(normalizedCardName, entry.normalizedName);
    if (
      range &&
      trainerRanges.some(
        (accepted) => range.start >= accepted.start && range.end <= accepted.end
      )
    ) {
      continue;
    }
    const key = `${entry.kind}:${entry.slug}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (range) trainerRanges.push(range);
    matches.push({
      kind: entry.kind,
      name: entry.name,
      slug: entry.slug,
      spritePath: entry.spritePath,
      pixelArt: entry.pixelArt,
    });
  }

  return matches.sort((left, right) => {
    if (left.kind !== right.kind) return left.kind === "pokemon" ? -1 : 1;
    return (
      normalizedCardName.indexOf(normalizeCharacterText(left.name)) -
      normalizedCardName.indexOf(normalizeCharacterText(right.name))
    );
  });
}

export function getCardCharacterBySlug(
  kind: string,
  slug: string
): CardCharacterMatch | null {
  if (kind !== "pokemon" && kind !== "trainer") return null;
  const entry = CHARACTER_BY_ROUTE.get(`${kind}:${slug.toLocaleLowerCase("en-US")}`);
  if (!entry) return null;
  return {
    kind: entry.kind,
    name: entry.name,
    slug: entry.slug,
    spritePath: entry.spritePath,
    pixelArt: entry.pixelArt,
  };
}

export function cardHasCharacter(
  input: CardCharacterInput,
  character: Pick<CardCharacterMatch, "kind" | "name">
): boolean {
  if (input.game && input.game !== "pokemon") return false;

  const normalizedCardName = normalizeCharacterText(input.name ?? "");
  const normalizedCharacterName = normalizeCharacterText(character.name);
  if (!normalizedCardName || !normalizedCharacterName) return false;

  if (character.kind === "pokemon") {
    return getCardCharacters(input).some(
      (match) => match.kind === "pokemon" && match.name === character.name
    );
  }

  return isTrainerMatch(
    {
      kind: "trainer",
      name: character.name,
      slug: "",
      spritePath: "",
      pixelArt: false,
      normalizedName: normalizedCharacterName,
    },
    getTrainerTitleContext(input.name ?? "")
  );
}

export function getCharacterSearchCandidates(
  character: CardCharacterMatch
): CardCharacterSearchCandidate[] {
  if (character.kind === "pokemon") {
    return [{ match: "contains", value: character.name }];
  }

  const name = character.name;
  return [
    { match: "equals", value: name },
    { match: "startsWith", value: `${name}'s` },
    { match: "startsWith", value: `${name}’s` },
    { match: "contains", value: `(${name})` },
    { match: "startsWith", value: `${name} & ` },
    { match: "startsWith", value: `${name} and ` },
    { match: "contains", value: ` & ${name}` },
    { match: "contains", value: ` and ${name}` },
  ];
}
