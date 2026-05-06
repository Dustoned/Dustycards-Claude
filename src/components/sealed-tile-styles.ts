import type { CardSize } from "@/lib/user-settings";

type SealedTileTone = "neutral" | "market" | "positive" | "negative" | "quantity";

export function sealedTileRootClass(): string {
  return "group flex cursor-pointer flex-col gap-1.5 text-left outline-none max-[640px]:gap-1";
}

export function sealedTileImageClass(cardSize: CardSize, selected = false): string {
  const radius =
    cardSize === "large"
      ? "rounded-[22px]"
      : cardSize === "medium"
        ? "rounded-2xl"
        : "rounded-xl";

  const selectedClass = selected
    ? "border-blue-400/80 shadow-lg shadow-blue-500/25 ring-2 ring-blue-400/80"
    : "border-transparent shadow-md shadow-black/20 group-hover:scale-[1.02] group-hover:shadow-xl group-hover:shadow-black/30";

  return `relative aspect-square w-full overflow-hidden border bg-black/4 transition-all duration-200 dark:bg-white/4 ${radius} ${selectedClass}`;
}

export function sealedTileImagePaddingClass(cardSize: CardSize): string {
  if (cardSize === "large") {
    return "p-5 max-[640px]:p-2.5";
  }

  if (cardSize === "medium") {
    return "p-4 max-[640px]:p-2";
  }

  return "p-3 max-[640px]:p-1.5";
}

export function sealedTileInfoClass(cardSize: CardSize): string {
  if (cardSize === "large") {
    return "mt-3 px-1 max-[640px]:mt-1.5 max-[640px]:px-0";
  }

  if (cardSize === "medium") {
    return "mt-2.5 px-0.5 max-[640px]:mt-1.5 max-[640px]:px-0";
  }

  return "mt-2 px-0.5 max-[640px]:mt-1 max-[640px]:px-0";
}

export function sealedTileTitleClass(cardSize: CardSize): string {
  if (cardSize === "large") {
    return "line-clamp-2 text-[18px] font-semibold leading-snug text-gray-900 dark:text-white max-[640px]:text-[12px]";
  }

  if (cardSize === "medium") {
    return "line-clamp-2 text-[15px] font-semibold leading-snug text-gray-900 dark:text-white max-[640px]:text-[12px]";
  }

  return "line-clamp-2 text-[13px] font-semibold leading-snug text-gray-900 dark:text-white max-[640px]:text-[11px]";
}

export function sealedTileMetaLineClass(cardSize: CardSize): string {
  if (cardSize === "large") {
    return "mt-1 flex items-center gap-2 text-[14px] font-medium max-[640px]:hidden";
  }

  if (cardSize === "medium") {
    return "mt-0.5 flex items-center gap-1.5 text-[12px] font-medium max-[640px]:hidden";
  }

  return "mt-0.5 flex items-center gap-1.5 text-[11px] font-medium max-[640px]:hidden";
}

export function sealedTilePriceClass(cardSize: CardSize): string {
  if (cardSize === "large") {
    return "min-w-0 truncate text-[20px] font-semibold tabular-nums leading-tight text-gray-900 dark:text-white max-[640px]:text-[12px]";
  }

  if (cardSize === "medium") {
    return "min-w-0 truncate text-[16px] font-semibold tabular-nums leading-tight text-gray-900 dark:text-white max-[640px]:text-[12px]";
  }

  return "min-w-0 truncate text-[14px] font-semibold tabular-nums leading-tight text-gray-900 dark:text-white max-[640px]:text-[11px]";
}

export function sealedTileNoPriceClass(cardSize: CardSize): string {
  if (cardSize === "large") {
    return "text-[13px] text-gray-400 dark:text-gray-500";
  }

  if (cardSize === "medium") {
    return "text-xs text-gray-400 dark:text-gray-500";
  }

  return "text-[11px] text-gray-400 dark:text-gray-500";
}

export function sealedTileActionButtonClass(): string {
  return "inline-flex !h-[var(--ui-chip-min-height)] !w-[var(--ui-chip-min-height)] shrink-0 items-center justify-center !rounded-md border border-black/8 bg-black/5 text-gray-900 transition-colors hover:border-black/15 hover:bg-black/8 disabled:cursor-not-allowed disabled:opacity-50 max-[640px]:!h-6 max-[640px]:!w-6 dark:border-white/10 dark:bg-white/8 dark:text-white dark:hover:bg-white/12";
}

export function sealedTileActionIconClass(): string {
  return "h-[calc(var(--ui-chip-font-size)+0.25rem)] w-[calc(var(--ui-chip-font-size)+0.25rem)]";
}

export function sealedTileBubbleWrapClass(cardSize: CardSize): string {
  if (cardSize === "large") {
    return "mt-3 flex flex-wrap items-center gap-2 max-[640px]:mt-1.5 max-[640px]:gap-1";
  }

  if (cardSize === "medium") {
    return "mt-2.5 flex flex-wrap items-center gap-1.5 max-[640px]:mt-1.5 max-[640px]:gap-1";
  }

  return "mt-2 flex flex-wrap items-center gap-1.5 max-[640px]:mt-1 max-[640px]:gap-1";
}

export function sealedTileBubbleClass(tone: SealedTileTone = "neutral"): string {
  const base =
    "inline-flex min-h-[var(--ui-chip-min-height)] shrink-0 items-center gap-[var(--ui-chip-gap)] whitespace-nowrap rounded-full border px-[var(--ui-chip-x)] py-[var(--ui-chip-y)] text-[length:var(--ui-chip-font-size)] font-medium leading-none shadow-sm shadow-black/5 max-[640px]:min-h-5 max-[640px]:px-1.5 max-[640px]:py-0.5 max-[640px]:text-[9px] dark:shadow-black/20";

  if (tone === "market") {
    return `${base} border-emerald-200/60 bg-emerald-50/90 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-900/25 dark:text-emerald-300`;
  }

  if (tone === "positive") {
    return `${base} border-emerald-200/60 bg-emerald-50/90 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-900/25 dark:text-emerald-300`;
  }

  if (tone === "negative") {
    return `${base} border-rose-200/60 bg-rose-50/90 text-rose-700 dark:border-rose-500/20 dark:bg-rose-900/25 dark:text-rose-300`;
  }

  if (tone === "quantity") {
    return `${base} border-blue-200/60 bg-blue-50/90 text-blue-700 dark:border-blue-500/20 dark:bg-blue-900/25 dark:text-blue-300`;
  }

  return `${base} border-black/8 bg-black/[0.035] text-gray-600 dark:border-white/8 dark:bg-white/[0.05] dark:text-white/60`;
}

export function sealedTileBubbleLabelClass(): string {
  return "text-[length:var(--ui-chip-count-font-size)] font-semibold uppercase tracking-[0.12em] opacity-70 max-[640px]:hidden";
}

export function sealedTileGridGapClass(cardSize: CardSize): string {
  if (cardSize === "large") {
    return "gap-x-5 gap-y-8";
  }

  if (cardSize === "medium") {
    return "gap-x-4 gap-y-6";
  }

  return "gap-x-3 gap-y-5";
}
