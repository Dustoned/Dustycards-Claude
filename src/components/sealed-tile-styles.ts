import type { CardSize } from "@/lib/user-settings";

type SealedTileTone = "neutral" | "market" | "positive" | "negative" | "quantity";

export function sealedTileRootClass(): string {
  return "group flex cursor-pointer flex-col rounded-[16px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.024))] p-1.5 text-left shadow-[0_14px_34px_rgba(0,0,0,0.22)] outline-none transition-colors hover:border-white/14 hover:bg-white/[0.058] max-[640px]:rounded-[15px] max-[640px]:p-1";
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

  return `relative aspect-[16/10] w-full overflow-hidden border bg-black/28 transition-all duration-200 ${radius} ${selectedClass}`;
}

export function sealedTileImagePaddingClass(cardSize: CardSize): string {
  if (cardSize === "large") {
    return "scale-[1.42] p-3 transition-transform duration-200 group-hover:scale-[1.48] max-[640px]:scale-[1.28] max-[640px]:p-2";
  }

  if (cardSize === "medium") {
    return "scale-[1.38] p-2.5 transition-transform duration-200 group-hover:scale-[1.45] max-[640px]:scale-[1.25] max-[640px]:p-1.5";
  }

  return "scale-[1.32] p-2 transition-transform duration-200 group-hover:scale-[1.38] max-[640px]:scale-[1.2] max-[640px]:p-1";
}

export function sealedTileInfoClass(cardSize: CardSize): string {
  if (cardSize === "large") {
    return "mt-2.5 px-1.5 max-[640px]:mt-1.5 max-[640px]:px-1";
  }

  if (cardSize === "medium") {
    return "mt-2 px-1.5 max-[640px]:mt-1.5 max-[640px]:px-1";
  }

  return "mt-1.5 px-1 max-[640px]:mt-1 max-[640px]:px-1";
}

export function sealedTileTitleClass(cardSize: CardSize): string {
  if (cardSize === "large") {
    return "line-clamp-2 text-[17px] font-bold leading-tight text-white max-[640px]:text-[12px]";
  }

  if (cardSize === "medium") {
    return "line-clamp-2 text-[15px] font-bold leading-tight text-white max-[640px]:text-[12px]";
  }

  return "line-clamp-2 text-[13px] font-bold leading-tight text-white max-[640px]:text-[11px]";
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
    return "min-w-0 truncate text-[18px] font-bold tabular-nums leading-tight text-white max-[640px]:text-[12px]";
  }

  if (cardSize === "medium") {
    return "min-w-0 truncate text-[16px] font-bold tabular-nums leading-tight text-white max-[640px]:text-[12px]";
  }

  return "min-w-0 truncate text-[14px] font-bold tabular-nums leading-tight text-white max-[640px]:text-[11px]";
}

export function sealedTileNoPriceClass(cardSize: CardSize): string {
  if (cardSize === "large") {
    return "text-[13px] text-white/35";
  }

  if (cardSize === "medium") {
    return "text-xs text-white/35";
  }

  return "text-[11px] text-white/35";
}

export function sealedTileActionButtonClass(): string {
  return "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-white/12 bg-black/40 text-white shadow-sm shadow-black/30 backdrop-blur transition-colors hover:border-emerald-300/35 hover:bg-emerald-400/14 hover:text-emerald-100 disabled:cursor-not-allowed disabled:opacity-50 max-[640px]:!h-7 max-[640px]:!w-7 max-[640px]:shadow-none";
}

export function sealedTileActionIconClass(): string {
  return "h-4 w-4 stroke-[2.25] max-[640px]:h-3.5 max-[640px]:w-3.5";
}

export function sealedTileBubbleWrapClass(cardSize: CardSize): string {
  if (cardSize === "large") {
    return "mt-2 grid grid-cols-2 gap-1.5 max-[640px]:mt-1.5 max-[640px]:gap-1";
  }

  if (cardSize === "medium") {
    return "mt-2 grid grid-cols-2 gap-1.5 max-[640px]:mt-1.5 max-[640px]:gap-1";
  }

  return "mt-1.5 grid grid-cols-2 gap-1.5 max-[640px]:mt-1 max-[640px]:gap-1";
}

export function sealedTileBubbleClass(tone: SealedTileTone = "neutral"): string {
  const base =
    "inline-flex min-h-8 min-w-0 items-center justify-between gap-1 rounded-lg border px-2 py-1 text-[11px] font-semibold leading-none shadow-sm shadow-black/5 max-[640px]:min-h-5 max-[640px]:px-1.5 max-[640px]:py-0.5 max-[640px]:text-[9px] dark:shadow-black/20 [&>span]:truncate";

  if (tone === "market") {
    return `${base} border-emerald-400/18 bg-emerald-400/[0.08] text-emerald-200`;
  }

  if (tone === "positive") {
    return `${base} border-emerald-400/18 bg-emerald-400/[0.08] text-emerald-200`;
  }

  if (tone === "negative") {
    return `${base} border-rose-400/18 bg-rose-400/[0.08] text-rose-200`;
  }

  if (tone === "quantity") {
    return `${base} border-violet-400/18 bg-violet-400/[0.08] text-violet-200`;
  }

  return `${base} border-white/8 bg-white/[0.05] text-white/60`;
}

export function sealedTileBubbleLabelClass(): string {
  return "text-[9px] font-semibold uppercase tracking-[0.1em] opacity-62 max-[640px]:hidden";
}

export function sealedTileGridGapClass(cardSize: CardSize): string {
  if (cardSize === "large") {
    return "gap-x-3 gap-y-4 max-[640px]:gap-x-2 max-[640px]:gap-y-3";
  }

  if (cardSize === "medium") {
    return "gap-x-3 gap-y-4 max-[640px]:gap-x-2 max-[640px]:gap-y-3";
  }

  return "gap-x-3 gap-y-4 max-[640px]:gap-x-2 max-[640px]:gap-y-3";
}
