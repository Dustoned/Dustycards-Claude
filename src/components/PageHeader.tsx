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
    icon: "text-gray-500 dark:text-white/55",
    surface: "border-black/6 bg-white/75 dark:border-white/10 dark:bg-white/[0.055]",
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

function metricToneClass(tone: HeaderMetricTone) {
  const tones: Record<HeaderMetricTone, string> = {
    emerald:
      "border-emerald-400/20 bg-emerald-400/[0.08] text-emerald-700 dark:text-emerald-200",
    amber: "border-amber-400/20 bg-amber-400/[0.08] text-amber-700 dark:text-amber-200",
    rose: "border-rose-400/20 bg-rose-400/[0.08] text-rose-700 dark:text-rose-200",
    sky: "border-sky-400/20 bg-sky-400/[0.08] text-sky-700 dark:text-sky-200",
    violet:
      "border-violet-400/20 bg-violet-400/[0.08] text-violet-700 dark:text-violet-200",
    slate:
      "border-black/8 bg-black/[0.035] text-gray-700 dark:border-white/10 dark:bg-white/[0.055] dark:text-white/76",
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
        "min-w-[var(--ui-binder-metric-min-width)] flex-1 rounded-[var(--ui-binder-metric-radius)] border px-[var(--ui-binder-metric-x)] py-[var(--ui-binder-metric-y)] sm:flex-none",
        metricToneClass(tone),
        className
      )}
    >
      <p className="text-[length:var(--ui-binder-metric-label-size)] font-semibold uppercase tracking-[0.14em] opacity-68">
        {label}
      </p>
      <p className="mt-1.5 min-w-0 break-words text-[length:var(--ui-binder-metric-value-size)] font-bold leading-tight tracking-tight tabular-nums">
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
  const progressColor = accentColor ?? "#10b981";

  return (
    <div
      className={cx(
        "w-full min-w-0 rounded-[var(--ui-binder-metric-radius)] border border-emerald-400/18 bg-emerald-400/[0.075] px-[var(--ui-binder-metric-x)] py-[var(--ui-binder-metric-y)] text-emerald-800 dark:text-emerald-100 sm:min-w-[var(--ui-binder-progress-min-width)] sm:w-auto",
        className
      )}
    >
      <div className="flex min-w-0 items-end justify-between gap-2 sm:gap-4">
        <div className="min-w-0">
          <p className="text-[length:var(--ui-binder-metric-label-size)] font-semibold uppercase tracking-[0.14em] opacity-68">
            {label}
          </p>
          <p className="mt-1.5 min-w-0 break-words text-[length:var(--ui-binder-progress-value-size)] font-bold leading-tight tabular-nums">
            {value}
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-emerald-400/20 bg-emerald-400/[0.10] px-2.5 py-1 text-[length:var(--ui-header-pill-font-size)] font-bold tabular-nums">
          {Math.round(safePercent)}%
        </span>
      </div>
      <div className="mt-3 h-[var(--ui-binder-progress-height)] overflow-hidden rounded-full bg-black/8 dark:bg-black/28">
        <div
          className="h-full rounded-full shadow-[0_0_18px_rgba(16,185,129,0.38)]"
          style={{
            width: `${safePercent}%`,
            background: `linear-gradient(90deg, ${progressColor}, #34d399)`,
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
  const progressColor = accentColor ?? "#10b981";
  const secondaryProgressColor = secondaryAccentColor ?? "#38bdf8";

  return (
    <div
      className={cx(
        "w-full min-w-0 rounded-[var(--ui-binder-metric-radius)] border border-emerald-400/18 bg-emerald-400/[0.075] px-[var(--ui-binder-metric-x)] py-[var(--ui-binder-metric-y)] text-emerald-800 dark:text-emerald-100 sm:min-w-[var(--ui-binder-progress-min-width)] sm:w-auto",
        className
      )}
    >
      <div className="flex min-w-0 items-end justify-between gap-2 sm:gap-4">
        <div className="min-w-0">
          <p className="text-[length:var(--ui-binder-metric-label-size)] font-semibold uppercase tracking-[0.14em] opacity-68">
            {label}
          </p>
          <p className="mt-1.5 min-w-0 break-words text-[length:var(--ui-binder-progress-value-size)] font-bold leading-tight tabular-nums">
            {value}
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-emerald-400/20 bg-emerald-400/[0.10] px-2.5 py-1 text-[length:var(--ui-header-pill-font-size)] font-bold tabular-nums">
          {Math.round(safePercent)}%
        </span>
      </div>
      <div className="mt-3 h-[var(--ui-binder-progress-height)] overflow-hidden rounded-full bg-black/8 dark:bg-black/28">
        <div
          className="h-full rounded-full shadow-[0_0_18px_rgba(16,185,129,0.38)]"
          style={{
            width: `${safePercent}%`,
            background: `linear-gradient(90deg, ${progressColor}, #34d399)`,
          }}
        />
      </div>
      <div className="mt-3 border-t border-emerald-400/12 pt-2.5">
        <div className="flex items-center justify-between gap-3 text-[length:var(--ui-binder-metric-label-size)] font-semibold uppercase tracking-[0.14em] opacity-72">
          <span className="sm:whitespace-nowrap">{secondaryLabel}</span>
          <span className="inline-flex items-center font-bold normal-case tracking-normal tabular-nums opacity-90 sm:whitespace-nowrap">
            {secondaryValue}
            <span className="ml-2 hidden rounded-full border border-sky-300/20 bg-sky-300/[0.10] px-2 py-0.5 text-[length:var(--ui-header-pill-font-size)] text-sky-700 dark:text-sky-200 sm:inline-flex">
              {Math.round(safeSecondaryPercent)}%
            </span>
          </span>
        </div>
        <div className="mt-2 h-[calc(var(--ui-binder-progress-height)*0.72)] overflow-hidden rounded-full bg-black/8 dark:bg-black/28">
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
    <div className="min-w-0 rounded-[var(--ui-header-stat-radius)] border border-black/8 bg-white/70 p-[var(--ui-header-stat-padding)] shadow-sm shadow-black/5 dark:border-white/10 dark:bg-white/[0.045] dark:shadow-none sm:min-h-[var(--ui-header-stat-min-height)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="line-clamp-2 text-[length:var(--ui-header-stat-label-size)] font-semibold uppercase leading-tight tracking-[0.12em] text-gray-400 dark:text-white/42">
            {label}
          </p>
          <p className="mt-2 truncate whitespace-nowrap text-[length:var(--ui-header-stat-value-size)] font-semibold leading-tight tracking-tight text-gray-950 dark:text-white">
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
        <p className="mt-3 line-clamp-2 text-[length:var(--ui-header-stat-hint-size)] leading-snug text-gray-500 dark:text-white/50">
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
  accentColor,
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
  accentColor?: string | null;
  className?: string;
  gridClassName?: string;
  sideClassName?: string;
  statsClassName?: string;
  style?: CSSProperties;
}) {
  const hasStats = Boolean(stats?.length);
  const hasSideContent = hasStats || accessory;

  return (
    <section
      className={cx(
        "relative w-full overflow-hidden rounded-[var(--ui-page-header-radius)] border border-black/8 bg-[linear-gradient(135deg,rgba(255,255,255,0.76),rgba(255,255,255,0.52))] p-[var(--ui-page-header-padding)] shadow-lg shadow-black/5 dark:border-white/10 dark:bg-[linear-gradient(135deg,rgba(255,255,255,0.07),rgba(255,255,255,0.032))] dark:shadow-black/20",
        className
      )}
      style={style}
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/60 to-transparent dark:via-white/18"
        style={accentColor ? { background: accentColor } : undefined}
      />
      <div className="pointer-events-none absolute inset-y-6 left-0 w-px bg-gradient-to-b from-transparent via-white/45 to-transparent dark:via-white/14" />

      {backLinks ? (
        <div className="mb-4 [&_a]:text-[length:var(--ui-header-action-font-size)] [&_svg]:h-[var(--ui-header-stat-icon-size)] [&_svg]:w-[var(--ui-header-stat-icon-size)]">
          {backLinks}
        </div>
      ) : null}

      <div
        className={cx(
          "relative grid gap-[var(--ui-page-header-grid-gap)]",
          hasSideContent && !gridClassName
            ? "xl:grid-cols-[minmax(22rem,0.95fr)_minmax(0,1.05fr)] xl:items-stretch 2xl:grid-cols-[minmax(24rem,0.95fr)_minmax(0,1.15fr)]"
            : "",
          gridClassName
        )}
      >
        <div className="flex min-w-0 flex-col gap-[var(--ui-page-header-leading-gap)] sm:flex-row">
          {leadingVisual ? <div className="shrink-0">{leadingVisual}</div> : null}

          <div className="min-w-0 flex-1">
            {(eyebrow || titleActions) ? (
              <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
                {eyebrow ? (
                  <p className="min-w-0 text-[length:var(--ui-page-header-eyebrow-size)] font-semibold uppercase tracking-[0.14em] text-gray-400 dark:text-white/42">
                    {eyebrow}
                  </p>
                ) : (
                  <span />
                )}
                {titleActions ? (
                  <div className="min-w-0 max-w-full sm:shrink-0">{titleActions}</div>
                ) : null}
              </div>
            ) : null}
            <h1 className="mt-2 min-w-0 text-[length:var(--ui-page-header-title-size)] font-bold leading-tight tracking-tight text-gray-950 dark:text-white">
              {title}
            </h1>
            {description ? (
              <div className="mt-3 max-w-4xl text-[length:var(--ui-page-header-description-size)] leading-[var(--ui-page-header-description-leading)] text-gray-500 dark:text-white/56">
                {description}
              </div>
            ) : null}
            {actions ? <div className="mt-[var(--ui-page-header-action-margin)]">{actions}</div> : null}
          </div>
        </div>

        {hasSideContent ? (
          <div className={cx("min-w-0 self-stretch space-y-3", sideClassName)}>
            {accessory}
            {hasStats ? (
            <div
                className={cx(
                  "grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-[repeat(auto-fit,minmax(min(11rem,100%),1fr))] sm:gap-3",
                  statsClassName
                )}
              >
                {stats!.map((stat) => (
                  <HeaderStatCard key={stat.label} {...stat} />
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
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
    <div className={cx("mb-5 flex flex-wrap items-end justify-between gap-[var(--ui-section-header-gap)] border-b border-black/8 pb-[var(--ui-section-header-padding-bottom)] dark:border-white/8", className)}>
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-[var(--ui-section-header-gap)]">
          {eyebrow ? (
            <p className="text-[length:var(--ui-page-header-eyebrow-size)] font-semibold uppercase tracking-[0.14em] text-gray-400 dark:text-white/40">
              {eyebrow}
            </p>
          ) : null}
          <h2
            className={
              compact
                ? "truncate text-[length:var(--ui-section-header-compact-size)] font-semibold uppercase tracking-[0.13em] text-gray-500 dark:text-white/52"
                : "truncate text-[length:var(--ui-section-header-title-size)] font-bold tracking-tight text-gray-950 dark:text-white"
            }
          >
            {title}
          </h2>
          {count != null ? (
            <span className="inline-flex min-h-[var(--ui-chip-count-min-height)] items-center rounded-full border border-black/8 bg-black/[0.035] px-[var(--ui-chip-count-x)] py-[var(--ui-chip-count-y)] text-[length:var(--ui-section-header-count-size)] font-semibold leading-none text-gray-400 dark:border-white/8 dark:bg-white/[0.04] dark:text-white/40">
              {count}
            </span>
          ) : null}
        </div>
        {description ? (
          <p className="mt-1.5 text-[length:var(--ui-section-header-description-size)] text-gray-500 dark:text-white/45">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </div>
  );
}
