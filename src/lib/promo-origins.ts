export type PromoOriginType = "sealed_product" | "event" | "retailer" | "other";

export interface PromoOriginSource {
  episodeName: string;
  pageTitle: string;
  minYear: number;
  maxYear: number;
}

export interface ParsedPromoOrigin {
  promoNumber: string;
  originName: string;
  normalizedName: string;
  originType: PromoOriginType;
}

export interface PromoOriginProductCandidate {
  id: string;
  name: string;
  releaseDate?: string | null;
}

export const PROMO_ORIGIN_SOURCES: PromoOriginSource[] = [
  { episodeName: "MEP Black Star Promos", pageTitle: "MEP_Black_Star_Promos_(TCG)", minYear: 2025, maxYear: 2030 },
  { episodeName: "SV Black Star Promos", pageTitle: "SVP_Black_Star_Promos_(TCG)", minYear: 2022, maxYear: 2025 },
  { episodeName: "SWSH Black Star Promos", pageTitle: "SWSH_Black_Star_Promos_(TCG)", minYear: 2019, maxYear: 2023 },
  { episodeName: "SM Black Star Promos", pageTitle: "SM_Black_Star_Promos_(TCG)", minYear: 2016, maxYear: 2020 },
  { episodeName: "XY Black Star Promos", pageTitle: "XY_Black_Star_Promos_(TCG)", minYear: 2013, maxYear: 2017 },
  { episodeName: "BW Black Star Promos", pageTitle: "BW_Black_Star_Promos_(TCG)", minYear: 2010, maxYear: 2014 },
  { episodeName: "HGSS Black Star Promos", pageTitle: "HGSS_Black_Star_Promos_(TCG)", minYear: 2009, maxYear: 2011 },
  { episodeName: "DP Black Star Promos", pageTitle: "DP_Black_Star_Promos_(TCG)", minYear: 2006, maxYear: 2010 },
  { episodeName: "Nintendo Black Star Promos", pageTitle: "Nintendo_Black_Star_Promos_(TCG)", minYear: 2003, maxYear: 2007 },
  { episodeName: "Wizards Black Star Promos", pageTitle: "Wizards_Black_Star_Promos_(TCG)", minYear: 1998, maxYear: 2003 },
];

export function getPromoOriginSourceUrl(pageTitle: string): string {
  return `https://bulbapedia.bulbagarden.net/wiki/${pageTitle}`;
}

export function getPromoOriginRawUrl(pageTitle: string): string {
  return `https://bulbapedia.bulbagarden.net/w/index.php?title=${encodeURIComponent(pageTitle)}&action=raw`;
}

export function normalizePromoNumber(value: string | null | undefined): string | null {
  const normalized = value?.toUpperCase().replace(/[^A-Z0-9]+/g, "").trim() ?? "";
  const match = /^(?:SVP|MEP|SWSH|SM|XY|BW|HGSS|DP|NP|P)?0*(\d{1,4})([A-Z]?)$/.exec(normalized);
  return match ? `${Number(match[1])}${match[2]}` : null;
}

export function normalizePromoOriginName(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/pok[eé]mon/g, "pokemon")
    .replace(/&/g, " and ")
    .replace(/\b(?:one|single)[- ]pack\b/g, "1 pack")
    .replace(/\bthree[- ]pack\b/g, "3 pack")
    .replace(/\belite trainer box\b/g, "etb")
    .replace(/\bblisters\b/g, "blister")
    .replace(/\btins\b/g, "tin")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitTopLevel(value: string, separator = "|"): string[] {
  const parts: string[] = [];
  let current = "";
  let templateDepth = 0;
  let linkDepth = 0;

  for (let index = 0; index < value.length; index += 1) {
    const pair = value.slice(index, index + 2);
    if (pair === "{{") {
      templateDepth += 1;
      current += pair;
      index += 1;
      continue;
    }
    if (pair === "}}") {
      templateDepth = Math.max(0, templateDepth - 1);
      current += pair;
      index += 1;
      continue;
    }
    if (pair === "[[") {
      linkDepth += 1;
      current += pair;
      index += 1;
      continue;
    }
    if (pair === "]]" && linkDepth > 0) {
      linkDepth -= 1;
      current += pair;
      index += 1;
      continue;
    }
    if (value[index] === separator && templateDepth === 0 && linkDepth === 0) {
      parts.push(current);
      current = "";
      continue;
    }
    current += value[index];
  }
  parts.push(current);
  return parts;
}

function readBalancedTemplate(source: string, start: number): string | null {
  let depth = 0;
  for (let index = start; index < source.length - 1; index += 1) {
    const pair = source.slice(index, index + 2);
    if (pair === "{{") {
      depth += 1;
      index += 1;
      continue;
    }
    if (pair === "}}") {
      depth -= 1;
      if (depth === 0) return source.slice(start + 2, index);
      index += 1;
    }
  }
  return null;
}

function renderInnermostTemplate(value: string): string {
  const parts = splitTopLevel(value);
  const template = parts.shift()?.trim().toLowerCase() ?? "";
  const args = parts
    .filter((part) => !/^\s*[a-z_]+\s*=/.test(part))
    .map((part) => part.trim())
    .filter(Boolean);
  if (args.length === 0) return "";

  if (template === "tcgmerch") return args.at(-1) ?? "";
  if (["tcg", "wp", "g", "tt", "dl"].includes(template)) return args.at(-1) ?? "";
  return args.at(-1) ?? "";
}

export function renderPromoOriginWikitext(value: string): string[] {
  let rendered = value
    .replace(/^\s*\d+\s*=\s*/, "")
    .replace(/\\([|[\]])/g, "$1")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<ref\b[^>]*>[\s\S]*?<\/ref>/gi, " ")
    .replace(/<ref\b[^/>]*\/>/gi, " ")
    .replace(/<br\s*\/?\s*>/gi, "\n");

  for (let pass = 0; pass < 20 && /\{\{[^{}]*\}\}/.test(rendered); pass += 1) {
    rendered = rendered.replace(/\{\{([^{}]*)\}\}/g, (_match, inner: string) =>
      renderInnermostTemplate(inner)
    );
  }

  rendered = rendered
    .replace(/\[\[[^\]|]+\|([^\]]+)\]\]/g, "$1")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/\[https?:\/\/\S+\s+([^\]]+)\]/g, "$1")
    .replace(/\[https?:\/\/[^\]]+\]/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/'{2,}/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/gi, "'");

  return rendered
    .split(/\r?\n|\s+\/\s+/)
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter((part) => part.length >= 3)
    .filter((part, index, values) => values.indexOf(part) === index);
}

export function classifyPromoOrigin(name: string): PromoOriginType {
  const normalized = normalizePromoOriginName(name);
  if (
    /\b(?:box|etb|blister|tin|collection|chest|deck|toolkit|stadium|bundle|pack|portfolio)\b/.test(
      normalized
    ) &&
    !/\b(?:launch|event|championship|tournament|league|challenge|cup|staff|participation)\b/.test(
      normalized
    )
  ) {
    return "sealed_product";
  }
  if (/\b(?:prerelease|launch|event|championship|tournament|league|challenge|cup|worlds|staff|participation)\b/.test(normalized)) {
    return "event";
  }
  if (/\b(?:gift with purchase|retailer|gamestop|target|walmart|best buy|toys r us|store|shop)\b/.test(normalized)) {
    return "retailer";
  }
  return "other";
}

function getOriginTokens(value: string): Set<string> {
  return new Set(
    normalizePromoOriginName(value)
      .split(" ")
      .filter((token) => token.length > 1 || /^\d$/.test(token))
      .filter((token) => !["pokemon", "tcg", "series", "products"].includes(token))
  );
}

export function findPromoOriginProduct<T extends PromoOriginProductCandidate>(
  originName: string,
  cardName: string,
  products: readonly T[]
): T | null {
  const origin = normalizePromoOriginName(originName);
  if (!origin) return null;
  const originTokens = getOriginTokens(origin);
  const cardTokens = getOriginTokens(cardName);
  const benignExtraTokens = new Set(["ex", "gx", "v", "vmax", "vstar", "lv", "x", "eu", "version"]);
  const scored = products.flatMap((product) => {
    const candidate = normalizePromoOriginName(product.name);
    if (!candidate) return [];
    const candidateTokens = getOriginTokens(candidate);
    const sharedOriginTokens = [...originTokens].filter((token) => candidateTokens.has(token));
    const originCoverage = originTokens.size > 0 ? sharedOriginTokens.length / originTokens.size : 0;
    const cardCoverage = cardTokens.size > 0
      ? [...cardTokens].filter((token) => candidateTokens.has(token)).length / cardTokens.size
      : 0;
    const unexplainedCandidateTokens = [...candidateTokens].filter(
      (token) =>
        !originTokens.has(token) &&
        !cardTokens.has(token) &&
        !benignExtraTokens.has(token)
    );

    let score = 0;
    if (candidate === origin) score = 100;
    else if (candidate.includes(origin) && unexplainedCandidateTokens.length === 0) score = 91;
    else if (origin.includes(candidate) && candidate.length >= 10) score = 88;
    else if (
      originTokens.size >= 3 &&
      originCoverage >= 0.84 &&
      unexplainedCandidateTokens.length === 0
    ) score = 72 + originCoverage * 12;
    else return [];

    if (cardCoverage === 1) score += 8;
    if (candidate.includes("pokemon center") !== origin.includes("pokemon center")) score -= 20;
    return [{ product, score }];
  });

  scored.sort((left, right) => right.score - left.score || left.product.name.localeCompare(right.product.name));
  const best = scored[0];
  if (!best || best.score < 80) return null;
  if (scored[1] && Math.abs(scored[1].score - best.score) < 0.5) return null;
  return best.product;
}

export function parsePromoOriginWikitext(source: string): ParsedPromoOrigin[] {
  const normalizedSource = source.replace(/\\\|/g, "|");
  const starts = ["{{Setlist/entry|", "{{Setlist/nmentry|"];
  const entries: ParsedPromoOrigin[] = [];

  for (let cursor = 0; cursor < normalizedSource.length;) {
    const candidates = starts
      .map((needle) => ({ needle, index: normalizedSource.indexOf(needle, cursor) }))
      .filter((candidate) => candidate.index >= 0)
      .sort((a, b) => a.index - b.index);
    const next = candidates[0];
    if (!next) break;
    const template = readBalancedTemplate(normalizedSource, next.index);
    if (!template) break;
    cursor = next.index + template.length + 4;

    const fields = splitTopLevel(template);
    const promoNumber = normalizePromoNumber(fields[1]);
    const originField = fields.at(-1)?.trim() ?? "";
    if (!promoNumber || !originField) continue;

    for (const originName of renderPromoOriginWikitext(originField)) {
      const normalizedName = normalizePromoOriginName(originName);
      if (!normalizedName) continue;
      entries.push({
        promoNumber,
        originName,
        normalizedName,
        originType: classifyPromoOrigin(originName),
      });
    }
  }

  const unique = new Map<string, ParsedPromoOrigin>();
  for (const entry of entries) {
    unique.set(`${entry.promoNumber}:${entry.normalizedName}`, entry);
  }
  return [...unique.values()];
}
