"use client";

import {
  useCallback,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { usePathname } from "next/navigation";
import { formatCurrency, type CurrencyCode } from "@/lib/format";

export interface PriceHistoryValuePoint {
  date: string;
  label: string;
  value: number | null;
}

export interface PriceHistoryProjection {
  label?: string;
  points: PriceHistoryValuePoint[];
  tone?: "strong-rise" | "rise" | "flat" | "decline";
  summary?: string;
}

type Tone = "default" | "dark";
type RangeKey = "1D" | "1W" | "1M" | "3M" | "6M" | "1Y" | "ALL";
type Layout = "default" | "hero" | "dashboard";

interface Props {
  title: string;
  currency: CurrencyCode;
  points: PriceHistoryValuePoint[];
  currentValue?: number | null;
  showCurrentValue?: boolean;
  deltaValue?: number | null;
  subtitle?: string;
  headerLeadingAccessory?: ReactNode;
  headerAccessory?: ReactNode;
  tone?: Tone;
  loading?: boolean;
  emptyText?: string;
  compact?: boolean;
  layout?: Layout;
  rangeStorageKey?: string | null;
  rangeScopePoints?: PriceHistoryValuePoint[];
  fixedRange?: RangeKey;
  hideRangeControls?: boolean;
  projection?: PriceHistoryProjection | null;
}

interface ParsedHistoryPoint extends PriceHistoryValuePoint {
  timestamp: number | null;
}

interface ChartCoordinate extends ParsedHistoryPoint {
  value: number;
  x: number;
  y: number;
  projected?: boolean;
}

interface RangeStorageKeys {
  primary: string | null;
  legacy: string | null;
}

interface TimeDomain {
  start: number;
  end: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const CHART_FALLBACK_WIDTH = 320;
const CHART_PADDING_X = 10;
const CHART_PADDING_Y = 10;
const DEFAULT_RANGE_KEY: RangeKey = "3M";
const RANGE_STORAGE_PREFIX = "dustycards:price-history-range";
const RANGE_STORAGE_EVENT = "dustycards:price-history-range-change";
const MOBILE_VIEWPORT_QUERY = "(max-width: 640px)";
const rangeMemoryFallback = new Map<string, RangeKey>();
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

function isRangeKey(value: unknown): value is RangeKey {
  return RANGE_PRESETS.some((range) => range.key === value);
}

function normalizeStorageKeyPart(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9/_?=&.-]+/g, "-").replace(/-+/g, "-");
}

function buildRangeStorageKeys(input: {
  explicitKey: string | null | undefined;
  pathname: string | null;
  title: string;
  currency: CurrencyCode;
}): RangeStorageKeys {
  if (input.explicitKey === null) return { primary: null, legacy: null };

  const explicitKey = input.explicitKey?.trim();
  if (explicitKey) {
    return {
      primary: `${RANGE_STORAGE_PREFIX}:${normalizeStorageKeyPart(explicitKey)}`,
      legacy: null,
    };
  }

  const pageKey = input.pathname || "page";
  const legacyKey = [pageKey, input.title, input.currency].join(":");

  return {
    primary: `${RANGE_STORAGE_PREFIX}:${normalizeStorageKeyPart(pageKey)}`,
    legacy: `${RANGE_STORAGE_PREFIX}:${normalizeStorageKeyPart(legacyKey)}`,
  };
}

function readStoredRangeKey(storageKey: string | null): RangeKey | null {
  if (!storageKey || typeof window === "undefined") return null;

  try {
    const stored = window.localStorage.getItem(storageKey);
    return isRangeKey(stored) ? stored : rangeMemoryFallback.get(storageKey) ?? null;
  } catch {
    return rangeMemoryFallback.get(storageKey) ?? null;
  }
}

function readStoredRange(storageKeys: RangeStorageKeys): RangeKey | null {
  return readStoredRangeKey(storageKeys.primary) ?? readStoredRangeKey(storageKeys.legacy);
}

function matchesRangeStorageKey(storageKeys: RangeStorageKeys, storageKey: string | null | undefined) {
  return Boolean(storageKey && (storageKey === storageKeys.primary || storageKey === storageKeys.legacy));
}

function persistStoredRangeKey(storageKey: string | null, range: RangeKey) {
  if (!storageKey || typeof window === "undefined") return;

  rangeMemoryFallback.set(storageKey, range);

  try {
    window.localStorage.setItem(storageKey, range);
  } catch {
    // Browser storage can be blocked; the in-memory selection still works.
  }
}

function writeStoredRangeKey(storageKey: string | null, range: RangeKey) {
  if (!storageKey || typeof window === "undefined") return;

  persistStoredRangeKey(storageKey, range);

  try {
    window.dispatchEvent(
      new CustomEvent(RANGE_STORAGE_EVENT, {
        detail: { storageKey, range },
      })
    );
  } catch {
    // Older browsers can fail on CustomEvent construction, but storage already updated.
  }
}

function writeStoredRange(storageKeys: RangeStorageKeys, range: RangeKey) {
  writeStoredRangeKey(storageKeys.primary, range);
  writeStoredRangeKey(storageKeys.legacy, range);
}

function subscribeMobileViewport(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => {};

  const media = window.matchMedia(MOBILE_VIEWPORT_QUERY);
  media.addEventListener("change", onStoreChange);
  return () => media.removeEventListener("change", onStoreChange);
}

function getMobileViewportSnapshot() {
  return typeof window !== "undefined" && window.matchMedia(MOBILE_VIEWPORT_QUERY).matches;
}

function getMobileViewportServerSnapshot() {
  return false;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function formatCompactCurrencyLabel(value: number, currency: CurrencyCode): string {
  const symbol = currency === "USD" ? "$" : "€";
  const absolute = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (absolute >= 1_000_000) return `${sign}${symbol}${(absolute / 1_000_000).toFixed(1)}M`;
  if (absolute >= 10_000) return `${sign}${symbol}${Math.round(absolute / 1_000)}K`;
  if (absolute >= 1_000) return `${sign}${symbol}${(absolute / 1_000).toFixed(1)}K`;
  return `${sign}${symbol}${Math.round(absolute)}`;
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

  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(point.timestamp);
}

function formatInlinePointDate(point: ParsedHistoryPoint): string {
  if (point.timestamp == null) {
    return point.label || point.date || "";
  }

  return formatTimestampAxisLabel(point.timestamp);
}

function formatTimestampAxisLabel(timestamp: number): string {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
  }).format(timestamp);
}

function getPointTimestamps(points: ParsedHistoryPoint[]): number[] {
  return points
    .map((point) => point.timestamp)
    .filter((timestamp): timestamp is number => timestamp != null);
}

function buildScopedTimeDomain(points: ParsedHistoryPoint[], selectedRange: RangeKey): TimeDomain | null {
  const timestamps = getPointTimestamps(points);
  if (timestamps.length === 0) return null;

  const end = Math.max(...timestamps);
  const preset = RANGE_PRESETS.find((range) => range.key === selectedRange);
  const start = preset?.days == null ? Math.min(...timestamps) : end - preset.days * DAY_MS;

  return start < end ? { start, end } : null;
}

function filterPointsByRange(
  points: ParsedHistoryPoint[],
  selectedRange: RangeKey,
  scopedDomain: TimeDomain | null = null
): ParsedHistoryPoint[] {
  if (scopedDomain) {
    return points.filter(
      (point) =>
        point.timestamp != null &&
        point.timestamp >= scopedDomain.start &&
        point.timestamp <= scopedDomain.end
    );
  }

  const preset = RANGE_PRESETS.find((range) => range.key === selectedRange);
  if (!preset || preset.days == null) {
    return points;
  }

  const timestamps = getPointTimestamps(points);

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

function buildTimeAxisTicks(domain: TimeDomain, width: number, compact: boolean) {
  const targetCount = compact ? 3 : 4;
  const usableWidth = width - CHART_PADDING_X * 2;
  const span = domain.end - domain.start;
  if (span <= 0) return [];

  return Array.from({ length: targetCount }, (_, index) => {
    const ratio = index / (targetCount - 1);
    const timestamp = domain.start + span * ratio;

    return {
      index,
      x: CHART_PADDING_X + usableWidth * ratio,
      label: formatTimestampAxisLabel(timestamp),
    };
  });
}

function buildProjectedAxisTicks(
  historyCoordinates: ChartCoordinate[],
  projectionCoordinates: ChartCoordinate[],
  compact: boolean
) {
  const historyIndexes =
    historyCoordinates.length <= (compact ? 2 : 3)
      ? historyCoordinates.map((_, index) => index)
      : compact
        ? [0, historyCoordinates.length - 1]
        : [0, Math.floor((historyCoordinates.length - 1) / 2), historyCoordinates.length - 1];
  const futureCoordinates = projectionCoordinates.slice(1);
  const futureIndexes =
    compact && futureCoordinates.length > 1
      ? [futureCoordinates.length - 1]
      : futureCoordinates.map((_, index) => index);

  return [
    ...[...new Set(historyIndexes)].map((index) => ({
      index,
      x: historyCoordinates[index].x,
      label: historyCoordinates[index].label,
    })),
    ...futureIndexes.map((index) => ({
      index: historyCoordinates.length + index + 1,
      x: futureCoordinates[index].x,
      label: futureCoordinates[index].label,
    })),
  ];
}

function buildChart(
  points: ParsedHistoryPoint[],
  width: number,
  height: number,
  axisHeight: number,
  timeDomain: TimeDomain | null = null,
  projectionPoints: ParsedHistoryPoint[] = []
) {
  const validPoints = points.filter(
    (point): point is ParsedHistoryPoint & { value: number } => point.value != null
  );
  const validProjectionPoints = projectionPoints.filter(
    (point): point is ParsedHistoryPoint & { value: number } => point.value != null
  );

  if (validPoints.length === 0 && validProjectionPoints.length === 0) {
    return null;
  }

  const allValues = [
    ...validPoints.map((point) => point.value),
    ...validProjectionPoints.map((point) => point.value),
  ];
  const min = Math.min(...allValues);
  const max = Math.max(...allValues);
  const isFlat = max === min;
  const span = max - min || Math.max(max, 1) * 0.08 || 1;
  const plotTop = CHART_PADDING_Y;
  const plotBottom = height - axisHeight - CHART_PADDING_Y;
  const usableWidth = width - CHART_PADDING_X * 2;
  const usableHeight = Math.max(plotBottom - plotTop, 1);
  const hasProjection = validProjectionPoints.length > 1;
  const forecastStartX =
    hasProjection && validPoints.length > 0
      ? CHART_PADDING_X + usableWidth * 0.7
      : validPoints.length > 0
        ? width - CHART_PADDING_X
        : CHART_PADDING_X;

  const activeTimeDomain = timeDomain && timeDomain.end > timeDomain.start ? timeDomain : null;
  const coordinates: ChartCoordinate[] = validPoints.map((point, index) => {
    const x =
      activeTimeDomain && point.timestamp != null
        ? CHART_PADDING_X +
          (forecastStartX - CHART_PADDING_X) *
            clamp(
              (point.timestamp - activeTimeDomain.start) /
                (activeTimeDomain.end - activeTimeDomain.start),
              0,
              1
            )
        : validPoints.length === 1
          ? hasProjection
            ? forecastStartX
            : width / 2
          : CHART_PADDING_X +
            ((forecastStartX - CHART_PADDING_X) * index) / (validPoints.length - 1);
    const ratio = isFlat ? 0.5 : (point.value - min) / span;
    const y = plotBottom - ratio * usableHeight;

    return { ...point, x, y };
  });
  const projectionTimestamps = validProjectionPoints
    .map((point) => point.timestamp)
    .filter((timestamp): timestamp is number => timestamp != null);
  const projectionStart = projectionTimestamps.length > 0 ? Math.min(...projectionTimestamps) : null;
  const projectionEnd = projectionTimestamps.length > 0 ? Math.max(...projectionTimestamps) : null;
  const projectionCoordinates: ChartCoordinate[] = validProjectionPoints.map((point, index) => {
    const x =
      projectionStart != null &&
      projectionEnd != null &&
      projectionEnd > projectionStart &&
      point.timestamp != null
        ? forecastStartX +
          (width - CHART_PADDING_X - forecastStartX) *
            clamp((point.timestamp - projectionStart) / (projectionEnd - projectionStart), 0, 1)
        : validProjectionPoints.length === 1
          ? forecastStartX
          : forecastStartX +
            ((width - CHART_PADDING_X - forecastStartX) * index) /
              Math.max(1, validProjectionPoints.length - 1);
    const ratio = isFlat ? 0.5 : (point.value - min) / span;
    const y = plotBottom - ratio * usableHeight;

    return { ...point, x, y, projected: true };
  });
  const pathCoordinates =
    activeTimeDomain && coordinates.length > 0
      ? [
          ...(coordinates[0].x > CHART_PADDING_X
            ? [{ ...coordinates[0], x: CHART_PADDING_X }]
            : []),
          ...coordinates,
          ...(!hasProjection && coordinates[coordinates.length - 1].x < width - CHART_PADDING_X
            ? [{ ...coordinates[coordinates.length - 1], x: width - CHART_PADDING_X }]
            : []),
        ]
      : coordinates;

  const linePath = pathCoordinates
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");
  const areaPath =
    pathCoordinates.length > 0
      ? `${linePath} L ${pathCoordinates[pathCoordinates.length - 1].x} ${plotBottom} L ${pathCoordinates[0].x} ${plotBottom} Z`
      : "";
  const projectionLinePath = projectionCoordinates
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");

  return {
    coordinates,
    projectionCoordinates,
    pathCoordinates,
    linePath,
    projectionLinePath,
    areaPath,
    forecastStartX,
    plotTop,
    plotBottom,
    guideLines: [plotTop, plotTop + usableHeight / 2, plotBottom],
    minValue: min,
    maxValue: max,
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
  showCurrentValue = true,
  deltaValue,
  subtitle,
  headerLeadingAccessory,
  headerAccessory,
  tone = "default",
  loading = false,
  emptyText = "No price history yet",
  compact = false,
  layout = "default",
  rangeStorageKey,
  rangeScopePoints,
  fixedRange,
  hideRangeControls = false,
  projection = null,
}: Props) {
  const pathname = usePathname();
  const isHeroLayout = !compact && layout === "hero";
  const isDashboardLayout = layout === "dashboard";
  const [measuredHeight, setMeasuredHeight] = useState<number | null>(null);
  const isMobileViewport = useSyncExternalStore(
    subscribeMobileViewport,
    getMobileViewportSnapshot,
    getMobileViewportServerSnapshot
  );
  const isMobileHeroLayout = isMobileViewport && isHeroLayout;
  const axisHeight = isMobileViewport ? (compact ? 16 : 18) : compact ? 18 : 22;
  const baseHeight = isMobileViewport
    ? compact
      ? 140
      : isHeroLayout
        ? 118
        : isDashboardLayout
          ? 150
          : 142
    : compact
      ? 220
      : isHeroLayout
        ? 188
        : isDashboardLayout
          ? 160
          : 168;
  const height = isDashboardLayout && measuredHeight && measuredHeight > 100
    ? measuredHeight
    : baseHeight;
  const chartId = useId().replace(/:/g, "");
  const chartFrameRef = useRef<HTMLDivElement | null>(null);
  const [chartWidth, setChartWidth] = useState<number | null>(null);
  const [activeHover, setActiveHover] = useState<{
    index: number;
    pointerX: number;
  } | null>(null);
  const effectiveRangeStorageKeys = useMemo(
    () =>
      buildRangeStorageKeys({
        explicitKey: rangeStorageKey,
        pathname,
        title,
        currency,
      }),
    [currency, pathname, rangeStorageKey, title]
  );

  const subscribeSelectedRange = useCallback(
    (onStoreChange: () => void) => {
      if (!effectiveRangeStorageKeys.primary || typeof window === "undefined") return () => {};

      const handleRangeChange = (event: Event) => {
        const detail = (event as CustomEvent<{ storageKey?: string; range?: unknown }>).detail;
        if (!matchesRangeStorageKey(effectiveRangeStorageKeys, detail?.storageKey) || !isRangeKey(detail.range)) return;

        setActiveHover(null);
        onStoreChange();
      };
      const handleStorage = (event: StorageEvent) => {
        if (!event.key || !matchesRangeStorageKey(effectiveRangeStorageKeys, event.key) || !isRangeKey(event.newValue)) return;

        rangeMemoryFallback.set(event.key, event.newValue);
        setActiveHover(null);
        onStoreChange();
      };

      window.addEventListener(RANGE_STORAGE_EVENT, handleRangeChange);
      window.addEventListener("storage", handleStorage);
      return () => {
        window.removeEventListener(RANGE_STORAGE_EVENT, handleRangeChange);
        window.removeEventListener("storage", handleStorage);
      };
    },
    [effectiveRangeStorageKeys]
  );
  const getSelectedRangeSnapshot = useCallback(
    () => readStoredRange(effectiveRangeStorageKeys) ?? DEFAULT_RANGE_KEY,
    [effectiveRangeStorageKeys]
  );
  const getSelectedRangeServerSnapshot = useCallback((): RangeKey | null => null, []);
  const selectedRangeSnapshot = useSyncExternalStore(
    subscribeSelectedRange,
    getSelectedRangeSnapshot,
    getSelectedRangeServerSnapshot
  );
  const rangeResolved = fixedRange != null || selectedRangeSnapshot != null;
  const selectedRange = fixedRange ?? selectedRangeSnapshot ?? DEFAULT_RANGE_KEY;

  useLayoutEffect(() => {
    if (fixedRange || !rangeResolved || !effectiveRangeStorageKeys.primary) return;

    const storedRange = readStoredRange(effectiveRangeStorageKeys);
    if (!storedRange || readStoredRangeKey(effectiveRangeStorageKeys.primary) === storedRange) {
      return;
    }

    persistStoredRangeKey(effectiveRangeStorageKeys.primary, storedRange);
  }, [effectiveRangeStorageKeys, fixedRange, rangeResolved]);

  const parsedPoints = points.map((point) => ({
    ...point,
    timestamp: parsePointTimestamp(point),
  }));
  const parsedRangeScopePoints = rangeScopePoints?.map((point) => ({
    ...point,
    timestamp: parsePointTimestamp(point),
  })) ?? [];
  const parsedProjectionPoints = projection?.points.map((point) => ({
    ...point,
    timestamp: parsePointTimestamp(point),
  })) ?? [];
  const scopedTimeDomain =
    parsedRangeScopePoints.length > 0
      ? buildScopedTimeDomain(parsedRangeScopePoints, selectedRange)
      : null;
  const filteredPoints = filterPointsByRange(parsedPoints, selectedRange, scopedTimeDomain);
  const hasDrawablePoints =
    filteredPoints.some((point) => point.value != null) ||
    parsedProjectionPoints.some((point) => point.value != null);

  useLayoutEffect(() => {
    if (!rangeResolved || loading || !hasDrawablePoints) {
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

    const updateHeight = (nextHeight: number) => {
      const normalizedHeight = Math.max(1, Math.round(nextHeight));
      setMeasuredHeight((current) =>
        current === normalizedHeight ? current : normalizedHeight
      );
    };

    const rect = element.getBoundingClientRect();
    updateWidth(rect.width);
    updateHeight(rect.height);
    frameId = window.requestAnimationFrame(() => {
      const r = element.getBoundingClientRect();
      updateWidth(r.width);
      updateHeight(r.height);
    });

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      updateWidth(entry.contentRect.width);
      updateHeight(entry.contentRect.height);
    });

    observer.observe(element);

    return () => {
      window.cancelAnimationFrame(frameId);
      observer.disconnect();
    };
  }, [hasDrawablePoints, loading, rangeResolved]);

  const measuredChartWidth = chartWidth ?? CHART_FALLBACK_WIDTH;
  const chart = buildChart(
    filteredPoints,
    measuredChartWidth,
    height,
    axisHeight,
    scopedTimeDomain,
    parsedProjectionPoints
  );
  const visibleCoordinates = chart?.coordinates ?? [];
  const hoverCoordinates = [
    ...visibleCoordinates,
    ...(chart?.projectionCoordinates.slice(1) ?? []),
  ];
  const latestPoint =
    visibleCoordinates[visibleCoordinates.length - 1] ?? chart?.projectionCoordinates[0] ?? null;
  const activePoint =
    activeHover != null ? hoverCoordinates[activeHover.index] ?? null : null;
  const latestValue = currentValue ?? latestPoint?.value ?? null;
  const deltaEndValue = deltaValue !== undefined ? deltaValue : latestValue;
  const firstValue = visibleCoordinates[0]?.value ?? null;
  const displayedValue = activePoint?.value ?? latestValue;
  const delta =
    deltaEndValue != null && firstValue != null && visibleCoordinates.length > 1
      ? deltaEndValue - firstValue
      : null;
  const selectedPreset =
    RANGE_PRESETS.find((range) => range.key === selectedRange) ?? RANGE_PRESETS[3];
  const rangeSummary = scopedTimeDomain
    ? `${formatTimestampAxisLabel(scopedTimeDomain.start)} - ${formatTimestampAxisLabel(scopedTimeDomain.end)}`
    : formatAxisRangeSummary(visibleCoordinates);
  const hoverDateText = activePoint ? formatInlinePointDate(activePoint) : null;
  const primaryMetaText = rangeSummary;
  const secondaryMetaText = subtitle ?? null;
  const axisTicks = chart?.projectionCoordinates.length
    ? buildProjectedAxisTicks(
        visibleCoordinates,
        chart.projectionCoordinates,
        compact || isMobileViewport || measuredChartWidth < 640
      )
    : scopedTimeDomain
      ? buildTimeAxisTicks(scopedTimeDomain, measuredChartWidth, compact)
      : buildAxisTicks(visibleCoordinates, compact);
  const showRangeControls =
    !hideRangeControls &&
    fixedRange == null &&
    Math.max(parsedPoints.length, parsedRangeScopePoints.length) > 1;
  const reserveDateSlot = visibleCoordinates.length > 0;
  const stableHeroHeaderClass =
    scopedTimeDomain && isHeroLayout
      ? "min-h-[5.85rem] overflow-visible max-[640px]:min-h-[4.95rem]"
      : "";

  const shellClass = isMobileHeroLayout
    ? "rounded-[20px] border border-white/10 bg-[#101011] px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.045)]"
    : tone === "dark"
      ? compact
        ? "rounded-2xl border border-white/10 bg-white/[0.06] px-3 py-3 max-[640px]:px-2.5 max-[640px]:py-2.5"
        : isHeroLayout
          ? "rounded-[28px] border border-white/10 bg-white/[0.06] px-5 py-5 sm:px-6 sm:py-6"
          : "rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-4 max-[640px]:px-3 max-[640px]:py-3"
      : compact
        ? "rounded-2xl border border-white/8 bg-white/[0.04] px-3 py-3 max-[640px]:px-2.5 max-[640px]:py-2.5"
        : isHeroLayout
          ? "rounded-[28px] border border-white/8 bg-white/[0.04] px-5 py-5 sm:px-6 sm:py-6"
          : "rounded-2xl border border-white/8 bg-white/[0.04] px-4 py-4 max-[640px]:px-3 max-[640px]:py-3";

  if (!rangeResolved) {
    return (
      <section
        aria-hidden="true"
        className={shellClass}
        style={{
          minHeight: compact ? 214 : isHeroLayout ? 318 : 286,
          pointerEvents: "none",
          visibility: "hidden",
        }}
      />
    );
  }

  const titleClass =
    tone === "dark"
      ? "text-xs font-semibold uppercase tracking-[0.08em] text-white/50"
      : "text-xs font-semibold uppercase tracking-[0.08em] text-white/50";
  const valueClass = isMobileHeroLayout
    ? "text-[2.1rem] font-bold leading-none text-white tabular-nums"
    : tone === "dark"
      ? compact
        ? "text-3xl font-bold text-white tabular-nums sm:text-[2.5rem]"
        : isHeroLayout
          ? "text-4xl font-bold text-white tabular-nums sm:text-[2.85rem]"
          : "text-2xl font-bold text-white tabular-nums"
      : compact
        ? "text-3xl font-bold text-white tabular-nums sm:text-[2.5rem]"
        : isHeroLayout
          ? "text-4xl font-bold text-white tabular-nums sm:text-[2.85rem]"
          : "text-2xl font-bold text-white tabular-nums";
  const metaClass =
    tone === "dark" ? "text-xs text-white/52" : "text-xs text-white/48";
  const subtitleClass =
    tone === "dark" ? "text-xs text-white/38" : "text-xs text-white/40";
  const emptyClass =
    tone === "dark"
      ? compact
        ? "flex h-28 items-center justify-center rounded-xl border border-dashed border-white/10 text-sm text-white/40"
        : isHeroLayout
          ? "flex h-[148px] items-center justify-center rounded-2xl border border-dashed border-white/10 px-5 text-center text-sm text-white/40"
          : "flex h-[184px] items-center justify-center rounded-xl border border-dashed border-white/10 text-sm text-white/40"
      : compact
        ? "flex h-28 items-center justify-center rounded-xl border border-dashed border-white/10 text-sm text-white/40"
        : isHeroLayout
          ? "flex h-[148px] items-center justify-center rounded-2xl border border-dashed border-white/10 px-5 text-center text-sm text-white/40"
          : "flex h-[184px] items-center justify-center rounded-xl border border-dashed border-white/10 text-sm text-white/40";
  const axisLabelClass =
    tone === "dark" ? "fill-white/40" : "fill-white/40";
  const gridLineClass =
    tone === "dark" ? "stroke-white/10" : "stroke-white/10";
  const tooltipClass =
    tone === "dark"
      ? "border-white/12 bg-[#0c0c0f]/92 text-white shadow-2xl shadow-black/35"
      : "border-white/10 bg-[#0c0c0f]/90 text-white shadow-xl shadow-black/35";
  const accentStroke = currency === "USD" ? "#FBBF24" : "var(--dc-primary)";
  const accentFillStart =
    currency === "USD" ? "rgba(245, 158, 11, 0.32)" : "rgb(var(--dc-primary-rgb) / 0.28)";
  const accentFillEnd =
    currency === "USD" ? "rgba(245, 158, 11, 0.02)" : "rgb(var(--dc-primary-rgb) / 0.02)";
  const dotFill = currency === "USD" ? "#fbbf24" : "var(--dc-primary-soft)";
  const projectionVisual =
    projection?.tone === "strong-rise"
      ? { stroke: "#34d399", text: "text-emerald-200/78" }
      : projection?.tone === "decline"
        ? { stroke: "#fb7185", text: "text-rose-200/78" }
        : projection?.tone === "flat"
          ? { stroke: "#fbbf24", text: "text-amber-200/78" }
          : { stroke: "#38bdf8", text: "text-sky-100/72" };
  const projectionSummary = projection?.summary ?? null;
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
  const rangeButtonClass = isDashboardLayout
    ? "min-h-7 px-2.5 py-1 text-[12px]"
    : compact
      ? "min-h-[var(--ui-chip-count-min-height)] px-[var(--ui-chip-count-x)] py-[var(--ui-chip-count-y)] text-[length:var(--ui-chip-count-font-size)] max-[640px]:min-h-8 max-[640px]:px-2.5 max-[640px]:text-[11px]"
      : isMobileHeroLayout
        ? "min-h-8 px-2.5 py-1 text-[11px]"
      : isHeroLayout
        ? "min-h-[var(--ui-chip-min-height)] px-[var(--ui-chip-x)] py-[var(--ui-chip-y)] text-[length:var(--ui-chip-font-size)] max-[640px]:min-h-8 max-[640px]:px-2.5 max-[640px]:text-[11px]"
        : "min-h-[var(--ui-chip-count-min-height)] px-[var(--ui-chip-count-x)] py-[var(--ui-chip-count-y)] text-[length:var(--ui-chip-count-font-size)] max-[640px]:min-h-8 max-[640px]:px-2.5 max-[640px]:text-[11px]";

  function updateHoverState(event: ReactPointerEvent<SVGSVGElement>) {
    const pointerX = getPointerChartX(event, measuredChartWidth);
    setActiveHover({
      index: getNearestCoordinateIndex(pointerX, hoverCoordinates),
      pointerX,
    });
  }

  function selectRange(range: RangeKey) {
    setActiveHover(null);
    writeStoredRange(effectiveRangeStorageKeys, range);
  }

  const rangeButtonsJsx = showRangeControls ? (
    <div className={`flex flex-wrap items-center ${isMobileHeroLayout ? "gap-1" : isHeroLayout ? "gap-[var(--ui-chip-gap)]" : "gap-1"}`}>
      {RANGE_PRESETS.map((range) => (
        <button
          key={range.key}
          type="button"
          onClick={() => selectRange(range.key)}
          aria-pressed={selectedRange === range.key}
          data-chart-range
          data-active={selectedRange === range.key ? "true" : "false"}
          className={`inline-flex items-center rounded-full font-semibold leading-none transition-colors ${rangeButtonClass} ${
            selectedRange === range.key
              ? "text-white"
              : tone === "dark"
                ? "text-white/55 hover:text-white/85"
                : "text-white/55 hover:text-white"
          }`}
        >
          {range.label}
        </button>
      ))}
    </div>
  ) : null;

  const deltaValueClass =
    isDashboardLayout ? "text-base" : isMobileHeroLayout ? "text-sm" : isHeroLayout ? "text-lg" : "text-sm";
  const deltaJsx =
    delta != null ? (
      <div className={isMobileHeroLayout ? "max-w-[7.25rem] overflow-hidden text-right" : ""}>
        <p
          className={`${
            deltaValueClass
          } break-words font-semibold leading-tight tabular-nums ${
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
          {delta != null && delta !== 0 && deltaEndValue != null ? (
            <span className={isMobileHeroLayout ? "block sm:ml-1.5 sm:inline" : "ml-1.5"}>
              ({delta >= 0 ? "+" : ""}
              {((delta / Math.max(0.01, deltaEndValue - delta)) * 100).toFixed(1)}%)
            </span>
          ) : null}
        </p>
        <p className={`${subtitleClass} mt-0.5`}>vs {selectedPreset.deltaText}</p>
      </div>
    ) : null;
  const reservedDeltaJsx =
    !deltaJsx && scopedTimeDomain && isHeroLayout && !isMobileHeroLayout ? (
      <div className="invisible" aria-hidden="true">
        <p className="text-lg font-semibold tabular-nums">+€0.00 (0.0%)</p>
        <p className={`${subtitleClass} mt-0.5 leading-tight`}>vs {selectedPreset.deltaText}</p>
      </div>
    ) : null;

  if (isDashboardLayout) {
    return (
      <section className={shellClass}>
        <div className="grid h-full min-w-0 gap-4 sm:grid-cols-[minmax(8rem,12rem)_minmax(0,1fr)] sm:gap-6">
          <div className="min-w-0 flex flex-col justify-center">
            <p className="text-sm font-medium text-white/55">{title}</p>
            {showCurrentValue ? (
              <p className={`${valueClass} mt-1`}>{formatCurrency(displayedValue, currency)}</p>
            ) : null}
            {deltaJsx ? <div className="mt-2">{deltaJsx}</div> : null}
          </div>
          <div className="flex min-w-0 flex-col">
            {showRangeControls && (
              <div className="mb-3 flex justify-center">{rangeButtonsJsx}</div>
            )}
            {loading ? (
              <div className={emptyClass}>Loading chart...</div>
            ) : !hasDrawablePoints ? (
              <div className={emptyClass}>{emptyText}</div>
            ) : (
              <div className="relative flex w-full min-w-0 flex-1 items-stretch gap-1.5">
                <div ref={chartFrameRef} className="relative w-full min-w-0">
                  {chart && (
                  <>
                    {activePoint && (
                      <div
                        className={`pointer-events-none absolute z-10 w-max max-w-[calc(100%-8px)] rounded-xl border px-2.5 py-2 text-left ${tooltipClass} ${tooltipAlignmentClass}`}
                        style={{ left: tooltipLeft, top: tooltipTop }}
                      >
                        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] opacity-60">
                          {activePoint.projected ? `${projection?.label ?? "Prediction"} · ` : ""}{formatPointDate(activePoint)}
                        </p>
                        <p className="mt-1 text-sm font-semibold tabular-nums">
                          {formatCurrency(activePoint.value, currency)}
                        </p>
                      </div>
                    )}
                    <svg
                      viewBox={`0 0 ${measuredChartWidth} ${height}`}
                      className="block w-full cursor-crosshair overflow-visible touch-pan-y select-none"
                      style={{ height }}
                      role="img"
                      aria-label={projection ? "Historical price with attached base prediction" : "Historical price"}
                      onPointerMove={updateHoverState}
                      onPointerDown={updateHoverState}
                      onPointerLeave={() => setActiveHover(null)}
                    >
                      <defs>
                        <linearGradient id={`${chartId}-fill`} x1="0" x2="0" y1="0" y2="1">
                          <stop offset="0%" stopColor={accentFillStart} />
                          <stop offset="100%" stopColor={accentFillEnd} />
                        </linearGradient>
                        <filter id={`${chartId}-glow`} x="-20%" y="-20%" width="140%" height="140%">
                          <feGaussianBlur stdDeviation="3" result="blur" />
                          <feMerge>
                            <feMergeNode in="blur" />
                            <feMergeNode in="SourceGraphic" />
                          </feMerge>
                        </filter>
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
                      {chart.linePath ? (
                        <path
                          d={chart.linePath}
                          fill="none"
                          stroke={accentStroke}
                          strokeWidth="2.75"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          filter={isMobileViewport ? undefined : `url(#${chartId}-glow)`}
                          data-chart-series="history"
                        />
                      ) : null}
                      {chart.projectionLinePath ? (
                        <>
                          <line
                            x1={chart.forecastStartX}
                            x2={chart.forecastStartX}
                            y1={chart.plotTop}
                            y2={chart.plotBottom}
                            stroke={projectionVisual.stroke}
                            strokeOpacity="0.22"
                            strokeDasharray="3 5"
                            data-chart-seam
                          />
                          <path
                            d={chart.projectionLinePath}
                            fill="none"
                            stroke={projectionVisual.stroke}
                            strokeWidth="2.75"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            data-chart-series="prediction"
                          />
                        </>
                      ) : null}
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
                      {chart.pathCoordinates.length > 1 && (
                        <circle
                          cx={chart.pathCoordinates[chart.pathCoordinates.length - 1].x}
                          cy={chart.pathCoordinates[chart.pathCoordinates.length - 1].y}
                          r="4"
                          fill={dotFill}
                        />
                      )}
                      {activePoint && (
                        <circle
                          cx={activePoint.x}
                          cy={activePoint.y}
                          r="5"
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
                              fontSize="10.5"
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
                {chart && (
                  <div className="flex w-9 shrink-0 flex-col justify-between py-[2px] pb-7 text-right text-[10.5px] font-medium text-white/40" style={{ height }}>
                    <span>{formatCompactCurrencyLabel(chart.maxValue, currency)}</span>
                    <span>{formatCompactCurrencyLabel((chart.maxValue + chart.minValue) / 2, currency)}</span>
                    <span>{formatCompactCurrencyLabel(chart.minValue, currency)}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className={shellClass}>
      <div
        className={`${stableHeroHeaderClass} ${
          isMobileHeroLayout
            ? headerLeadingAccessory
              ? "grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2"
              : "grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2"
            : isHeroLayout
            ? "flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"
            : "flex items-start justify-between gap-3"
        }`}
      >
        <div className="min-w-0">
          {headerLeadingAccessory ? (
            <div className="min-w-0">
              {headerLeadingAccessory}
              {showCurrentValue ? (
                <p className={`${valueClass} mt-2`}>{formatCurrency(displayedValue, currency)}</p>
              ) : null}
            </div>
          ) : (
            <>
              <p className={titleClass}>{title}</p>
              {showCurrentValue ? (
                <p className={`${valueClass} mt-1`}>{formatCurrency(displayedValue, currency)}</p>
              ) : null}
              {primaryMetaText && <p className={`${metaClass} mt-1`}>{primaryMetaText}</p>}
              {secondaryMetaText && secondaryMetaText !== primaryMetaText && (
                <p className={`${subtitleClass} mt-1`}>{secondaryMetaText}</p>
              )}
            </>
          )}
        </div>

        {(headerAccessory || delta != null || reserveDateSlot) && (
          <div
            className={`shrink-0 ${
              isMobileHeroLayout
                ? headerLeadingAccessory
                  ? "justify-self-end text-right"
                  : "text-right"
                : isHeroLayout
                  ? "sm:pt-1 text-left sm:text-right"
                  : "text-right"
            }`}
          >
            <div className={`${isMobileHeroLayout ? "min-w-0 max-w-[10.5rem] gap-1.5" : "min-w-[4.5rem] gap-2"} flex flex-col items-end`}>
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
              {deltaJsx ?? reservedDeltaJsx}
            </div>
          </div>
        )}
      </div>

      {showRangeControls && (
        <div className={isMobileHeroLayout ? "mt-3" : compact ? "mt-3" : "mt-4"}>
          {rangeButtonsJsx}
        </div>
      )}

      {loading ? (
        <div className={compact ? "mt-3" : "mt-4"}>
          <div className={emptyClass}>Loading chart...</div>
        </div>
      ) : !hasDrawablePoints ? (
        <div className={compact ? "mt-3" : "mt-4"}>
          <div className={emptyClass}>{emptyText}</div>
        </div>
      ) : (
        <div className={isMobileHeroLayout ? "mt-3" : compact ? "mt-3" : "mt-5"}>
          {projection && chart?.projectionLinePath ? (
            <div
              className="mb-2 flex flex-wrap items-center justify-end gap-3 text-[10px] font-semibold text-white/45"
              data-chart-legend
            >
              {chart.coordinates.length ? (
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-0.5 w-5 rounded-full bg-violet-400" /> History
                </span>
              ) : null}
              <span className={`inline-flex items-center gap-1.5 ${projectionVisual.text}`}>
                <span
                  className="h-0.5 w-5 rounded-full"
                  style={{ backgroundColor: projectionVisual.stroke }}
                />
                {projection.label ?? "Prediction"}
                {projection.summary ? (
                  <strong className="tabular-nums text-white/80">{projection.summary}</strong>
                ) : null}
              </span>
            </div>
          ) : null}
          <div ref={chartFrameRef} className="relative w-full min-w-0">
            {!chart ? (
              <div className={emptyClass}>Loading chart...</div>
            ) : (
              <>
            {activePoint && (
              <div
                className={`pointer-events-none absolute z-10 w-max max-w-[calc(100%-8px)] rounded-xl border px-2.5 py-2 text-left ${tooltipClass} ${tooltipAlignmentClass}`}
                style={{ left: tooltipLeft, top: tooltipTop }}
              >
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] opacity-60">
                  {activePoint.projected ? `${projection?.label ?? "Prediction"} · ` : ""}{formatPointDate(activePoint)}
                </p>
                <p className="mt-1 text-sm font-semibold tabular-nums">
                  {formatCurrency(activePoint.value, currency)}
                </p>
              </div>
            )}

            <svg
              viewBox={`0 0 ${measuredChartWidth} ${height}`}
              className="block w-full cursor-crosshair overflow-visible touch-pan-y select-none"
              style={{ height }}
              role="img"
              aria-label={projection ? "Historical price with attached base prediction" : "Historical price"}
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
              {chart.linePath ? (
                <path
                  d={chart.linePath}
                  fill="none"
                  stroke={accentStroke}
                  strokeWidth={compact ? "2.75" : isHeroLayout ? "3.25" : "3"}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  data-chart-series="history"
                />
              ) : null}

              {chart.projectionLinePath ? (
                <>
                  <line
                    x1={chart.forecastStartX}
                    x2={chart.forecastStartX}
                    y1={chart.plotTop}
                    y2={chart.plotBottom}
                    stroke={projectionVisual.stroke}
                    strokeOpacity="0.22"
                    strokeDasharray="3 5"
                    data-chart-seam
                  />
                  <path
                    d={chart.projectionLinePath}
                    fill="none"
                    stroke={projectionVisual.stroke}
                    strokeWidth={compact ? "2.75" : isHeroLayout ? "3.25" : "3"}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    data-chart-series="prediction"
                  />
                  {chart.projectionCoordinates.slice(1).map((point) => (
                    <circle
                      key={`${point.date}-${point.value}`}
                      cx={point.x}
                      cy={point.y}
                      r={isHeroLayout ? "3.5" : "3"}
                      fill="#071018"
                      stroke={projectionVisual.stroke}
                      strokeWidth="2"
                    />
                  ))}
                  {projectionSummary && !isMobileViewport && chart.projectionCoordinates.length > 1 ? (() => {
                    const point = chart.projectionCoordinates[chart.projectionCoordinates.length - 1];
                    return (
                      <text
                        x={point.x - 4}
                        y={clamp(point.y - 10, chart.plotTop + 11, chart.plotBottom - 7)}
                        fill={projectionVisual.stroke}
                        fontSize="11"
                        fontWeight="700"
                        paintOrder="stroke"
                        stroke="#090a0f"
                        strokeWidth="4"
                        strokeLinejoin="round"
                        textAnchor="end"
                        data-chart-projection-summary
                      >
                        {projectionSummary}
                      </text>
                    );
                  })() : null}
                </>
              ) : null}

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

              {chart.pathCoordinates.length === 1 ? (
                <circle
                  cx={chart.pathCoordinates[0].x}
                  cy={chart.pathCoordinates[0].y}
                  r="4.5"
                  fill={dotFill}
                />
              ) : chart.pathCoordinates.length > 1 ? (
                <>
                  <circle
                    cx={chart.pathCoordinates[0].x}
                    cy={chart.pathCoordinates[0].y}
                    r="3.25"
                    fill={dotFill}
                    fillOpacity="0.9"
                  />
                  <circle
                    cx={chart.pathCoordinates[chart.pathCoordinates.length - 1].x}
                    cy={chart.pathCoordinates[chart.pathCoordinates.length - 1].y}
                    r={isHeroLayout ? "4.5" : "4"}
                    fill={dotFill}
                  />
                </>
              ) : null}

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
