type CatalogSet = { name: string; release_date: string | null };
type RevealRelease = { episodeName: string | null; releaseDate: string | null };

function normalize(value: string): string {
  return value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()
    .replace(/&(?:amp;)?/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
}

// Promo series receive new cards long after the series started. Their launch
// date cannot establish the release date of an individual promo.
function isPromoSeries(name: string): boolean {
  return /\bpromos?\b/i.test(name);
}

export function createUpcomingCatalogPolicy(sets: CatalogSet[], today: string) {
  const byName = new Map<string, CatalogSet[]>();
  for (const set of sets) {
    if (!set.release_date || isPromoSeries(set.name)) continue;
    const key = normalize(set.name);
    if (!key) continue;
    byName.set(key, [...(byName.get(key) ?? []), set]);
  }

  function namesInTitle(title: string): string[] {
    const text = ` ${normalize(title)} `;
    // Short codes and generic single words are not reliable set references
    // in prose. Exact gallery names can still match those sets.
    const names = [...byName.keys()].filter((name) => name.includes(" ") && text.includes(` ${name} `));
    return names.filter((name) => !names.some((other) => other !== name && other.includes(name)));
  }

  function catalogDate(name: string | null): string | null {
    const key = name ? normalize(name) : "";
    const namedSets = name ? namesInTitle(name) : [];
    const matches = byName.get(key) ?? namedSets.flatMap((setName) => byName.get(setName) ?? []);
    if (!matches?.length) return null;
    // Duplicate catalog editions can have distinct release dates. Do not
    // expire an upcoming edition because another edition is already out.
    return matches.map((set) => set.release_date!).sort().at(-1)!;
  }

  function releaseDate(reveal: RevealRelease): string | null {
    if (isPromoSeries(reveal.episodeName ?? "")) return reveal.releaseDate;
    return catalogDate(reveal.episodeName) ?? reveal.releaseDate;
  }

  function isUpcoming(reveal: RevealRelease): boolean {
    const date = releaseDate(reveal);
    return !date || date.slice(0, 10) > today;
  }

  function showStory(title: string, reveals: RevealRelease[]): boolean {
    if (reveals.length && !reveals.some(isUpcoming)) return false;
    if (reveals.some((reveal) => releaseDate(reveal) && isUpcoming(reveal))) return true;
    // For example, "Mega Evolution: Phantasmal Flames" should resolve to
    // the named expansion, not also to a shorter series/set name inside it.
    const specificNames = namesInTitle(title);
    return !specificNames.length || specificNames.some((name) => catalogDate(name)! > today);
  }

  return { releaseDate, isUpcoming, showStory };
}
