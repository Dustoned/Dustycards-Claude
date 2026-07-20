"use client";

import Link from "next/link";
import type {
  ComponentPropsWithoutRef,
  HTMLAttributes,
  ReactNode,
} from "react";
import { ImageOff } from "lucide-react";
import { getCardImageFrameClassName } from "@/lib/card-image-display";

function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

type TileState = "default" | "highlighted" | "selected";

const TILE_STATE_CLASS: Record<TileState, string> = {
  default:
    "border-[rgb(var(--dc-border-rgb)/0.88)] hover:border-[rgb(var(--dc-border-hover-rgb)/0.95)]",
  highlighted:
    "border-rose-300/60 bg-[linear-gradient(145deg,rgb(var(--dc-surface-elevated-rgb)/0.96),rgb(var(--dc-surface-primary-rgb)/0.98))] shadow-[0_0_0_1px_rgba(251,113,133,0.22),0_16px_38px_rgba(244,63,94,0.12)]",
  selected:
    "border-blue-400/70 ring-2 ring-blue-400/45",
};

export interface CardListTileProps
  extends Omit<ComponentPropsWithoutRef<"article">, "children"> {
  children?: ReactNode;
  interactive?: boolean;
  state?: TileState;
  accent?: "market" | "radar" | "collection";
}

export function CardListTile({
  children,
  className,
  interactive = false,
  state = "default",
  accent = "market",
  ...props
}: CardListTileProps) {
  return (
    <article
      {...props}
      data-card-list-tile
      data-card-list-accent={accent}
      data-card-list-state={state}
      className={cx(
        "group/card-list relative grid min-w-0 grid-cols-[clamp(5.75rem,26vw,6.5rem)_minmax(0,1fr)] items-start gap-3 overflow-hidden rounded-[1.2rem] border bg-[linear-gradient(145deg,rgb(var(--dc-surface-elevated-rgb)/0.94),rgb(var(--dc-surface-primary-rgb)/0.97))] p-3 text-left shadow-[0_12px_34px_rgba(0,0,0,0.14)] outline-none transition-[border-color,background-color,box-shadow] max-[359px]:grid-cols-[5.5rem_minmax(0,1fr)] max-[359px]:gap-2.5 max-[359px]:p-2.5 sm:grid-cols-[5.75rem_minmax(0,1fr)]",
        TILE_STATE_CLASS[state],
        interactive &&
          "cursor-pointer focus-visible:ring-2 focus-visible:ring-[rgb(var(--dc-primary-rgb)/0.55)]",
        accent === "radar" &&
          "before:pointer-events-none before:absolute before:inset-x-8 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-violet-300/55 before:to-transparent",
        className
      )}
    >
      {children}
    </article>
  );
}

export interface CardListTileMediaProps extends HTMLAttributes<HTMLDivElement> {
  imageUrl?: string | null;
  kind?: "card" | "product";
  emptyLabel?: string;
  children?: ReactNode;
}

export function CardListTileMedia({
  imageUrl,
  kind = "card",
  emptyLabel,
  children,
  className,
  ...props
}: CardListTileMediaProps) {
  const baseClassName = cx(
    "relative w-full shrink-0 overflow-hidden border border-[rgb(var(--dc-border-rgb)/0.82)] bg-[linear-gradient(145deg,rgb(var(--dc-surface-hover-rgb)/0.56),rgb(var(--dc-surface-primary-rgb)/0.86))] shadow-[0_8px_20px_rgba(0,0,0,0.2)]",
    kind === "card" ? "aspect-[63/88] rounded-[0.72rem]" : "aspect-square rounded-xl",
    !imageUrl &&
      "bg-[repeating-linear-gradient(135deg,rgb(var(--dc-surface-hover-rgb)/0.62)_0_8px,rgb(var(--dc-surface-primary-rgb)/0.9)_8px_16px)]",
    className
  );
  const resolvedClassName =
    kind === "card"
      ? getCardImageFrameClassName(imageUrl, baseClassName)
      : baseClassName;

  return (
    <div
      {...props}
      data-card-list-media
      data-card-list-media-kind={kind}
      data-card-list-media-state={imageUrl ? "ready" : "empty"}
      className={resolvedClassName}
    >
      {children ??
        (!imageUrl ? (
          <span className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 px-2 text-center text-white/34">
            <ImageOff className="h-6 w-6" aria-hidden="true" />
            {emptyLabel ? (
              <span className="line-clamp-2 text-[9px] font-bold uppercase tracking-[0.1em]">
                {emptyLabel}
              </span>
            ) : null}
          </span>
        ) : null)}
    </div>
  );
}

export function CardListTileBody({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      data-card-list-body
      className={cx("flex min-h-full min-w-0 flex-col", className)}
    />
  );
}

export function CardListTilePrice({
  label,
  value,
  className,
  valueClassName,
}: {
  label?: ReactNode;
  value: ReactNode;
  className?: string;
  valueClassName?: string;
}) {
  return (
    <div
      data-card-list-price
      className={cx("shrink-0 text-right", className)}
    >
      <p
        className={cx(
          "whitespace-nowrap text-[17px] font-extrabold leading-5 tabular-nums text-white",
          valueClassName
        )}
      >
        {value}
      </p>
      {label ? (
        <p className="mt-0.5 truncate text-[9px] font-bold uppercase tracking-[0.12em] text-white/32">
          {label}
        </p>
      ) : null}
    </div>
  );
}

export function CardListTileMetrics({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      data-card-list-metrics
      className={cx(
        "mt-2 grid min-w-0 grid-cols-2 gap-x-2 gap-y-1.5 border-t border-[rgb(var(--dc-border-rgb)/0.72)] pt-2 sm:grid-cols-4",
        className
      )}
    />
  );
}

export function CardListTileInsight({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      data-card-list-insight
      className={cx(
        "mt-2 flex min-w-0 items-start gap-1.5 text-[11px] font-medium leading-[1.05rem] text-white/60",
        className
      )}
    />
  );
}

export function CardListTileFooter({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      data-card-list-footer
      className={cx(
        "relative z-10 mt-auto flex min-h-11 min-w-0 items-end justify-between gap-2 pt-2",
        className
      )}
    />
  );
}

export interface CardListTileLinkProps
  extends ComponentPropsWithoutRef<typeof Link> {
  label: string;
}

export function CardListTileLink({
  label,
  className,
  children,
  ...props
}: CardListTileLinkProps) {
  return (
    <Link
      {...props}
      data-card-list-link
      aria-label={label}
      className={cx(
        "absolute inset-0 z-0 rounded-[inherit] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[rgb(var(--dc-primary-rgb)/0.72)]",
        className
      )}
    >
      {children ?? <span className="sr-only">{label}</span>}
    </Link>
  );
}
