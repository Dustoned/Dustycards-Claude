import { normalizeRarityLabel } from "@/lib/rarity";

const BADGE_NEUTRAL =
  "border border-[rgb(var(--dc-border-rgb)/0.86)] bg-[rgb(var(--dc-surface-hover-rgb)/0.5)] text-[var(--dc-text-secondary)]";
const BADGE_PRIMARY =
  "border border-[rgb(var(--dc-primary-rgb)/0.18)] bg-[rgb(var(--dc-primary-rgb)/0.075)] text-[color-mix(in_srgb,var(--dc-primary)_64%,var(--dc-text-primary))]";
const BADGE_CYAN =
  "border border-[rgb(var(--dc-cyan-rgb)/0.18)] bg-[rgb(var(--dc-cyan-rgb)/0.07)] text-[color-mix(in_srgb,var(--dc-cyan)_66%,var(--dc-text-primary))]";
const BADGE_SUCCESS =
  "border border-[rgb(var(--dc-success-rgb)/0.18)] bg-[rgb(var(--dc-success-rgb)/0.07)] text-[color-mix(in_srgb,var(--dc-success)_64%,var(--dc-text-primary))]";
const BADGE_GOLD =
  "border border-[rgb(var(--dc-gold-rgb)/0.2)] bg-[rgb(var(--dc-gold-rgb)/0.075)] text-[color-mix(in_srgb,var(--dc-gold)_66%,var(--dc-text-primary))]";
const BADGE_WARM =
  "border border-[rgb(var(--dc-negative-rgb)/0.17)] bg-[rgb(var(--dc-negative-rgb)/0.065)] text-[color-mix(in_srgb,var(--dc-negative)_62%,var(--dc-text-primary))]";

const LIGHT_BADGE: Record<string, string> = {
  Common: BADGE_NEUTRAL,
  Uncommon: BADGE_SUCCESS,
  Rare: BADGE_CYAN,
  "Rare Holo": BADGE_PRIMARY,
  "Rare Ultra": BADGE_GOLD,
  "Ultra Rare": BADGE_GOLD,
  "Secret Rare": BADGE_WARM,
  "Amazing Rare": BADGE_CYAN,
  Promo: BADGE_GOLD,
  "Radiant Rare": BADGE_GOLD,
  "ACE SPEC Rare": BADGE_PRIMARY,
  "Double Rare": BADGE_CYAN,
  "Illustration Rare": BADGE_CYAN,
  "Special Illustration Rare": BADGE_PRIMARY,
  "Hyper Rare": BADGE_GOLD,
  "Shiny Rare": BADGE_SUCCESS,
  "Shiny Ultra Rare": BADGE_SUCCESS,
  "Rare Rainbow": BADGE_PRIMARY,
  "Rare Holo EX": BADGE_WARM,
  "Rare Holo V": BADGE_PRIMARY,
  "Rare Holo GX": BADGE_PRIMARY,
  "Trainer Gallery Rare Holo": BADGE_PRIMARY,
  "Rare Holo LV.X": BADGE_CYAN,
  "Rare Holo VSTAR": BADGE_GOLD,
  "Rare Shiny": BADGE_SUCCESS,
  "Rare Shiny GX": BADGE_SUCCESS,
  "Rare BREAK": BADGE_GOLD,
  "Rare Prism Star": BADGE_CYAN,
  "Rare Prime": BADGE_CYAN,
  "Classic Collection": BADGE_NEUTRAL,
  "Rare Holo Star": BADGE_GOLD,
  LEGEND: BADGE_NEUTRAL,
  "Rare Shining": BADGE_GOLD,
  "Rare ACE": BADGE_PRIMARY,
  "Art Rare": BADGE_CYAN,
  "Special Art Rare": BADGE_PRIMARY,
  "Mega Hyper Rare": BADGE_PRIMARY,
  "Black White Rare": BADGE_NEUTRAL,
  Leader: BADGE_GOLD,
  "Super Rare": BADGE_CYAN,
  "Treasure Rare": BADGE_PRIMARY,
  "Alternate Art": BADGE_PRIMARY,
  "Manga Rare": BADGE_WARM,
  "Special Rare": BADGE_SUCCESS,
  "DON!!": BADGE_GOLD,
};

const DARK_BADGE: Record<string, string> = {
  Common: "bg-white/8 text-white/58",
  Uncommon: "bg-emerald-500/14 text-emerald-300",
  Rare: "bg-blue-500/16 text-blue-300",
  "Rare Holo": "bg-fuchsia-500/16 text-fuchsia-300",
  "Rare Ultra": "bg-amber-500/16 text-amber-300",
  "Ultra Rare": "bg-orange-500/16 text-orange-300",
  "Secret Rare": "bg-rose-500/16 text-rose-300",
  "Amazing Rare": "bg-cyan-500/16 text-cyan-300",
  Promo: "bg-orange-500/16 text-orange-300",
  "Radiant Rare": "bg-yellow-500/16 text-yellow-300",
  "ACE SPEC Rare": "bg-indigo-500/16 text-indigo-300",
  "Double Rare": "bg-sky-500/16 text-sky-300",
  "Illustration Rare": "bg-teal-500/16 text-teal-300",
  "Special Illustration Rare": "bg-pink-500/16 text-pink-300",
  "Hyper Rare": "bg-yellow-500/16 text-yellow-300",
  "Shiny Rare": "bg-lime-500/16 text-lime-300",
  "Shiny Ultra Rare": "bg-green-500/16 text-green-300",
  "Rare Rainbow": "bg-fuchsia-500/16 text-fuchsia-300",
  "Rare Holo EX": "bg-red-500/16 text-red-300",
  "Rare Holo V": "bg-violet-500/16 text-violet-300",
  "Rare Holo GX": "bg-purple-500/16 text-purple-300",
  "Trainer Gallery Rare Holo": "bg-pink-500/16 text-pink-300",
  "Rare Holo LV.X": "bg-sky-500/16 text-sky-300",
  "Rare Holo VSTAR": "bg-yellow-500/16 text-yellow-300",
  "Rare Shiny": "bg-lime-500/16 text-lime-300",
  "Rare Shiny GX": "bg-emerald-500/16 text-emerald-300",
  "Rare BREAK": "bg-orange-500/16 text-orange-300",
  "Rare Prism Star": "bg-cyan-500/16 text-cyan-300",
  "Rare Prime": "bg-teal-500/16 text-teal-300",
  "Classic Collection": "bg-slate-500/16 text-slate-300",
  "Rare Holo Star": "bg-amber-500/16 text-amber-300",
  LEGEND: "bg-stone-500/16 text-stone-300",
  "Rare Shining": "bg-yellow-500/16 text-yellow-300",
  "Rare ACE": "bg-indigo-500/16 text-indigo-300",
  "Art Rare": "bg-teal-500/16 text-teal-300",
  "Special Art Rare": "bg-pink-500/16 text-pink-300",
  "Mega Hyper Rare": "bg-fuchsia-500/16 text-fuchsia-300",
  "Black White Rare": "bg-slate-500/16 text-slate-300",
  Leader: "bg-amber-500/16 text-amber-300",
  "Super Rare": "bg-blue-500/16 text-blue-300",
  "Treasure Rare": "bg-violet-500/16 text-violet-300",
  "Alternate Art": "bg-purple-500/16 text-purple-300",
  "Manga Rare": "bg-rose-500/16 text-rose-300",
  "Special Rare": "bg-emerald-500/16 text-emerald-300",
  "DON!!": "bg-yellow-500/16 text-yellow-300",
};

const LIGHT_FALLBACK = BADGE_NEUTRAL;
const DARK_FALLBACK = "bg-white/8 text-white/58";

export function rarityBadge(rarity: string | null): string {
  return LIGHT_BADGE[normalizeRarityLabel(rarity) ?? ""] ?? LIGHT_FALLBACK;
}

export function rarityBadgeDark(rarity: string | null): string {
  return DARK_BADGE[normalizeRarityLabel(rarity) ?? ""] ?? DARK_FALLBACK;
}
