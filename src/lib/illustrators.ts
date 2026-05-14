import {
  HIDDEN_EXPANSION_CODES,
  HIDDEN_EXPANSION_IDS,
  HIDDEN_EXPANSION_NAMES,
} from "@/lib/episodes";
import { POKEMON_GAME, type TradingCardGame } from "@/lib/games";

export type IllustratorSort = "alpha" | "cards" | "value";

export const ILLUSTRATOR_SORT_COOKIE_NAME = "dusty_illustrator_sort";
export const ILLUSTRATOR_SORT_STORAGE_KEY = "dusty-illustrator-sort";

function escapeSqlLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function buildSqlLiteralList(values: readonly string[]): string {
  return values.map((value) => escapeSqlLiteral(value)).join(", ");
}

const HIDDEN_EXPANSION_ID_SQL = buildSqlLiteralList(HIDDEN_EXPANSION_IDS);
const HIDDEN_EXPANSION_CODE_SQL = buildSqlLiteralList(
  HIDDEN_EXPANSION_CODES.map((code) => code.toLowerCase())
);
const HIDDEN_EXPANSION_NAME_SQL = buildSqlLiteralList(
  HIDDEN_EXPANSION_NAMES.map((name) => name.toLowerCase())
);

export function normalizeIllustratorSort(value: string | null | undefined): IllustratorSort {
  if (value === "cards" || value === "value") return value;
  return "alpha";
}

export function buildIllustratorSortHref(sort: IllustratorSort): string {
  return sort === "alpha" ? "/illustrators" : `/illustrators?sort=${sort}`;
}

export function buildIllustratorSortCookie(sort: IllustratorSort): string {
  const maxAge = 60 * 60 * 24 * 365;
  return `${ILLUSTRATOR_SORT_COOKIE_NAME}=${sort}; Path=/; Max-Age=${maxAge}; SameSite=Lax`;
}

export function buildVisibleEpisodeWhereSql(
  episodeAlias = "e",
  game: TradingCardGame = POKEMON_GAME
): string {
  const clauses = [
    `${episodeAlias}.game = ${escapeSqlLiteral(game)}`,
    `${episodeAlias}.id NOT IN (${HIDDEN_EXPANSION_ID_SQL})`,
    `LOWER(COALESCE(${episodeAlias}.code, '')) NOT IN (${HIDDEN_EXPANSION_CODE_SQL})`,
    `LOWER(COALESCE(${episodeAlias}.name, '')) NOT IN (${HIDDEN_EXPANSION_NAME_SQL})`,
  ];

  return `\n      AND ${clauses.join("\n      AND ")}`;
}
