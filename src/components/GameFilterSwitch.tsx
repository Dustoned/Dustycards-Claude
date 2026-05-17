import Link from "next/link";

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

export function SegmentedNavLinks({
  items,
  ariaLabel,
  even = false,
  className = "",
}: {
  items: readonly GameFilterSwitchItem[];
  ariaLabel: string;
  even?: boolean;
  className?: string;
}) {
  if (items.length <= 0) return null;

  return (
    <nav
      aria-label={ariaLabel}
      className={cx(
        "min-w-0 rounded-[1.35rem] border border-black/10 bg-black/[0.035] p-1 shadow-sm shadow-black/5 dark:border-white/12 dark:bg-white/[0.055] dark:shadow-black/20",
        className
      )}
    >
      <div
        className={
          even
            ? "grid min-w-0 gap-1"
            : "flex min-w-0 overflow-x-auto [scrollbar-width:none]"
        }
        style={even ? { gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` } : undefined}
      >
        {items.map((item) => (
          <Link
            key={`${item.href}:${item.label}`}
            href={item.href}
            prefetch={false}
            aria-current={item.active ? "page" : undefined}
            className={cx(
              "inline-flex h-9 min-w-0 shrink-0 items-center justify-center rounded-full px-4 text-[13px] font-bold leading-none transition-colors",
              item.active
                ? "bg-gray-950 text-white shadow-sm shadow-black/12 dark:bg-white dark:text-gray-950 dark:shadow-none"
                : "text-gray-500 hover:bg-black/[0.04] hover:text-gray-900 dark:text-white/58 dark:hover:bg-white/[0.07] dark:hover:text-white"
            )}
          >
            <span className="truncate">{item.label}</span>
          </Link>
        ))}
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
      className="inline-flex min-w-0 max-w-full items-center gap-1 rounded-full border border-black/6 bg-black/[0.025] p-0.5 dark:border-white/8 dark:bg-black/20"
    >
      {group.label ? (
        <span className="shrink-0 pl-2 pr-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-400 dark:text-white/36">
          {group.label}
        </span>
      ) : null}
      <span className="inline-flex min-w-0 overflow-x-auto rounded-full [scrollbar-width:none]">
        {group.items.map((item) => (
          <Link
            key={`${item.href}:${item.label}`}
            href={item.href}
            prefetch={false}
            aria-current={item.active ? "page" : undefined}
            className={cx(
              "inline-flex h-7 shrink-0 items-center justify-center rounded-full px-3 text-[12px] font-semibold leading-none transition-colors sm:px-3.5",
              item.active
                ? "bg-gray-950 text-white shadow-sm shadow-black/12 dark:bg-white dark:text-gray-950 dark:shadow-none"
                : "text-gray-500 hover:bg-black/[0.04] hover:text-gray-900 dark:text-white/52 dark:hover:bg-white/[0.07] dark:hover:text-white"
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
        "inline-flex max-w-full flex-wrap items-center justify-end gap-1.5 rounded-[1.35rem] border border-black/8 bg-white/70 p-1.5 shadow-sm shadow-black/5 backdrop-blur-xl dark:border-white/10 dark:bg-white/[0.06] dark:shadow-black/20",
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
