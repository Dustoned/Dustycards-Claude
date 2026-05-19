export const RARITY_LABEL_MAP: Record<string, string> = {
  common: "Common",
  uncommon: "Uncommon",
  rare: "Rare",
  "rare holo": "Rare Holo",
  "rare ultra": "Rare Ultra",
  "rare secret": "Secret Rare",
  "secret rare": "Secret Rare",
  "amazing rare": "Amazing Rare",
  promo: "Promo",
  "radiant rare": "Radiant Rare",
  "ace spec rare": "ACE SPEC Rare",
  "double rare": "Double Rare",
  "illustration rare": "Illustration Rare",
  "special illustration rare": "Special Illustration Rare",
  "hyper rare": "Hyper Rare",
  "shiny rare": "Shiny Rare",
  "shiny ultra rare": "Shiny Ultra Rare",
  "rare rainbow": "Rare Rainbow",
  "ultra rare": "Ultra Rare",
  "rare holo ex": "Rare Holo EX",
  "rare holo v": "Rare Holo V",
  "rare holo gx": "Rare Holo GX",
  "trainer gallery rare holo": "Trainer Gallery Rare Holo",
  "rare holo lv x": "Rare Holo LV.X",
  "rare holo vstar": "Rare Holo VSTAR",
  "rare shiny": "Rare Shiny",
  "rare shiny gx": "Rare Shiny GX",
  "rare break": "Rare BREAK",
  "rare prism star": "Rare Prism Star",
  "rare prime": "Rare Prime",
  "classic collection": "Classic Collection",
  "rare holo star": "Rare Holo Star",
  legend: "LEGEND",
  "rare shining": "Rare Shining",
  "rare ace": "Rare ACE",
  "art rare": "Art Rare",
  "special art rare": "Special Art Rare",
  "mega hyper rare": "Mega Hyper Rare",
  "black white rare": "Black White Rare",
  "mega attack rare": "Mega Attack Rare",
  l: "Leader",
  leader: "Leader",
  c: "Common",
  uc: "Uncommon",
  r: "Rare",
  sr: "Super Rare",
  "super rare": "Super Rare",
  sec: "Secret Rare",
  pr: "Promo",
  tr: "Treasure Rare",
  "treasure rare": "Treasure Rare",
  "alternate art": "Alternate Art",
  "manga rare": "Manga Rare",
  "special rare": "Special Rare",
  "don!!": "DON!!",
};

export const KNOWN_RARITY_ORDER = [
  "Common",
  "Uncommon",
  "Rare",
  "Super Rare",
  "Secret Rare",
  "Leader",
  "Rare Holo",
  "Double Rare",
  "Rare Holo EX",
  "Rare Holo GX",
  "Rare Holo V",
  "Rare Holo VSTAR",
  "Rare Holo LV.X",
  "Rare Holo Star",
  "Rare Ultra",
  "Ultra Rare",
  "Radiant Rare",
  "Amazing Rare",
  "ACE SPEC Rare",
  "Rare BREAK",
  "Rare Prism Star",
  "Rare Prime",
  "Rare Rainbow",
  "Rare Shiny",
  "Rare Shiny GX",
  "Illustration Rare",
  "Art Rare",
  "Alternate Art",
  "Manga Rare",
  "Special Rare",
  "Special Illustration Rare",
  "Special Art Rare",
  "Shiny Rare",
  "Shiny Ultra Rare",
  "Hyper Rare",
  "Rare Shining",
  "Rare ACE",
  "Trainer Gallery Rare Holo",
  "Classic Collection",
  "Black White Rare",
  "Mega Attack Rare",
  "Mega Hyper Rare",
  "Promo",
  "Treasure Rare",
  "DON!!",
  "LEGEND",
] as const;

const COMPACT_RARITY_LABEL_MAP: Record<string, string> = {
  Common: "C",
  Uncommon: "UC",
  Rare: "R",
  "Super Rare": "SR",
  "Secret Rare": "SEC",
  Leader: "L",
  "Rare Holo": "RH",
  "Double Rare": "DR",
  "Rare Holo EX": "EX",
  "Rare Holo GX": "GX",
  "Rare Holo V": "V",
  "Rare Holo VSTAR": "VSTAR",
  "Rare Holo LV.X": "LV.X",
  "Rare Holo Star": "STAR",
  "Rare Ultra": "UR",
  "Ultra Rare": "UR",
  "Radiant Rare": "RR",
  "Amazing Rare": "AR",
  "ACE SPEC Rare": "ACE",
  "Rare BREAK": "BREAK",
  "Rare Prism Star": "PRISM",
  "Rare Prime": "PRIME",
  "Rare Rainbow": "RAIN",
  "Rare Shiny": "SH",
  "Rare Shiny GX": "SHGX",
  "Illustration Rare": "IR",
  "Art Rare": "AR",
  "Alternate Art": "ALT",
  "Manga Rare": "MANGA",
  "Special Rare": "SP",
  "Special Illustration Rare": "SIR",
  "Special Art Rare": "SAR",
  "Shiny Rare": "SH",
  "Shiny Ultra Rare": "SUR",
  "Hyper Rare": "HR",
  "Rare Shining": "SHIN",
  "Rare ACE": "ACE",
  "Trainer Gallery Rare Holo": "TG",
  "Classic Collection": "CC",
  "Black White Rare": "BWR",
  "Mega Attack Rare": "MAR",
  "Mega Hyper Rare": "MHR",
  Promo: "PR",
  "Treasure Rare": "TR",
  "DON!!": "DON",
  LEGEND: "LEG",
};

export function normalizeRarityLabel(rarity: string | null | undefined): string | null {
  const value = rarity?.trim();
  if (!value) return null;

  const normalizedKey = value
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

  return RARITY_LABEL_MAP[normalizedKey] ?? value;
}

export function getCompactRarityLabel(rarity: string | null | undefined): string | null {
  const normalized = normalizeRarityLabel(rarity);
  if (!normalized) return null;

  const compact = COMPACT_RARITY_LABEL_MAP[normalized];
  if (compact) return compact;
  if (normalized.length <= 6) return normalized;

  const initials = normalized
    .replace(/[^\p{L}\p{N}\s!]/gu, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  return initials.slice(0, 4) || normalized.slice(0, 4).toUpperCase();
}
