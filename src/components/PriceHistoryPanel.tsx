"use client";

import { useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

export interface PriceHistoryValuePoint {
  date: string;
  label: string;
  value: number | null;
}

type CurrencyCode = "EUR" | "USD";
type Tone = "default" | "dark";
type RangeKey = "1D" | "1W" | "1M" | "3M" | "6M" | "1Y" | "ALL";
type Layout = "default" | "hero";

interface Props {
  title: string;
  currency: CurrencyCode;
  points: PriceHistoryValuePoint[];
  currentValue?: number | null;
  subtitle?: string;
  headerAccessory?: ReactNode;
  tone?: Tone;
  loading?: boolean;
  emptyText?: string;
  compact?: boolean;
  layout?: Layout;
}

interface ParsedHistoryPoint extends PriceHistoryValuePoint {
  timestamp: number | null;
}

interface ChartCoordinate extends ParsedHistoryPoint {
  value: number;
  x: number;
  y: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const CHART_FALLBACK_WIDTH = 320;
const CHART_PADDING_X = 10;
const CHART_PADDING_Y = 10;
const RANGE_PRESETS: Array<{
  key: RangeKey;
  label: string;
  days: number | null;
  deltaText: string;
}> = [
  { key: "1D", label: "1D", days: 1, deltaText: "last day" },
  { key: "1W", label: "1W", days: 7, deltaText: "last week" },
  { key: "1M", label: "1M", days: 30, deltaText: "last month" },
  { key: "3M", label: "3M", days: 90, deltaText: "last 3 months" },
  { key: "6M", label: "6M", days: 180, deltaText: "last 6 months" },
  { key: "1Y", label: "1Y", days: 365, deltaText: "last year" },
  { key: "ALL", label: "All", days: null, deltaText: "since start" },
];

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

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

function parsePointTimestamp(point: PriceHistoryValuePoint): number | null {
  const raw = point.date.trim();
  if (!raw) return null;

  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? new Date(`${raw}T12:00:00.000Z`).getTime()
    : new Date(raw).getTime();

  return Number.isNaN(parsed) ? null : parsed;
}

function formatAxisRangeSummary(points: Array<{ label: string }>): string | null {
  if (points.length === 0) return null;
  if (points.length === 1) return points[0].label;

  return `${points[0].label} - ${points[points.length - 1].label}`;
}

function formatPointDate(point: ParsedHistoryPoint): string {
  if (point.timestamp == null) {
    return point.label || point.date || "Unknown date";
  }

  return new Intl.DateTimeFormat("nl-NL", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(point.timestamp);
}

function formatInlinePointDate(point: ParsedHistoryPoint): string {
  if (point.timestamp == null) {
    return point.label || point.date || "";
  }

  return new Intl.DateTimeFormat("nl-NL", {
    day: "numeric",
    month: "short",
  }).format(point.timestamp);
}

function filterPointsByRange(points: ParsedHistoryPoint[], selectedRange: RangeKey): ParsedHistoryPoint[] {
  const preset = RANGE_PRESETS.find((range) => range.key === selectedRange);
  if (!preset || preset.days == null) {
    return points;
  }

  const timestamps = points
    .map((point) => point.timestamp)
    .filter((timestamp): timestamp is number => timestamp != null);

  if (timestamps.length === 0) {
    return points;
  }

  const latestTimestamp = Math.max(...timestamps);
  const cutoff = latestTimestamp - preset.days * DAY_MS;
  const filtered = points.filter(
    (point) => point.timestamp != null && point.timestamp >= cutoff
  );

  return filtered.length > 0 ? filtered : points.slice(-1);
}

function buildAxisTicks(points: ChartCoordinate[], compact: boolean) {
  if (points.length === 0) return [];

  const targetCount = compact ? 3 : 4;
  const lastIndex = points.length - 1;
  const indexCandidates =
    points.length <= targetCount
      ? points.map((_, index) => index)
      : compact
        ? [0, Math.floor(lastIndex / 2), lastIndex]
        : [
            0,
            Math.floor(lastIndex / 3),
            Math.floor((lastIndex * 2) / 3),
            lastIndex,
          ];

  const uniqueIndexes = [...new Set(indexCandidates)].sort((a, b) => a - b);

  return uniqueIndexes.map((index) => ({
    index,
    x: points[index].x,
    label: points[index].label,
  }));
}

function buildChart(
  points: ParsedHistoryPoint[],
  width: number,
  height: number,
  axisHeight: number
) {
  const validPoints = points.filter(
    (point): point is ParsedHistoryPoint & { value: number } => point.value != null
  );

  if (validPoints.length === 0) {
    return null;
  }

  const min = Math.min(...validPoints.map((point) => point.value));
  const max = Math.max(...validPoints.map((point) => point.value));
  const isFlat = max === min;
  const span = max - min || Math.max(max, 1) * 0.08 || 1;
  const plotTop = CHART_PADDING_Y;
  const plotBottom = height - axisHeight - CHART_PADDING_Y;
  const usableWidth = width - CHART_PADDING_X * 2;
  const usableHeight = Math.max(plotBottom - plotTop, 1);

  const coordinates: ChartCoordinate[] = validPoints.map((point, index) => {
    const x =
      validPoints.length === 1
        ? width / 2
        : CHART_PADDING_X + (usableWidth * index) / (validPoints.length - 1);
    const ratio = isFlat ? 0.5 : (point.value - min) / span;
    const y = plotBottom - ratio * usableHeight;

    return { ...point, x, y };
  });

  const linePath = coordinates
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");
  const areaPath = `${linePath} L ${coordinates[coordinates.length - 1].x} ${plotBottom} L ${coordinates[0].x} ${plotBottom} Z`;

  return {
    coordinates,
    linePath,
    areaPath,
    plotTop,
    plotBottom,
    guideLines: [plotTop, plotTop + usableHeight / 2, plotBottom],
  };
}

function getPointerChartX(event: ReactPointerEvent<SVGSVGElement>, width: number): number {
  const bounds = event.currentTarget.getBoundingClientRect();
  const ratio = bounds.width > 0 ? (event.clientX - bounds.left) / bounds.width : 0;
  return clamp(ratio * width, 0, width);
}

function getNearestCoordinateIndex(chartX: number, coordinates: ChartCoordinate[]): number {
  if (coordinates.length <= 1) return 0;

  let nearestIndex = 0;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (let index = 0; index < coordinates.length; index += 1) {
    const distance = Math.abs(coordinates[index].x - chartX);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = index;
    }
  }

  return nearestIndex;
}

export default function PriceHistoryPanel({
  title,
  currency,
  points,
  currentValue,
  subtitle,
  headerAccessory,
  tone = "default",
  loading = false,
  emptyText = "Nog geen prijshistorie",
  compact = false,
  layout = "default",
}: Props) {
  const isHeroLayout = !compact && layout === "hero";
  const axisHeight = compact ? 18 : 22;
  const height = compact ? 126 : isHeroLayout ? 232 : 184;
  const chartId = useId().replace(/:/g, "");
  const chartFrameRef = useRef<HTMLDivElement | null>(null);
  const [chartWidth, setChartWidth] = useState<number | null>(null);
  const [selectedRange, setSelectedRange] = useState<RangeKey>("3M");
  const [activeHover, setActiveHover] = useState<{
    index: number;
    pointerX: number;
  } | null>(null);

  const parsedPoints = points.map((point) => ({
    ...point,
    timestamp: parsePointTimestamp(point),
  }));
  const filteredPoints = filterPointsByRange(parsedPoints, selectedRange);
  const hasDrawablePoints = filteredPoints.some((point) => point.value != null);

  useLayoutEffect(() => {
    if (loading || !hasDrawablePoints) {
      return;
    }

    const element = chartFrameRef.current;
    if (!element) return;
    let frameId = 0;

    const updateWidth = (nextWidth: number) => {
      const normalizedWidth = Math.max(1, Math.round(nextWidth));
      setChartWidth((currentWidth) =>
        currentWidth === normalizedWidth ? currentWidth : normalizedWidth
      );
    };

    updateWidth(element.getBoundingClientRect().width);
    frameId = window.requestAnimationFrame(() => {
      updateWidth(element.getBoundingClientRect().width);
    });

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      updateWidth(entry.contentRect.width);
    });

    observer.observe(element);

    return () => {
      window.cancelAnimationFrame(frameId);
      observer.disconnect();
    };
  }, [hasDrawablePoints, loading]);

  const measuredChartWidth = chartWidth ?? CHART_FALLBACK_WIDTH;
  const chart = chartWidth == null ? null : buildChart(filteredPoints, chartWidth, height, axisHeight);
  const visibleCoordinates = chart?.coordinates ?? [];
  const latestPoint = visibleCoordinates[visibleCoordinates.length - 1] ?? null;
  const activePoint =
    activeHover != null ? visibleCoordinates[activeHover.index] ?? null : null;
  const latestValue = currentValue ?? latestPoint?.value ?? null;
  const firstValue = visibleCoordinates[0]?.value ?? null;
  const displayedValue = activePoint?.value ?? latestValue;
  const delta =
    latestValue != null && firstValue != null && visibleCoordinates.length > 1
      ? latestValue - firstValue
      : null;
  const selectedPreset =
    RANGE_PRESETS.find((range) => range.key === selectedRange) ?? RANGE_PRESETS[3];
  const rangeSummary = formatAxisRangeSummary(visibleCoordinates);
  const hoverDateText = activePoint ? formatInlinePointDate(activePoint) : null;
  const primaryMetaText = rangeSummary;
  const secondaryMetaText = subtitle ?? null;
  const axisTicks = buildAxisTicks(visibleCoordinates, compact);
  const showRangeControls = parsedPoints.length > 1;
  const reserveDateSlot = visibleCoordinates.length > 0;

  const shellClass =
    tone === "dark"
      ? compact
        ? "rounded-2xl border border-white/10 bg-white/[0.06] px-3 py-3"
        : isHeroLayout
          ? "rounded-[28px] border border-white/10 bg-white/[0.06] px-5 py-5 sm:px-6 sm:py-6"
          : "rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-4"
      : compact
        ? "rounded-2xl border border-black/8 bg-black/[0.03] px-3 py-3 dark:border-white/8 dark:bg-white/[0.04]"
        : isHeroLayout
          ? "rounded-[28px] border border-black/8 bg-black/[0.03] px-5 py-5 dark:border-white/8 dark:bg-white/[0.04] sm:px-6 sm:py-6"
          : "rounded-2xl border border-black/8 bg-black/[0.03] px-4 py-4 dark:border-white/8 dark:bg-white/[0.04]";
  const titleClass =
    tone === "dark"
      ? "text-xs font-semibold uppercase tracking-[0.08em] text-white/50"
      : "text-xs font-semibold uppercase tracking-[0.08em] text-gray-500 dark:text-white/50";
  const valueClass =
    tone === "dark"
      ? compact
        ? "text-xl font-bold text-white tabular-nums"
        : isHeroLayout
          ? "text-4xl font-bold text-white tabular-nums sm:text-[2.85rem]"
          : "text-2xl font-bold text-white tabular-nums"
      : compact
        ? "text-xl font-bold text-gray-900 tabular-nums dark:text-white"
        : isHeroLayout
          ? "text-4xl font-bold text-gray-900 tabular-nums dark:text-white sm:text-[2.85rem]"
          : "text-2xl font-bold text-gray-900 tabular-nums dark:text-white";
  const metaClass =
    tone === "dark" ? "text-xs text-white/52" : "text-xs text-gray-500 dark:text-white/48";
  const subtitleClass =
    tone === "dark" ? "text-xs text-white/38" : "text-xs text-gray-500 dark:text-white/40";
  const emptyClass =
    tone === "dark"
      ? compact
        ? "flex h-28 items-center justify-center rounded-xl border border-dashed border-white/10 text-sm text-white/40"
        : isHeroLayout
          ? "flex h-[232px] items-center justify-center rounded-2xl border border-dashed border-white/10 text-sm text-white/40"
          : "flex h-[184px] items-center justify-center rounded-xl border border-dashed border-white/10 text-sm text-white/40"
      : compact
        ? "flex h-28 items-center justify-center rounded-xl border border-dashed border-black/10 text-sm text-gray-500 dark:border-white/10 dark:text-white/40"
        : isHeroLayout
          ? "flex h-[232px] items-center justify-center rounded-2xl border border-dashed border-black/10 text-sm text-gray-500 dark:border-white/10 dark:text-white/40"
          : "flex h-[184px] items-center justify-center rounded-xl border border-dashed border-black/10 text-sm text-gray-500 dark:border-white/10 dark:text-white/40";
  const axisLabelClass =
    tone === "dark" ? "fill-white/40" : "fill-gray-500 dark:fill-white/40";
  const gridLineClass =
    tone === "dark" ? "stroke-white/10" : "stroke-black/8 dark:stroke-white/10";
  const tooltipClass =
    tone === "dark"
      ? "border-white/12 bg-[#0c0c0f]/92 text-white shadow-2xl shadow-black/35"
      : "border-black/8 bg-white/95 text-gray-900 shadow-xl shadow-black/10 dark:border-white/10 dark:bg-[#0c0c0f]/90 dark:text-white";
  const accentStroke = currency === "USD" ? "#f59e0b" : "#10b981";
  const accentFillStart =
    currency === "USD" ? "rgba(245, 158, 11, 0.32)" : "rgba(16, 185, 129, 0.28)";
  const accentFillEnd =
    currency === "USD" ? "rgba(245, 158, 11, 0.02)" : "rgba(16, 185, 129, 0.02)";
  const dotFill = currency === "USD" ? "#fbbf24" : "#34d399";
  const tooltipRawLeft = activeHover?.pointerX ?? activePoint?.x ?? measuredChartWidth / 2;
  const tooltipLeft = clamp(tooltipRawLeft, 12, Math.max(measuredChartWidth - 12, 12));
  const tooltipLeftRatio = measuredChartWidth > 0 ? tooltipLeft / measuredChartWidth : 0.5;
  const tooltipTop = activePoint
    ? clamp(activePoint.y - (compact ? 56 : isHeroLayout ? 76 : 64), 8, height - 64)
    : 8;
  const tooltipAlignmentClass =
    tooltipLeftRatio <= 0.2
      ? "translate-x-0"
      : tooltipLeftRatio >= 0.8
        ? "-translate-x-full"
        : "-translate-x-1/2";
  const rangeButtonClass = compact
    ? "px-2.5 py-1 text-[11px]"
    : isHeroLayout
      ? "px-3 py-1.5 text-xs"
      : "px-2.5 py-1 text-[11px]";

  function updateHoverState(event: ReactPointerEvent<SVGSVGElement>) {
    const pointerX = getPointerChartX(event, measuredChartWidth);
    setActiveHover({
      index: getNearestCoordinateIndex(pointerX, visibleCoordinates),
      pointerX,
    });
  }

  return (
    <section className={shellClass}>
      <div
        className={
          isHeroLayout
            ? "flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"
            : "flex items-start justify-between gap-3"
        }
      >
        <div className="min-w-0">
          <p className={titleClass}>{title}</p>
          <p className={`${valueClass} mt-1`}>{formatCurrency(displayedValue, currency)}</p>
          {primaryMetaText && <p className={`${metaClass} mt-1`}>{primaryMetaText}</p>}
          {secondaryMetaText && secondaryMetaText !== primaryMetaText && (
            <p className={`${subtitleClass} mt-1`}>{secondaryMetaText}</p>
          )}
        </div>

        {(headerAccessory || delta != null || reserveDateSlot) && (
          <div
            className={`shrink-0 ${
              isHeroLayout ? "sm:pt-1 text-left sm:text-right" : "text-right"
            }`}
          >
            <div className="flex min-w-[4.5rem] flex-col items-end gap-2">
              {headerAccessory}
              {reserveDateSlot && (
                <p
                  className={`${metaClass} whitespace-nowrap text-right transition-opacity ${
                    hoverDateText ? "opacity-100" : "opacity-0"
                  }`}
                >
                  {hoverDateText ?? "\u00A0"}
                </p>
              )}
              {delta != null && (
                <div>
                  <p
                    className={`${isHeroLayout ? "text-lg" : "text-sm"} font-semibold tabular-nums ${
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
                  <p className={subtitleClass}>{selectedPreset.deltaText}</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {showRangeControls && (
        <div className={compact ? "mt-3" : "mt-4"}>
          <div className={`flex flex-wrap items-center ${isHeroLayout ? "gap-1.5" : "gap-1"}`}>
            {RANGE_PRESETS.map((range) => (
              <button
                key={range.key}
                type="button"
                onClick={() => {
                  setActiveHover(null);
                  setSelectedRange(range.key);
                }}
                aria-pressed={selectedRange === range.key}
                className={`rounded-full border font-semibold transition-colors ${rangeButtonClass} ${
                  selectedRange === range.key
                    ? tone === "dark"
                      ? "border-white/24 bg-white/14 text-white"
                      : "border-gray-900/18 bg-gray-900 text-white dark:border-white/20 dark:bg-white dark:text-gray-900"
                    : tone === "dark"
                      ? "border-white/10 text-white/58 hover:border-white/18 hover:text-white/82"
                      : "border-black/10 text-gray-500 hover:border-black/18 hover:text-gray-900 dark:border-white/10 dark:text-white/55 dark:hover:border-white/18 dark:hover:text-white"
                }`}
              >
                {range.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className={compact ? "mt-3" : "mt-4"}>
          <div className={emptyClass}>Grafiek laden...</div>
        </div>
      ) : !hasDrawablePoints ? (
        <div className={compact ? "mt-3" : "mt-4"}>
          <div className={emptyClass}>{emptyText}</div>
        </div>
      ) : (
        <div className={compact ? "mt-3" : "mt-5"}>
          <div ref={chartFrameRef} className="relative w-full min-w-0">
            {!chart ? (
              <div className={emptyClass}>Grafiek laden...</div>
            ) : (
              <>
            {activePoint && (
              <div
                className={`pointer-events-none absolute z-10 w-max max-w-[calc(100%-8px)] rounded-xl border px-2.5 py-2 text-left ${tooltipClass} ${tooltipAlignmentClass}`}
                style={{ left: tooltipLeft, top: tooltipTop }}
              >
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] opacity-60">
                  {formatPointDate(activePoint)}
                </p>
                <p className="mt-1 text-sm font-semibold tabular-nums">
                  {formatCurrency(activePoint.value, currency)}
                </p>
              </div>
            )}

            <svg
              viewBox={`0 0 ${measuredChartWidth} ${height}`}
              className="block w-full cursor-crosshair overflow-visible touch-none select-none"
              style={{ height }}
              onPointerMove={updateHoverState}
              onPointerDown={updateHoverState}
              onPointerLeave={() => setActiveHover(null)}
            >
              <defs>
                <linearGradient id={`${chartId}-fill`} x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor={accentFillStart} />
                  <stop offset="100%" stopColor={accentFillEnd} />
                </linearGradient>
              </defs>

              {chart.guideLines.map((y) => (
                <line
                  key={y}
                  x1={CHART_PADDING_X}
                  x2={measuredChartWidth - CHART_PADDING_X}
                  y1={y}
                  y2={y}
                  strokeDasharray="4 5"
                  className={gridLineClass}
                />
              ))}

              <path d={chart.areaPath} fill={`url(#${chartId}-fill)`} />
              <path
                d={chart.linePath}
                fill="none"
                stroke={accentStroke}
                strokeWidth={compact ? "2.75" : isHeroLayout ? "3.25" : "3"}
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {activePoint && (
                <line
                  x1={activePoint.x}
                  x2={activePoint.x}
                  y1={chart.plotTop}
                  y2={chart.plotBottom}
                  stroke={accentStroke}
                  strokeOpacity="0.45"
                  strokeDasharray="4 4"
                />
              )}

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
                    r="3.25"
                    fill={dotFill}
                    fillOpacity="0.9"
                  />
                  <circle
                    cx={chart.coordinates[chart.coordinates.length - 1].x}
                    cy={chart.coordinates[chart.coordinates.length - 1].y}
                    r={isHeroLayout ? "4.5" : "4"}
                    fill={dotFill}
                  />
                </>
              )}

              {activePoint && (
                <circle
                  cx={activePoint.x}
                  cy={activePoint.y}
                  r={isHeroLayout ? "5.5" : "5"}
                  fill={dotFill}
                  stroke={tone === "dark" ? "#0c0c0f" : "#ffffff"}
                  strokeWidth="2"
                />
              )}

              {axisTicks.map((tick, index) => {
                const anchor =
                  index === 0
                    ? "start"
                    : index === axisTicks.length - 1
                      ? "end"
                      : "middle";

                return (
                  <g key={`${tick.index}-${tick.label}`}>
                    <line
                      x1={tick.x}
                      x2={tick.x}
                      y1={chart.plotBottom}
                      y2={chart.plotBottom + 5}
                      className={gridLineClass}
                    />
                    <text
                      x={tick.x}
                      y={height - 4}
                      className={axisLabelClass}
                      fontSize={isHeroLayout ? "11" : "10.5"}
                      textAnchor={anchor}
                    >
                      {tick.label}
                    </text>
                  </g>
                );
              })}
            </svg>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
