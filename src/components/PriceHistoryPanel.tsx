"use client";

export interface PriceHistoryValuePoint {
  date: string;
  label: string;
  value: number | null;
}

type CurrencyCode = "EUR" | "USD";
type Tone = "default" | "dark";

interface Props {
  title: string;
  currency: CurrencyCode;
  points: PriceHistoryValuePoint[];
  currentValue?: number | null;
  subtitle?: string;
  tone?: Tone;
  loading?: boolean;
  emptyText?: string;
  compact?: boolean;
}

const PADDING_X = 10;
const PADDING_Y = 10;

function formatCurrency(value: number | null | undefined, currency: CurrencyCode): string {
  if (value == null) return "--";

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDelta(value: number, currency: CurrencyCode): string {
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${formatCurrency(value, currency)}`;
}

function buildChart(points: PriceHistoryValuePoint[], width: number, height: number) {
  const validPoints = points.filter(
    (point): point is PriceHistoryValuePoint & { value: number } => point.value != null
  );

  if (validPoints.length === 0) {
    return null;
  }

  const min = Math.min(...validPoints.map((point) => point.value));
  const max = Math.max(...validPoints.map((point) => point.value));
  const isFlat = max === min;
  const span = max - min || Math.max(max, 1) * 0.08 || 1;
  const usableWidth = width - PADDING_X * 2;
  const usableHeight = height - PADDING_Y * 2;

  const coordinates = validPoints.map((point, index) => {
    const x =
      validPoints.length === 1
        ? width / 2
        : PADDING_X + (usableWidth * index) / (validPoints.length - 1);
    const ratio = isFlat ? 0.5 : (point.value - min) / span;
    const y = height - PADDING_Y - ratio * usableHeight;

    return { ...point, x, y };
  });

  const linePath = coordinates
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");
  const areaPath = `${linePath} L ${coordinates[coordinates.length - 1].x} ${height - PADDING_Y} L ${coordinates[0].x} ${height - PADDING_Y} Z`;

  return {
    min,
    max,
    coordinates,
    linePath,
    areaPath,
  };
}

export default function PriceHistoryPanel({
  title,
  currency,
  points,
  currentValue,
  subtitle,
  tone = "default",
  loading = false,
  emptyText = "Nog geen prijshistorie",
  compact = false,
}: Props) {
  const width = 320;
  const height = compact ? 78 : 112;
  const chart = buildChart(points, width, height);
  const validPoints = points.filter(
    (point): point is PriceHistoryValuePoint & { value: number } => point.value != null
  );
  const latestValue = currentValue ?? validPoints[validPoints.length - 1]?.value ?? null;
  const firstValue = validPoints[0]?.value ?? null;
  const delta =
    latestValue != null && firstValue != null && validPoints.length > 1
      ? latestValue - firstValue
      : null;

  const shellClass =
    tone === "dark"
      ? compact
        ? "rounded-2xl border border-white/10 bg-white/[0.06] px-3 py-3"
        : "rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-4"
      : compact
        ? "rounded-2xl border border-black/8 bg-black/[0.03] px-3 py-3 dark:border-white/8 dark:bg-white/[0.04]"
        : "rounded-2xl border border-black/8 bg-black/[0.03] px-4 py-4 dark:border-white/8 dark:bg-white/[0.04]";
  const titleClass =
    tone === "dark"
      ? "text-xs font-semibold uppercase tracking-[0.08em] text-white/50"
      : "text-xs font-semibold uppercase tracking-[0.08em] text-gray-500 dark:text-white/50";
  const valueClass =
    tone === "dark"
      ? compact
        ? "text-xl font-bold text-white tabular-nums"
        : "text-2xl font-bold text-white tabular-nums"
      : compact
        ? "text-xl font-bold text-gray-900 tabular-nums dark:text-white"
        : "text-2xl font-bold text-gray-900 tabular-nums dark:text-white";
  const subtitleClass =
    tone === "dark" ? "text-xs text-white/42" : "text-xs text-gray-500 dark:text-white/42";
  const emptyClass =
    tone === "dark"
      ? compact
        ? "flex h-20 items-center justify-center rounded-xl border border-dashed border-white/10 text-sm text-white/40"
        : "flex h-28 items-center justify-center rounded-xl border border-dashed border-white/10 text-sm text-white/40"
      : compact
        ? "flex h-20 items-center justify-center rounded-xl border border-dashed border-black/10 text-sm text-gray-500 dark:border-white/10 dark:text-white/40"
        : "flex h-28 items-center justify-center rounded-xl border border-dashed border-black/10 text-sm text-gray-500 dark:border-white/10 dark:text-white/40";
  const axisClass =
    tone === "dark" ? "text-[11px] text-white/38" : "text-[11px] text-gray-500 dark:text-white/38";
  const accentStroke = currency === "USD" ? "#f59e0b" : "#10b981";
  const accentFill = currency === "USD" ? "rgba(245, 158, 11, 0.18)" : "rgba(16, 185, 129, 0.18)";
  const dotFill = currency === "USD" ? "#fbbf24" : "#34d399";

  return (
    <section className={shellClass}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={titleClass}>{title}</p>
          <p className={`${valueClass} mt-1`}>{formatCurrency(latestValue, currency)}</p>
        </div>

        {delta != null && (
          <div className="shrink-0 text-right">
            <p
              className={`text-sm font-semibold tabular-nums ${
                delta >= 0
                  ? tone === "dark"
                    ? "text-emerald-300"
                    : "text-emerald-700 dark:text-emerald-300"
                  : tone === "dark"
                    ? "text-rose-300"
                    : "text-rose-700 dark:text-rose-300"
              }`}
            >
              {formatDelta(delta, currency)}
            </p>
            <p className={subtitleClass}>since start</p>
          </div>
        )}
      </div>

      {subtitle && <p className={`${subtitleClass} mt-1`}>{subtitle}</p>}

      {loading ? (
        <div className={emptyClass}>Grafiek laden...</div>
      ) : !chart ? (
        <div className={emptyClass}>{emptyText}</div>
      ) : (
        <div className={compact ? "mt-3" : "mt-4"}>
          <svg viewBox={`0 0 ${width} ${height}`} className={`${compact ? "h-20" : "h-28"} w-full overflow-visible`}>
            <path d={chart.areaPath} fill={accentFill} />
            <path
              d={chart.linePath}
              fill="none"
              stroke={accentStroke}
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {chart.coordinates.length === 1 ? (
              <circle
                cx={chart.coordinates[0].x}
                cy={chart.coordinates[0].y}
                r="4.5"
                fill={dotFill}
              />
            ) : (
              <>
                <circle
                  cx={chart.coordinates[0].x}
                  cy={chart.coordinates[0].y}
                  r="3.5"
                  fill={dotFill}
                />
                <circle
                  cx={chart.coordinates[chart.coordinates.length - 1].x}
                  cy={chart.coordinates[chart.coordinates.length - 1].y}
                  r="4"
                  fill={dotFill}
                />
              </>
            )}
          </svg>

          <div className={`mt-2 flex items-center justify-between ${axisClass}`}>
            <span>{chart.coordinates[0]?.label ?? points[0]?.label ?? ""}</span>
            <span>{chart.coordinates[chart.coordinates.length - 1]?.label ?? ""}</span>
          </div>
        </div>
      )}
    </section>
  );
}
