export interface SealedSearchCandidate {
  name: string;
  episode: {
    name: string;
    code: string | null;
  };
}

const SEALED_QUERY_ALIASES: Record<string, readonly string[]> = {
  bab: ["build", "battle"],
  bb: ["booster", "box"],
  bbb: ["booster", "bundle"],
  bbs: ["build", "battle", "stadium"],
  etb: ["elite", "trainer", "box"],
  pc: ["pokemon", "center"],
  pcetb: ["pokemon", "center", "elite", "trainer", "box"],
  spc: ["super", "premium", "collection"],
  upc: ["ultra", "premium", "collection"],
};

export function normalizeSealedSearchText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Expands the shorthand collectors commonly use for sealed products. Keeping
 * this in one place makes the global search, Openings and origin picker agree.
 */
export function getSealedSearchTokens(query: string): string[] {
  const normalized = normalizeSealedSearchText(query);
  if (!normalized) return [];

  const tokens: string[] = [];
  for (const token of normalized.split(" ")) {
    const expanded = SEALED_QUERY_ALIASES[token] ?? [token];
    for (const value of expanded) {
      if (!tokens.includes(value)) tokens.push(value);
    }
  }
  return tokens;
}

function buildAcronyms(value: string): string[] {
  const words = normalizeSealedSearchText(value).split(" ").filter(Boolean);
  if (words.length < 2) return [];

  return [
    words.map((word) => word[0]).join(""),
    words.filter((word) => !["and", "of", "the"].includes(word)).map((word) => word[0]).join(""),
  ].filter((value, index, values) => value.length > 1 && values.indexOf(value) === index);
}

export function getSealedSearchScore(candidate: SealedSearchCandidate, query: string): number | null {
  const normalizedQuery = normalizeSealedSearchText(query);
  const queryTokens = getSealedSearchTokens(query);
  if (queryTokens.length === 0) return 0;

  const name = normalizeSealedSearchText(candidate.name);
  const episodeName = normalizeSealedSearchText(candidate.episode.name);
  const episodeCode = normalizeSealedSearchText(candidate.episode.code ?? "");
  const searchable = `${name} ${episodeName} ${episodeCode}`.trim();
  const compactQuery = normalizedQuery.replace(/\s+/g, "");
  const acronyms = [
    ...buildAcronyms(candidate.name),
    ...buildAcronyms(candidate.episode.name),
  ];

  if (
    queryTokens.some(
      (token) => !searchable.includes(token) && !acronyms.some((acronym) => acronym.includes(token))
    )
  ) {
    return null;
  }

  let score = 0;
  if (name === normalizedQuery || episodeName === normalizedQuery || episodeCode === normalizedQuery) {
    score += 1_200;
  } else if (
    name.startsWith(normalizedQuery) ||
    episodeName.startsWith(normalizedQuery) ||
    episodeCode.startsWith(normalizedQuery)
  ) {
    score += 900;
  } else if (name.includes(normalizedQuery) || episodeName.includes(normalizedQuery)) {
    score += 700;
  } else if (acronyms.includes(compactQuery)) {
    score += 650;
  }

  for (const token of queryTokens) {
    if (episodeCode === token) score += 180;
    else if (name.split(" ").includes(token)) score += 140;
    else if (episodeName.split(" ").includes(token)) score += 120;
    else if (name.includes(token)) score += 90;
    else if (episodeName.includes(token)) score += 75;
    else score += 45;
  }

  return score;
}

export function rankSealedSearchCandidates<T extends SealedSearchCandidate>(
  candidates: T[],
  query: string
): T[] {
  return candidates
    .map((candidate, index) => ({
      candidate,
      index,
      score: getSealedSearchScore(candidate, query),
    }))
    .filter(
      (entry): entry is { candidate: T; index: number; score: number } => entry.score != null
    )
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map((entry) => entry.candidate);
}
