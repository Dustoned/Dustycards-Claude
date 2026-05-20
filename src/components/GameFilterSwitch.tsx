"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export interface GameFilterSwitchItem {
  href: string;
  label: string;
  active: boolean;
}

export interface HeaderControlGroup {
  label?: string;
  items: readonly GameFilterSwitchItem[];
  ariaLabel?: string;
}

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

const ACTIVE_SEGMENT_CLASS =
  "border border-violet-400/40 bg-violet-600 text-white";

export function SegmentedNavLinks({
  items,
  ariaLabel,
  even = false,
  buttonNavigation = false,
  preserveScroll = false,
  className = "",
}: {
  items: readonly GameFilterSwitchItem[];
  ariaLabel: string;
  even?: boolean;
  buttonNavigation?: boolean;
  preserveScroll?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const activeItemRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (even) return;
    const activeItem = activeItemRef.current;
    const scrollContainer = scrollContainerRef.current;
    if (!activeItem || !scrollContainer) return;
    if (scrollContainer.scrollWidth <= scrollContainer.clientWidth + 1) return;

    const activeCenter = activeItem.offsetLeft + activeItem.offsetWidth / 2;
    scrollContainer.scrollTo({
      left: Math.max(0, activeCenter - scrollContainer.clientWidth / 2),
      behavior: "smooth",
    });
  }, [even, items]);

  if (items.length <= 0) return null;

  return (
    <nav
      aria-label={ariaLabel}
      className={cx(
        "relative min-w-0 max-w-full overflow-hidden rounded-[1.35rem] border border-white/10 bg-white/[0.055] p-1 shadow-sm shadow-black/20",
        className
      )}
    >
      <div
        ref={scrollContainerRef}
        className={
          even
            ? "grid min-w-0 gap-1"
            : "grid min-w-0 gap-1"
        }
        style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
      >
        {items.map((item) => {
          const itemClassName = cx(
            "inline-flex min-w-0 shrink-0 items-center justify-center rounded-full font-bold leading-none transition-colors",
            even
              ? "h-8 px-1 text-[10px] min-[390px]:px-1.5 min-[390px]:text-[11px] sm:h-9 sm:px-4 sm:text-[13px]"
              : "h-8 px-1 text-[10px] min-[390px]:px-1.5 min-[390px]:text-[11px] sm:h-9 sm:min-w-max sm:px-4 sm:text-[13px]",
            item.active
              ? ACTIVE_SEGMENT_CLASS
              : "text-white/58 hover:bg-white/[0.07] hover:text-white"
          );
          const label = (
            <span className={even ? "whitespace-nowrap" : "whitespace-nowrap"}>{item.label}</span>
          );

          if (buttonNavigation) {
            return (
              <button
                key={`${item.href}:${item.label}`}
                ref={item.active ? (node) => { activeItemRef.current = node; } : undefined}
                type="button"
                aria-current={item.active ? "page" : undefined}
                onClick={() => {
                  if (!item.active) {
                    router.push(item.href, { scroll: !preserveScroll });
                  }
                }}
                className={itemClassName}
              >
                {label}
              </button>
            );
          }

          return (
            <Link
              key={`${item.href}:${item.label}`}
              ref={item.active ? (node) => { activeItemRef.current = node; } : undefined}
              href={item.href}
              prefetch={false}
              scroll={preserveScroll ? false : undefined}
              aria-current={item.active ? "page" : undefined}
              className={itemClassName}
            >
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function HeaderSegmentedGroup({
  group,
}: {
  group: HeaderControlGroup;
}) {
  if (group.items.length <= 0) return null;

  return (
    <nav
      aria-label={group.ariaLabel ?? group.label}
      className="inline-flex min-w-0 max-w-full items-center gap-1 rounded-full border border-white/8 bg-black/20 p-0.5"
    >
      {group.label ? (
        <span className="shrink-0 pl-2 pr-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/36">
          {group.label}
        </span>
      ) : null}
      <span
        className="grid min-w-0 flex-1 gap-0.5 rounded-full sm:inline-flex sm:flex-none"
        style={{ gridTemplateColumns: `repeat(${group.items.length}, minmax(0, 1fr))` }}
      >
        {group.items.map((item) => (
          <Link
            key={`${item.href}:${item.label}`}
            href={item.href}
            prefetch={false}
            aria-current={item.active ? "page" : undefined}
            className={cx(
              "inline-flex h-7 min-w-0 shrink-0 items-center justify-center rounded-full px-1.5 text-[10px] font-semibold leading-none transition-colors min-[390px]:px-2 min-[390px]:text-[11px] sm:min-w-max sm:px-3.5 sm:text-[12px]",
              item.active
                ? ACTIVE_SEGMENT_CLASS
                : "text-white/52 hover:bg-white/[0.07] hover:text-white"
            )}
          >
            {item.label}
          </Link>
        ))}
      </span>
    </nav>
  );
}

export function HeaderControlCluster({
  groups,
  className = "",
}: {
  groups: readonly HeaderControlGroup[];
  className?: string;
}) {
  const visibleGroups = groups.filter((group) => group.items.length > 0);
  if (visibleGroups.length === 0) return null;

  return (
    <div
      className={cx(
        "inline-flex max-w-full flex-wrap items-center justify-end gap-1.5 rounded-[1.35rem] border border-white/10 bg-white/[0.06] p-1.5 shadow-sm shadow-black/20 backdrop-blur-xl",
        className
      )}
    >
      {visibleGroups.map((group) => (
        <HeaderSegmentedGroup key={group.ariaLabel ?? group.label ?? group.items[0]?.href} group={group} />
      ))}
    </div>
  );
}

export default function GameFilterSwitch({
  items,
  className = "",
  ariaLabel = "Trading card game",
}: {
  items: readonly GameFilterSwitchItem[];
  label?: string;
  className?: string;
  ariaLabel?: string;
}) {
  if (items.length <= 1) return null;

  return (
    <SegmentedNavLinks
      items={items}
      ariaLabel={ariaLabel}
      even
      className={cx("w-full max-w-[21.5rem]", className)}
    />
  );
}
