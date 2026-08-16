export type PopularPokemonFilter =
  | "all"
  | "popular"
  | "charizard"
  | "pikachu"
  | "eeveelutions"
  | "gengar"
  | "mew-mewtwo"
  | "rayquaza"
  | "lugia"
  | "greninja"
  | "lucario"
  | "mimikyu"
  | "gardevoir"
  | "tyranitar"
  | "garchomp"
  | "dragonite"
  | "giratina"
  | "arceus"
  | "gyarados"
  | "snorlax"
  | "kanto-starters";

interface PopularPokemonGroup {
  value: Exclude<PopularPokemonFilter, "all" | "popular">;
  label: string;
  names: readonly string[];
}

/**
 * A deliberately compact collector-demand list, not a list of every famous
 * Pokémon. It combines the official 2020 worldwide fan vote with recurring
 * characters in Cardmarket grading and recent marketplace character data.
 * Keeping the names explicit makes the UI predictable and prevents a common
 * card from becoming interesting merely because its species is recognizable.
 */
export const POPULAR_POKEMON_GROUPS: readonly PopularPokemonGroup[] = [
  { value: "charizard", label: "Charizard", names: ["Charizard"] },
  { value: "pikachu", label: "Pikachu", names: ["Pikachu"] },
  {
    value: "eeveelutions",
    label: "Eevee & evolutions",
    names: [
      "Eevee",
      "Vaporeon",
      "Jolteon",
      "Flareon",
      "Espeon",
      "Umbreon",
      "Leafeon",
      "Glaceon",
      "Sylveon",
    ],
  },
  { value: "gengar", label: "Gengar", names: ["Gengar"] },
  { value: "mew-mewtwo", label: "Mew & Mewtwo", names: ["Mew", "Mewtwo"] },
  { value: "rayquaza", label: "Rayquaza", names: ["Rayquaza"] },
  { value: "lugia", label: "Lugia", names: ["Lugia"] },
  { value: "greninja", label: "Greninja", names: ["Greninja"] },
  { value: "lucario", label: "Lucario", names: ["Lucario"] },
  { value: "mimikyu", label: "Mimikyu", names: ["Mimikyu"] },
  { value: "gardevoir", label: "Gardevoir", names: ["Gardevoir"] },
  { value: "tyranitar", label: "Tyranitar", names: ["Tyranitar"] },
  { value: "garchomp", label: "Garchomp", names: ["Garchomp"] },
  { value: "dragonite", label: "Dragonite", names: ["Dragonite"] },
  { value: "giratina", label: "Giratina", names: ["Giratina"] },
  { value: "arceus", label: "Arceus", names: ["Arceus"] },
  { value: "gyarados", label: "Gyarados", names: ["Gyarados"] },
  { value: "snorlax", label: "Snorlax", names: ["Snorlax"] },
  {
    value: "kanto-starters",
    label: "Blastoise & Venusaur",
    names: ["Blastoise", "Venusaur"],
  },
] as const;

export const POPULAR_POKEMON_FILTER_OPTIONS: ReadonlyArray<{
  value: PopularPokemonFilter;
  label: string;
}> = [
  { value: "all", label: "All Pokémon" },
  { value: "popular", label: "Popular Pokémon only" },
  ...POPULAR_POKEMON_GROUPS.map(({ value, label }) => ({ value, label })),
];

function normalizePokemonWords(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en")
    .replace(/♀/g, " female ")
    .replace(/♂/g, " male ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function cardNameContainsPokemon(cardName: string, pokemonName: string): boolean {
  const normalizedCardName = ` ${normalizePokemonWords(cardName)} `;
  const normalizedPokemonName = ` ${normalizePokemonWords(pokemonName)} `;
  return normalizedCardName.includes(normalizedPokemonName);
}

export function getPopularPokemonGroupMatches(cardName: string): PopularPokemonGroup[] {
  return POPULAR_POKEMON_GROUPS.filter((group) =>
    group.names.some((pokemonName) => cardNameContainsPokemon(cardName, pokemonName)),
  );
}

export function matchesPopularPokemonFilter(
  cardName: string,
  filter: PopularPokemonFilter,
): boolean {
  if (filter === "all") return true;
  const matches = getPopularPokemonGroupMatches(cardName);
  if (filter === "popular") return matches.length > 0;
  return matches.some((group) => group.value === filter);
}
