import { normalizeRarityLabel } from "@/lib/rarity";

const LIGHT_BADGE: Record<string, string> = {
  Common: "bg-black/6 dark:bg-white/8 text-gray-500 dark:text-gray-400",
  Uncommon: "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400",
  Rare: "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400",
  "Rare Holo": "bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400",
  "Rare Ultra": "bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400",
  "Ultra Rare": "bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300",
  "Secret Rare": "bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400",
  "Amazing Rare": "bg-cyan-50 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-400",
  Promo: "bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300",
  "Radiant Rare": "bg-yellow-50 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300",
  "ACE SPEC Rare": "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300",
  "Double Rare": "bg-sky-50 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300",
  "Illustration Rare": "bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300",
  "Special Illustration Rare": "bg-pink-50 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300",
  "Hyper Rare": "bg-yellow-50 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300",
  "Shiny Rare": "bg-lime-50 dark:bg-lime-900/30 text-lime-700 dark:text-lime-300",
  "Shiny Ultra Rare": "bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300",
  "Rare Rainbow": "bg-fuchsia-50 dark:bg-fuchsia-900/30 text-fuchsia-700 dark:text-fuchsia-300",
  "Rare Holo EX": "bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300",
  "Rare Holo V": "bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300",
  "Rare Holo GX": "bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300",
  "Trainer Gallery Rare Holo": "bg-pink-50 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300",
  "Rare Holo LV.X": "bg-sky-50 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300",
  "Rare Holo VSTAR": "bg-yellow-50 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300",
  "Rare Shiny": "bg-lime-50 dark:bg-lime-900/30 text-lime-700 dark:text-lime-300",
  "Rare Shiny GX": "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300",
  "Rare BREAK": "bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300",
  "Rare Prism Star": "bg-cyan-50 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300",
  "Rare Prime": "bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300",
  "Classic Collection": "bg-slate-100 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300",
  "Rare Holo Star": "bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300",
  LEGEND: "bg-stone-100 dark:bg-stone-800/60 text-stone-700 dark:text-stone-300",
  "Rare Shining": "bg-yellow-50 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300",
  "Rare ACE": "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300",
  "Art Rare": "bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300",
  "Special Art Rare": "bg-pink-50 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300",
  "Mega Hyper Rare": "bg-fuchsia-50 dark:bg-fuchsia-900/30 text-fuchsia-700 dark:text-fuchsia-300",
  "Black White Rare": "bg-slate-100 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300",
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
};

const LIGHT_FALLBACK = "bg-black/5 dark:bg-white/6 text-gray-500 dark:text-gray-400";
const DARK_FALLBACK = "bg-white/8 text-white/58";

export function rarityBadge(rarity: string | null): string {
  return LIGHT_BADGE[normalizeRarityLabel(rarity) ?? ""] ?? LIGHT_FALLBACK;
}

export function rarityBadgeDark(rarity: string | null): string {
  return DARK_BADGE[normalizeRarityLabel(rarity) ?? ""] ?? DARK_FALLBACK;
}
