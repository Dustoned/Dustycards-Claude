import type { CardSize } from "@/lib/user-settings";

type SealedTileTone = "neutral" | "market" | "positive" | "negative" | "quantity";

export function sealedTileRootClass(): string {
  return "group flex cursor-pointer flex-col rounded-[16px] border border-[rgb(var(--dc-border-rgb)/0.88)] bg-[var(--dc-surface-primary)] p-1.5 text-left shadow-[0_14px_34px_var(--dc-shadow-color),inset_0_1px_0_var(--dc-sheen)] outline-none transition-[border-color,background-color,transform] hover:-translate-y-0.5 hover:border-[rgb(var(--dc-primary-rgb)/0.24)] hover:bg-[var(--dc-surface-hover)] max-[640px]:rounded-[15px] max-[640px]:p-1";
}

export function sealedTileImageClass(cardSize: CardSize, selected = false): string {
  const radius =
    cardSize === "large"
      ? "rounded-[22px]"
      : cardSize === "medium"
        ? "rounded-2xl"
        : "rounded-xl";

  const selectedClass = selected
    ? "border-[rgb(var(--dc-primary-rgb)/0.72)] shadow-lg ring-2 ring-[rgb(var(--dc-primary-rgb)/0.62)]"
    : "border-[rgb(var(--dc-border-rgb)/0.72)] shadow-md group-hover:scale-[1.02] group-hover:shadow-xl";

  return `relative aspect-[16/10] w-full overflow-hidden border bg-[rgb(var(--dc-surface-elevated-rgb)/0.82)] transition-all duration-200 ${radius} ${selectedClass}`;
}

export function sealedTileImagePaddingClass(cardSize: CardSize): string {
  if (cardSize === "large") {
    return "p-4 transition-transform duration-200 group-hover:scale-[1.02] max-[640px]:p-2.5";
  }

  if (cardSize === "medium") {
    return "p-3.5 transition-transform duration-200 group-hover:scale-[1.02] max-[640px]:p-2";
  }

  return "p-3 transition-transform duration-200 group-hover:scale-[1.02] max-[640px]:p-1.5";
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
    return "line-clamp-2 text-[17px] font-bold leading-tight text-[var(--dc-text-primary)] max-[640px]:text-[12px]";
  }

  if (cardSize === "medium") {
    return "line-clamp-2 text-[15px] font-bold leading-tight text-[var(--dc-text-primary)] max-[640px]:text-[12px]";
  }

  return "line-clamp-2 text-[13px] font-bold leading-tight text-[var(--dc-text-primary)] max-[640px]:text-[11px]";
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
    return "whitespace-nowrap text-[18px] font-bold tabular-nums leading-tight text-[var(--dc-text-primary)] max-[640px]:text-[12px]";
  }

  if (cardSize === "medium") {
    return "whitespace-nowrap text-[16px] font-bold tabular-nums leading-tight text-[var(--dc-text-primary)] max-[640px]:text-[12px]";
  }

  return "whitespace-nowrap text-[14px] font-bold tabular-nums leading-tight text-[var(--dc-text-primary)] max-[640px]:text-[11px]";
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
  return "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border !border-[rgb(var(--dc-border-rgb)/0.9)] !bg-[var(--dc-surface-elevated)] !text-[var(--dc-text-secondary)] shadow-sm backdrop-blur transition-colors hover:!border-[rgb(var(--dc-primary-rgb)/0.34)] hover:!bg-[rgb(var(--dc-primary-rgb)/0.12)] hover:!text-[var(--dc-primary)] disabled:cursor-not-allowed disabled:opacity-50 max-[640px]:!h-7 max-[640px]:!w-7 max-[640px]:shadow-none";
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
    return `${base} border-[rgb(var(--dc-success-rgb)/0.24)] bg-[var(--dc-success-bg)] text-[var(--dc-success)]`;
  }

  if (tone === "positive") {
    return `${base} border-[rgb(var(--dc-success-rgb)/0.24)] bg-[var(--dc-success-bg)] text-[var(--dc-success)]`;
  }

  if (tone === "negative") {
    return `${base} border-[rgb(var(--dc-negative-rgb)/0.24)] bg-[var(--dc-negative-bg)] text-[var(--dc-negative)]`;
  }

  if (tone === "quantity") {
    return `${base} border-[rgb(var(--dc-primary-rgb)/0.22)] bg-[rgb(var(--dc-primary-rgb)/0.1)] text-[var(--dc-primary)]`;
  }

  return `${base} border-[rgb(var(--dc-border-rgb)/0.82)] bg-[rgb(var(--dc-surface-elevated-rgb)/0.7)] text-[var(--dc-text-secondary)]`;
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
