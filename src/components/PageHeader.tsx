import type { CSSProperties, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export type HeaderTone =
  | "slate"
  | "emerald"
  | "amber"
  | "sky"
  | "rose"
  | "violet"
  | "blue";

export interface HeaderStat {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  Icon?: LucideIcon;
  tone?: HeaderTone;
}

export type HeaderMetricTone = "emerald" | "amber" | "rose" | "sky" | "violet" | "slate";

const toneClasses: Record<HeaderTone, { icon: string; surface: string }> = {
  slate: {
    icon: "text-white/62",
    surface: "border-white/10 bg-white/[0.055]",
  },
  emerald: {
    icon: "text-emerald-600 dark:text-emerald-300",
    surface: "border-emerald-400/14 bg-emerald-400/[0.07]",
  },
  amber: {
    icon: "text-amber-600 dark:text-amber-300",
    surface: "border-amber-400/14 bg-amber-400/[0.07]",
  },
  sky: {
    icon: "text-sky-600 dark:text-sky-300",
    surface: "border-sky-400/14 bg-sky-400/[0.07]",
  },
  rose: {
    icon: "text-rose-600 dark:text-rose-300",
    surface: "border-rose-400/14 bg-rose-400/[0.07]",
  },
  violet: {
    icon: "text-violet-600 dark:text-violet-300",
    surface: "border-violet-400/14 bg-violet-400/[0.07]",
  },
  blue: {
    icon: "text-blue-600 dark:text-blue-300",
    surface: "border-blue-400/14 bg-blue-400/[0.07]",
  },
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function metricValueToneClass(tone: HeaderMetricTone): string {
  const tones: Record<HeaderMetricTone, string> = {
    emerald: "text-emerald-200",
    amber: "text-amber-200",
    rose: "text-rose-200",
    sky: "text-sky-200",
    violet: "text-violet-200",
    slate: "text-white",
  };

  return tones[tone];
}

export function HeaderMetricChip({
  label,
  value,
  tone = "slate",
  className = "",
}: {
  label: string;
  value: ReactNode;
  tone?: HeaderMetricTone;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "min-w-[var(--ui-binder-metric-min-width)] flex-1 rounded-[var(--ui-binder-metric-radius)] border border-white/9 bg-white/[0.045] px-[var(--ui-binder-metric-x)] py-[var(--ui-binder-metric-y)] shadow-sm shadow-black/20 sm:flex-none",
        className
      )}
    >
      <p className="text-[length:var(--ui-binder-metric-label-size)] font-semibold uppercase tracking-[0.14em] text-white/40">
        {label}
      </p>
      <p
        className={cx(
          "mt-1.5 min-w-0 break-words text-[length:var(--ui-binder-metric-value-size)] font-bold leading-tight tracking-tight tabular-nums",
          metricValueToneClass(tone)
        )}
      >
        {value}
      </p>
    </div>
  );
}

export function HeaderProgressMeter({
  label,
  value,
  percent,
  accentColor,
  className = "",
}: {
  label: string;
  value: ReactNode;
  percent: number;
  accentColor?: string | null;
  className?: string;
}) {
  const safePercent = Math.min(100, Math.max(0, percent));
  const progressColor = accentColor ?? "var(--dc-primary)";

  return (
    <div
      className={cx(
        "w-full min-w-0 rounded-[var(--ui-header-stat-radius)] border border-white/9 bg-white/[0.045] p-[var(--ui-header-stat-padding)] text-white shadow-sm shadow-black/20 sm:min-h-[var(--ui-header-stat-min-height)] sm:min-w-[var(--ui-binder-progress-min-width)] sm:w-auto",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="line-clamp-2 text-[length:var(--ui-header-stat-label-size)] font-semibold uppercase leading-tight tracking-[0.12em] text-white/40">
            {label}
          </p>
          <p className="mt-1.5 whitespace-nowrap text-[length:var(--ui-header-stat-value-size)] font-bold leading-tight tracking-tight tabular-nums text-white">
            {value}
          </p>
        </div>
        <span className="inline-flex h-[var(--ui-header-stat-icon-box)] shrink-0 items-center justify-center rounded-full border border-emerald-400/14 bg-emerald-400/[0.07] px-2.5 text-[length:var(--ui-header-pill-font-size)] font-bold tabular-nums text-emerald-200">
          {Math.round(safePercent)}%
        </span>
      </div>
      <div className="mt-2 h-[var(--ui-binder-progress-height)] overflow-hidden rounded-full bg-black/28">
        <div
          className="h-full rounded-full"
          style={{
            width: `${safePercent}%`,
            background: `linear-gradient(90deg, ${progressColor}, #38BDF8)`,
            boxShadow: "0 0 18px rgb(var(--dc-primary-rgb) / 0.26)",
          }}
        />
      </div>
    </div>
  );
}

export function HeaderStackedProgressMeter({
  label,
  value,
  percent,
  secondaryLabel,
  secondaryValue,
  secondaryPercent,
  accentColor,
  secondaryAccentColor,
  className = "",
}: {
  label: string;
  value: ReactNode;
  percent: number;
  secondaryLabel: string;
  secondaryValue: ReactNode;
  secondaryPercent: number;
  accentColor?: string | null;
  secondaryAccentColor?: string | null;
  className?: string;
}) {
  const safePercent = Math.min(100, Math.max(0, percent));
  const safeSecondaryPercent = Math.min(100, Math.max(0, secondaryPercent));
  const progressColor = accentColor ?? "var(--dc-primary)";
  const secondaryProgressColor = secondaryAccentColor ?? "#38bdf8";

  return (
    <div
      className={cx(
        "w-full min-w-0 rounded-[var(--ui-header-stat-radius)] border border-white/9 bg-white/[0.045] p-[var(--ui-header-stat-padding)] text-white shadow-sm shadow-black/20 sm:min-h-[var(--ui-header-stat-min-height)] sm:min-w-[var(--ui-binder-progress-min-width)] sm:w-auto",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="line-clamp-2 text-[length:var(--ui-header-stat-label-size)] font-semibold uppercase leading-tight tracking-[0.12em] text-white/40">
            {label}
          </p>
          <p className="mt-1.5 whitespace-nowrap text-[length:var(--ui-header-stat-value-size)] font-bold leading-tight tracking-tight tabular-nums text-white">
            {value}
          </p>
        </div>
        <span className="inline-flex h-[var(--ui-header-stat-icon-box)] shrink-0 items-center justify-center rounded-full border border-emerald-400/14 bg-emerald-400/[0.07] px-2.5 text-[length:var(--ui-header-pill-font-size)] font-bold tabular-nums text-emerald-200">
          {Math.round(safePercent)}%
        </span>
      </div>
      <div className="mt-2 h-[var(--ui-binder-progress-height)] overflow-hidden rounded-full bg-black/28">
        <div
          className="h-full rounded-full"
          style={{
            width: `${safePercent}%`,
            background: `linear-gradient(90deg, ${progressColor}, #38BDF8)`,
            boxShadow: "0 0 18px rgb(var(--dc-primary-rgb) / 0.26)",
          }}
        />
      </div>
      <div className="mt-3 border-t border-white/8 pt-2">
        <div className="flex items-center justify-between gap-3 text-[length:var(--ui-header-stat-hint-size)] leading-snug text-white/48">
          <span className="font-semibold uppercase tracking-[0.12em] text-white/40 sm:whitespace-nowrap">
            {secondaryLabel}
          </span>
          <span className="inline-flex items-center gap-2 font-bold tabular-nums text-sky-200 sm:whitespace-nowrap">
            {secondaryValue}
            <span className="hidden rounded-full border border-sky-400/14 bg-sky-400/[0.07] px-2 py-0.5 text-[length:var(--ui-header-pill-font-size)] text-sky-200 sm:inline-flex">
              {Math.round(safeSecondaryPercent)}%
            </span>
          </span>
        </div>
        <div className="mt-2 h-[calc(var(--ui-binder-progress-height)*0.72)] overflow-hidden rounded-full bg-black/28">
          <div
            className="h-full rounded-full shadow-[0_0_14px_rgba(56,189,248,0.28)]"
            style={{
              width: `${safeSecondaryPercent}%`,
              background: `linear-gradient(90deg, ${secondaryProgressColor}, #67e8f9)`,
            }}
          />
        </div>
      </div>
    </div>
  );
}

export function HeaderAction({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "flex flex-wrap items-center gap-[var(--ui-header-action-gap)] text-[length:var(--ui-header-action-font-size)] [&>a]:px-[var(--ui-header-action-x)] [&>a]:py-[var(--ui-header-action-y)] [&>a]:text-[length:var(--ui-header-action-font-size)] [&>button]:px-[var(--ui-header-action-x)] [&>button]:py-[var(--ui-header-action-y)] [&>button]:text-[length:var(--ui-header-action-font-size)]",
        className
      )}
    >
      {children}
    </div>
  );
}

export function HeaderPill({
  children,
  tone = "slate",
  className = "",
}: {
  children: ReactNode;
  tone?: HeaderTone;
  className?: string;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-2 rounded-full border px-[var(--ui-header-pill-x)] py-[var(--ui-header-pill-y)] text-[length:var(--ui-header-pill-font-size)] font-semibold leading-none text-gray-600 dark:text-white/68",
        toneClasses[tone].surface,
        className
      )}
    >
      {children}
    </span>
  );
}

export function HeaderStatCard({
  label,
  value,
  hint,
  Icon,
  tone = "slate",
}: HeaderStat) {
  const toneClass = toneClasses[tone];

  return (
    <div className="flex h-full min-w-0 flex-col rounded-[var(--ui-header-stat-radius)] border border-white/9 bg-white/[0.045] p-[var(--ui-header-stat-padding)] shadow-sm shadow-black/20 sm:min-h-[var(--ui-header-stat-min-height)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="line-clamp-2 text-[length:var(--ui-header-stat-label-size)] font-semibold uppercase leading-tight tracking-[0.12em] text-white/40">
            {label}
          </p>
          <p className="mt-1.5 whitespace-nowrap text-[length:var(--ui-header-stat-value-size)] font-bold leading-tight tracking-tight text-white">
            {value}
          </p>
        </div>
        {Icon ? (
          <span
            className={cx(
              "inline-flex h-[var(--ui-header-stat-icon-box)] w-[var(--ui-header-stat-icon-box)] shrink-0 items-center justify-center rounded-2xl border",
              toneClass.surface,
              toneClass.icon
            )}
        >
            <Icon className="h-[var(--ui-header-stat-icon-size)] w-[var(--ui-header-stat-icon-size)]" />
          </span>
        ) : null}
      </div>
      {hint ? (
        <p className="mt-2 line-clamp-2 text-[length:var(--ui-header-stat-hint-size)] leading-snug text-white/48">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function PageHeroHeader({
  eyebrow,
  title,
  description,
  actions,
  titleActions,
  stats,
  backLinks,
  leadingVisual,
  accessory,
  sideContent,
  className = "",
  gridClassName = "",
  sideClassName = "",
  statsClassName = "",
  style,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  titleActions?: ReactNode;
  stats?: HeaderStat[];
  backLinks?: ReactNode;
  leadingVisual?: ReactNode;
  accessory?: ReactNode;
  sideContent?: ReactNode;
  accentColor?: string | null;
  className?: string;
  gridClassName?: string;
  sideClassName?: string;
  statsClassName?: string;
  style?: CSSProperties;
}) {
  const hasStats = Boolean(stats?.length);
  const hasAccessory = Boolean(accessory);
  const hasSideContent = Boolean(sideContent) || hasStats;

  return (
    <div className={cx("flex w-full flex-col gap-3", className)} style={style}>
      {backLinks ? (
        <div className="[&_a]:text-[length:var(--ui-header-action-font-size)] [&_svg]:h-[var(--ui-header-stat-icon-size)] [&_svg]:w-[var(--ui-header-stat-icon-size)]">
          {backLinks}
        </div>
      ) : null}

      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex min-w-0 gap-[var(--ui-page-header-leading-gap)]">
          {leadingVisual ? <div className="shrink-0">{leadingVisual}</div> : null}
          <div className="min-w-0 flex-1">
            <h1 className="min-w-0 text-[length:var(--ui-page-header-title-size)] font-bold leading-tight tracking-tight text-white">
              {title}
            </h1>
            {description ? (
              <div className="mt-1 max-w-2xl text-[length:var(--ui-page-header-description-size)] leading-[var(--ui-page-header-description-leading)] text-white/52">
                {description}
              </div>
            ) : null}
            {eyebrow ? (
              <p className="mt-1 text-[length:var(--ui-page-header-eyebrow-size)] font-semibold uppercase tracking-[0.14em] text-white/42">
                {eyebrow}
              </p>
            ) : null}
          </div>
        </div>
        {titleActions ? (
          <div className="shrink-0 sm:ml-auto">{titleActions}</div>
        ) : null}
      </div>

      {actions ? <div>{actions}</div> : null}

      {(hasAccessory || hasSideContent) ? (
        <section
          className={cx(
            "grid min-w-0 gap-3",
            hasAccessory && hasSideContent
              ? "xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] xl:items-stretch"
              : "",
            gridClassName
          )}
        >
          {hasAccessory ? (
            <div className="binder-panel relative flex w-full min-w-0 flex-col overflow-hidden rounded-[var(--ui-page-header-radius)] p-3 sm:p-4 lg:p-5">
              <div className="min-w-0 flex-1 [&>section]:h-full [&>section]:w-full">
                {accessory}
              </div>
            </div>
          ) : null}
          {sideContent ? (
            <div className={cx("min-w-0", hasAccessory ? "h-full" : "", sideClassName)}>
              {sideContent}
            </div>
          ) : hasStats ? (
            <div
              className={cx(
                "grid min-w-0 grid-cols-2 gap-2 sm:gap-3",
                hasAccessory && stats!.length === 4 ? "xl:grid-rows-2" : "",
                hasAccessory && stats!.length === 6 ? "xl:grid-rows-3" : "",
                hasAccessory && stats!.length > 0 ? "xl:gap-3" : "",
                !hasAccessory ? "sm:grid-cols-4" : "",
                statsClassName,
                sideClassName
              )}
            >
              {stats!.map((stat) => (
                <HeaderStatCard key={stat.label} {...stat} />
              ))}
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

export function SectionHeader({
  title,
  eyebrow,
  count,
  description,
  actions,
  compact = false,
  className = "",
}: {
  title: ReactNode;
  eyebrow?: ReactNode;
  count?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div className={cx("mb-3 flex flex-wrap items-end justify-between gap-[var(--ui-section-header-gap)] border-b border-white/8 pb-[var(--ui-section-header-padding-bottom)]", className)}>
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-[var(--ui-section-header-gap)]">
          {eyebrow ? (
            <p className="text-[length:var(--ui-page-header-eyebrow-size)] font-semibold uppercase tracking-[0.14em] text-white/40">
              {eyebrow}
            </p>
          ) : null}
          <h2
            className={
              compact
                ? "truncate text-[length:var(--ui-section-header-compact-size)] font-semibold uppercase tracking-[0.13em] text-white/52"
                : "truncate text-[length:var(--ui-section-header-title-size)] font-bold tracking-tight text-white"
            }
          >
            {title}
          </h2>
          {count != null ? (
            <span className="inline-flex min-h-[var(--ui-chip-count-min-height)] items-center rounded-full border border-white/8 bg-white/[0.04] px-[var(--ui-chip-count-x)] py-[var(--ui-chip-count-y)] text-[length:var(--ui-section-header-count-size)] font-semibold leading-none text-white/42">
              {count}
            </span>
          ) : null}
        </div>
        {description ? (
          <p className="mt-1.5 text-[length:var(--ui-section-header-description-size)] text-white/45">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </div>
  );
}
