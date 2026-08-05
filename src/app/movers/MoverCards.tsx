"use client";

import CachedImage from "@/components/CachedImage";
import {
  CardListTile,
  CardListTileAnalysisLink,
  CardListTileBody,
  CardListTileFooter,
  CardListTileGrid,
  CardListTileHeader,
  CardListTileInsight,
  CardListTileMedia,
} from "@/components/CardListTile";
import CollectionCardQuickActions from "@/components/CollectionCardQuickActions";
import Link from "next/link";
import { memo, useState } from "react";
import type { KeyboardEvent, MouseEvent } from "react";
import { ChevronRight, Loader2 } from "lucide-react";
import { rarityBadge, formatCurrency } from "@/components/card-modal/utils";
import { getExpansionHref } from "@/lib/games";
import { getCardImageClassName, getCardImageFrameClassName } from "@/lib/card-image-display";
import type { CollectionMoverBrowserItem } from "@/lib/movers";
import type { CardQuickActionData, CardQuickActionMap } from "@/lib/card-quick-actions";

interface PreviewCardConfig {
  title: string;
  eyebrow: string;
  description: string;
  href: string;
  hrefLabel?: string;
  items: CollectionMoverBrowserItem[];
  reasonMode?: "raw" | "graded" | "target";
}

interface SpotlightConfig {
  title: string;
  item: CollectionMoverBrowserItem | null;
  windowKey: "7d" | "30d";
}

function formatPercent(value: number | null | undefined): string {
  if (value == null) {
    return "--";
  }

  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function formatDelta(value: number | null | undefined, currency: "EUR" | "USD"): string {
  if (value == null) {
    return "--";
  }

  return `${value >= 0 ? "+" : ""}${formatCurrency(value, currency)}`;
}

function formatOptionalCurrency(
  value: number | null | undefined,
  currency: "EUR" | "USD"
): string {
  return value == null ? "--" : formatCurrency(value, currency);
}

function formatTileCurrency(value: number, currency: "EUR" | "USD"): string {
  if (Math.abs(value) >= 1000) {
    const symbol = currency === "EUR" ? "€" : "$";
    const sign = value < 0 ? "-" : "";
    const thousands = Math.abs(value) / 1000;
    const formatted =
      thousands >= 100
        ? thousands.toFixed(0)
        : thousands >= 10
          ? thousands.toFixed(0)
          : thousands.toFixed(1);

    return `${sign}${symbol}${formatted}K`;
  }

  if (Math.abs(value) >= 100) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  }

  return formatCurrency(value, currency);
}

function formatTileDelta(value: number | null | undefined, currency: "EUR" | "USD"): string {
  if (value == null) {
    return "--";
  }

  return `${value >= 0 ? "+" : ""}${formatTileCurrency(value, currency)}`;
}

function formatScoreValue(value: number): string {
  if (Math.abs(value) >= 100) {
    return new Intl.NumberFormat("en-US", {
      maximumFractionDigits: 0,
    }).format(value);
  }

  return value.toFixed(1);
}

function formatOptionalScore(value: number | null | undefined): string {
  return value == null ? "--" : formatScoreValue(value);
}

function getToneClass(value: number | null | undefined): string {
  if (value == null) {
    return "text-white/45";
  }

  if (value < 0) {
    return "text-rose-300";
  }

  if (value > 0) {
    return "text-emerald-300";
  }

  return "text-white/45";
}


function stopCardOpen(event: MouseEvent<HTMLElement>) {
  event.stopPropagation();
}

function isNestedInteractiveTarget(event: KeyboardEvent<HTMLElement>): boolean {
  if (!(event.target instanceof HTMLElement)) {
    return false;
  }

  return (
    event.target !== event.currentTarget &&
    Boolean(event.target.closest("a,button,input,select,textarea"))
  );
}

function handleOpenKey(event: KeyboardEvent<HTMLElement>, onOpen: () => void) {
  if (isNestedInteractiveTarget(event)) {
    return;
  }

  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }

  event.preventDefault();
  onOpen();
}

function getMoverQuickActionData(
  item: CollectionMoverBrowserItem,
  quickActions: CardQuickActionMap
): CardQuickActionData {
  return (
    quickActions[item.cardId] ?? {
      card: {
        id: item.cardId,
        name: item.name,
        image_url: item.imageUrl,
        episode: {
          id: item.episodeId,
          name: item.episodeName,
          code: item.episodeCode,
        },
      },
      owned: item.ownedCount > 0,
      wantItem: null,
    }
  );
}







type MoverDisplayMode = "raw" | "graded" | "target";
type MoverChangeDisplay = "percent" | "amount";

type MoverReasonTone = "emerald" | "rose" | "amber" | "sky" | "violet";

interface MoverReason {
  label: string;
  tone: MoverReasonTone;
}

function getRecentDropAmount(item: CollectionMoverBrowserItem): number {
  return Math.max(
    item.change7d != null && item.change7d < 0 ? Math.abs(item.change7d) : 0,
    item.change30d != null && item.change30d < 0 ? Math.abs(item.change30d) : 0
  );
}

function reasonChipClass(tone: MoverReasonTone): string {
  switch (tone) {
    case "emerald":
      return "border-emerald-400/22 bg-emerald-400/[0.10] text-emerald-200";
    case "rose":
      return "border-rose-400/22 bg-rose-400/[0.10] text-rose-200";
    case "amber":
      return "border-amber-400/22 bg-amber-400/[0.10] text-amber-200";
    case "sky":
      return "border-sky-400/22 bg-sky-400/[0.10] text-sky-200";
    case "violet":
      return "border-violet-400/22 bg-violet-400/[0.10] text-violet-200";
  }
}

function buySignalChipClass(
  label: NonNullable<CollectionMoverBrowserItem["buySignal"]>["label"]
): string {
  if (label === "strong_buy") {
    return "border-emerald-300/30 bg-emerald-400/[0.14] text-emerald-100";
  }
  if (label === "buy") {
    return "border-emerald-300/18 bg-emerald-400/[0.08] text-emerald-200";
  }
  if (label === "strong_sell") {
    return "border-rose-300/30 bg-rose-400/[0.14] text-rose-100";
  }
  if (label === "sell") {
    return "border-rose-300/18 bg-rose-400/[0.08] text-rose-200";
  }
  return "border-violet-300/18 bg-violet-400/[0.08] text-violet-100";
}

function MoverBuySignalChip({
  signal,
}: {
  signal: CollectionMoverBrowserItem["buySignal"];
}) {
  if (!signal) return null;

  return (
    <span
      className={`inline-flex max-w-full rounded-md border px-2 py-0.5 text-[10px] font-black uppercase tabular-nums ${buySignalChipClass(
        signal.label
      )}`}
      title={`Buy Signal: ${signal.labelText} (${signal.score}/100, ${signal.confidence} confidence)`}
    >
      {signal.labelText}
    </span>
  );
}

/**
 * Picks 0-2 short, human-readable reasons explaining why a card is on the list.
 * Pure: only reads existing fields on the mover item.
 */
export function getMoverReasons(
  item: CollectionMoverBrowserItem,
  mode: MoverDisplayMode,
  changeDisplay: MoverChangeDisplay = "percent"
): MoverReason[] {
  const reasons: MoverReason[] = [];

  if (item.priceQuality.status === "suspicious") {
    return [{ label: item.priceQuality.reason ?? "Outlier ignored", tone: "rose" }];
  }

  if (item.priceQuality.status === "thin_history" && mode !== "target") {
    return [{ label: item.priceQuality.reason ?? "Thin history", tone: "amber" }];
  }

  if (mode === "target" && item.grading) {
    if (item.grading.priceAdjusted) {
      reasons.push({
        label: `Ask ${formatCurrency(item.grading.marketPrice, "EUR")} capped`,
        tone: "amber",
      });
    }
    if (
      item.grading.gradeStepMultiplier != null &&
      item.grading.spreadRisk !== "normal" &&
      reasons.length < 2
    ) {
      reasons.push({
        label: `${item.grading.gradeStepMultiplier.toFixed(1)}x vs ${item.grading.fallbackLabel ?? "lower grade"}`,
        tone: "amber",
      });
    }
    if (item.grading.expectedGain > 0 && reasons.length < 2) {
      reasons.push({
        label: `EV +${formatCurrency(item.grading.expectedGain, "EUR")}`,
        tone: "emerald",
      });
    }
    if (item.priceQuality.status === "thin_history" && reasons.length < 2) {
      reasons.push({
        label: item.priceQuality.reason ?? "Thin grade data",
        tone: "amber",
      });
    }
    if (item.grading.tier === "pristine" && reasons.length < 2) {
      reasons.push({
        label: `${item.grading.estimatedHitRatePct.toFixed(1)}% pristine hit`,
        tone: "violet",
      });
    }
    if (item.olderValueScore >= 5 && reasons.length < 2) {
      reasons.push({
        label: item.grading.tier === "gem" ? "Older gem target" : "Older value",
        tone: "sky",
      });
    }
    if (
      item.grading.rawPrice != null &&
      item.grading.rawPrice <= 10 &&
      reasons.length < 2
    ) {
      reasons.push({ label: "Cheap entry", tone: "violet" });
    }
    return reasons.slice(0, 2);
  }

  // raw or graded
  const recentDropAmount = getRecentDropAmount(item);
  if (changeDisplay === "amount") {
    return recentDropAmount > 0
      ? [{ label: `${formatTileDelta(-recentDropAmount, item.currency)} drop`, tone: "rose" }]
      : [];
  }

  if (recentDropAmount >= 50) {
    reasons.push({
      label: `-${formatCurrency(recentDropAmount, item.currency)} drop`,
      tone: "rose",
    });
  } else if (item.change7dPct != null && item.change7dPct >= 15) {
    reasons.push({ label: `+${item.change7dPct.toFixed(0)}% 7d`, tone: "emerald" });
  } else if (item.change30dPct != null && item.change30dPct >= 30) {
    reasons.push({ label: `+${item.change30dPct.toFixed(0)}% 30d`, tone: "emerald" });
  } else if (item.change7dPct != null && item.change7dPct <= -10) {
    reasons.push({ label: `${item.change7dPct.toFixed(0)}% 7d`, tone: "rose" });
  }

  if (
    item.gapToPeakPct != null &&
    item.gapToPeakPct <= -40 &&
    reasons.length < 2
  ) {
    reasons.push({
      label: `${Math.round(item.gapToPeakPct)}% off peak`,
      tone: "violet",
    });
  } else if (item.olderValueScore >= 5 && reasons.length < 2) {
    reasons.push({
      label: item.releaseAgeYears != null ? `${Math.floor(item.releaseAgeYears)}y value` : "Older value",
      tone: "sky",
    });
  } else if (
    item.currentPrice != null &&
    item.currentPrice <= 15 &&
    item.rarityWeight >= 1.15 &&
    reasons.length < 2
  ) {
    reasons.push({ label: "Cheap & rare", tone: "sky" });
  } else if (
    item.changeFromLowPct != null &&
    item.changeFromLowPct >= 30 &&
    item.change7dPct != null &&
    item.change7dPct > 0 &&
    reasons.length < 2
  ) {
    reasons.push({ label: "Off the floor", tone: "amber" });
  }

  if (reasons.length === 0 && item.movementScore > 0) {
    reasons.push({ label: "Recent move", tone: "emerald" });
  }

  return reasons.slice(0, 1);
}

function MoverReasonChips({
  item,
  mode,
  changeDisplay,
  mobileLimit = 2,
}: {
  item: CollectionMoverBrowserItem;
  mode: MoverDisplayMode;
  changeDisplay: MoverChangeDisplay;
  mobileLimit?: number;
}) {
  const reasons = getMoverReasons(item, mode, changeDisplay);
  if (reasons.length === 0) return null;

  return (
    <>
      {reasons.map((reason, index) => (
        <span
          key={reason.label}
          className={`${index >= mobileLimit ? "hidden sm:inline-flex" : "inline-flex"} rounded-full border px-2 py-1 text-[8px] font-bold uppercase tracking-[0.08em] tabular-nums ${reasonChipClass(
            reason.tone
          )}`}
        >
          {reason.label}
        </span>
      ))}
    </>
  );
}

function metricValueClass(toneValue?: number | null): string {
  if (toneValue == null) return "text-white/82";
  if (toneValue < 0) return "text-rose-300";
  if (toneValue > 0) return "text-emerald-300";
  return "text-white/82";
}

function getMoverVariantKey(item: CollectionMoverBrowserItem): string {
  const normalizedLabel =
    item.gradedLabel?.trim().toLocaleLowerCase("en-US") || "ungraded";
  return `${item.source}:${normalizedLabel}`;
}

function buildCompactMetrics(
  item: CollectionMoverBrowserItem,
  mode: MoverDisplayMode,
  metricWindowLabel = "7D",
  changeDisplay: MoverChangeDisplay = "percent"
): Array<{
  label: string;
  value: string;
  toneValue?: number | null;
}> {
  const all: Array<{ label: string; value: string; toneValue?: number | null } | null> = [];

  if (mode === "target" && item.grading) {
    all.push(
      { label: "Raw CM", value: formatCurrency(item.grading.rawPrice, "EUR") },
      {
        label: `${item.gradedLabel ?? "Grade"} target`,
        value: formatTileCurrency(item.grading.gradedPrice, "EUR"),
      },
      item.grading.fallbackPrice != null
        ? {
            label: item.grading.fallbackLabel ?? "Lower grade",
            value: formatTileCurrency(item.grading.fallbackPrice, "EUR"),
          }
        : {
            label: "Expected",
            value: formatTileCurrency(item.grading.expectedValue, "EUR"),
            toneValue: item.grading.expectedGain,
          },
      {
        label: "Hit rate",
        value: `${item.grading.estimatedHitRatePct.toFixed(1)}%`,
        toneValue: item.grading.estimatedHitRatePct - 25,
      }
    );
  } else if (mode === "graded") {
    all.push(
      item.tcggoScore?.score != null
        ? { label: "TCGGO", value: formatOptionalScore(item.tcggoScore.score) }
        : null,
      item.change7dPct != null
        ? {
            label: metricWindowLabel,
            value: formatPercent(item.change7dPct),
            toneValue: item.change7dPct,
          }
        : null,
      item.change30dPct != null
        ? { label: "30D", value: formatPercent(item.change30dPct), toneValue: item.change30dPct }
        : null,
      item.changeSinceTrackedPct != null
        ? {
            label: "Since Tracked",
            value: formatPercent(item.changeSinceTrackedPct),
            toneValue: item.changeSinceTrackedPct,
          }
        : null,
      item.cardmarketPrice != null
        ? { label: "Raw CM", value: formatOptionalCurrency(item.cardmarketPrice, "EUR") }
        : null
    );
  } else {
    all.push(
      item.tcggoScore?.score != null
        ? { label: "TCGGO", value: formatOptionalScore(item.tcggoScore.score) }
        : null,
      changeDisplay === "amount" && item.change7d != null
        ? {
            label: metricWindowLabel,
            value: formatTileDelta(item.change7d, item.currency),
            toneValue: item.change7d,
          }
        : item.change7dPct != null
        ? {
            label: metricWindowLabel,
            value: formatPercent(item.change7dPct),
            toneValue: item.change7dPct,
          }
        : null,
      item.change30dPct != null
        ? { label: "30D", value: formatPercent(item.change30dPct), toneValue: item.change30dPct }
        : null,
      item.changeSinceTrackedPct != null
        ? {
            label: "Since",
            value: formatPercent(item.changeSinceTrackedPct),
            toneValue: item.changeSinceTrackedPct,
          }
        : null
    );
  }

  return all.filter((m): m is { label: string; value: string; toneValue?: number | null } =>
    m !== null
  );
}


const MoverTile = memo(function MoverTile({
  variants,
  isLoading,
  displayMode,
  isHighlighted,
  metricWindowLabel,
  changeDisplay,
  cardQuickActions,
  prioritizeImage,
  onOpen,
}: {
  variants: readonly CollectionMoverBrowserItem[];
  isLoading: boolean;
  displayMode: MoverDisplayMode;
  isHighlighted: boolean;
  metricWindowLabel?: string;
  changeDisplay: MoverChangeDisplay;
  cardQuickActions: CardQuickActionMap;
  prioritizeImage: boolean;
  onOpen: (cardId: string) => void;
}) {
  const [selectedVariantKey, setSelectedVariantKey] = useState(
    () => (variants[0] ? getMoverVariantKey(variants[0]) : "")
  );
  const item =
    variants.find((variant) => getMoverVariantKey(variant) === selectedVariantKey) ??
    variants[0];
  if (!item) return null;

  const open = () => onOpen(item.cardId);
  const mode = displayMode;
  const isTarget = mode === "target";
  const showGradeVariants = mode !== "raw" && variants.length > 1;
  const compactMetrics = buildCompactMetrics(item, mode, metricWindowLabel, changeDisplay);
  const primaryLabel = isTarget ? "Grade score" : item.gradedLabel ?? "Current";
  const primaryValue = isTarget
    ? formatScoreValue(item.moverScore)
    : formatTileCurrency(item.currentPrice, item.currency);
  const mobileBadgeCount = Number(Boolean(item.normalizedRarity)) + Number(Boolean(item.buySignal));
  const mobileReasonLimit = Math.max(0, 2 - mobileBadgeCount);
  const primaryMetric = compactMetrics[0] ?? null;
  const secondaryMetric = compactMetrics[1] ?? null;

  return (
    <CardListTile
      role="button"
      tabIndex={0}
      data-mover-card-id={item.cardId}
      onClick={open}
      onKeyDown={(event) => handleOpenKey(event, open)}
      aria-label={`Open details for ${item.name}`}
      interactive
      layout="showcase"
      state={isHighlighted ? "highlighted" : "default"}
      className="scroll-mt-24"
    >
      {isLoading ? (
        <div className="absolute right-2.5 top-2.5 z-10 inline-flex h-6 w-6 items-center justify-center rounded-full border border-white/10 bg-black/80 text-white sm:h-7 sm:w-7">
          <Loader2 className="h-3.5 w-3.5 animate-spin sm:h-4 sm:w-4" />
        </div>
      ) : null}

      <CardListTileMedia imageUrl={item.imageUrl} emptyLabel={item.name}>
        {item.imageUrl ? (
          <CachedImage
            sourceUrl={item.imageUrl}
            alt={item.name}
            fill
            className={getCardImageClassName(item.imageUrl, "rounded-[4.75%] object-fill")}
            sizes="(max-width: 640px) 116px, 120px"
            loading={prioritizeImage ? "eager" : undefined}
            preload={prioritizeImage}
          />
        ) : undefined}
      </CardListTileMedia>

      <CardListTileBody>
        <CardListTileHeader
          badges={
            <>
              {item.normalizedRarity ? (
                <span
                  className={`inline-flex rounded-full px-2 py-1 text-[8px] font-bold uppercase tracking-[0.08em] ${rarityBadge(
                    item.normalizedRarity
                  )}`}
                >
                  {item.normalizedRarity}
                </span>
              ) : null}
              <MoverBuySignalChip signal={item.buySignal} />
              <MoverReasonChips
                item={item}
                mode={mode}
                changeDisplay={changeDisplay}
                mobileLimit={mobileReasonLimit}
              />
            </>
          }
          priceLabel={primaryLabel}
          priceValue={primaryValue}
          title={item.name}
          meta={
            <>
              <span className="shrink-0 tabular-nums">{item.cardNumber ? `#${item.cardNumber}` : "--"}</span>
              <span className="text-white/20">·</span>
              <Link
                href={getExpansionHref(item.episodeId)}
                prefetch={false}
                onClick={stopCardOpen}
                className="truncate transition-colors hover:text-white/80"
              >
                {item.episodeName}
                {item.episodeCode ? <span className="ml-1 opacity-60">({item.episodeCode})</span> : null}
              </Link>
            </>
          }
        />

        {primaryMetric ? (
          <CardListTileInsight>
            <span
              aria-hidden="true"
              className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-300/70 shadow-[0_0_10px_rgba(196,181,253,0.42)]"
            />
            <span className="min-w-0 truncate tabular-nums">
              <strong className={`font-bold ${metricValueClass(primaryMetric.toneValue)}`}>
                {primaryMetric.label} {primaryMetric.value}
              </strong>
              {secondaryMetric ? (
                <span className="text-white/42">
                  {` · ${secondaryMetric.label} ${secondaryMetric.value}`}
                </span>
              ) : null}
              {mode === "target" && item.grading ? (
                <span className="hidden text-white/42 sm:inline">
                  {` · ${item.grading.tier === "pristine" ? "Pristine" : "Grade"} target`}
                </span>
              ) : null}
            </span>
          </CardListTileInsight>
        ) : null}

        {showGradeVariants ? (
          <div
            data-mover-grade-variants
            role="radiogroup"
            aria-label={`Grade variants for ${item.name}`}
            className="mt-1 flex min-w-0 touch-pan-x flex-nowrap gap-1 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {variants.map((variant) => {
              const variantKey = getMoverVariantKey(variant);
              const isSelected = variantKey === getMoverVariantKey(item);
              const variantValue = isTarget
                ? variant.grading?.gradedPrice ?? variant.currentPrice
                : variant.currentPrice;
              const formattedVariantValue = formatTileCurrency(
                variantValue,
                variant.currency
              );

              return (
                <button
                  key={variantKey}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  aria-label={`${variant.gradedLabel ?? "Graded"}, ${formattedVariantValue}${
                    isTarget ? `, score ${formatScoreValue(variant.moverScore)}` : ""
                  }`}
                  title={
                    isTarget
                      ? `${variant.gradedLabel ?? "Graded"}: ${formattedVariantValue} target · score ${formatScoreValue(variant.moverScore)}`
                      : `${variant.gradedLabel ?? "Graded"}: ${formattedVariantValue}`
                  }
                  onClick={(event) => {
                    event.stopPropagation();
                    setSelectedVariantKey(variantKey);
                  }}
                  onKeyDown={(event) => event.stopPropagation()}
                  className={`inline-flex min-h-11 shrink-0 items-center gap-1 rounded-lg border px-2 py-1 text-[9px] font-bold tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/55 md:min-h-8 ${
                    isSelected
                      ? "border-violet-300/45 bg-violet-400/18 text-violet-100"
                      : "border-[rgb(var(--dc-border-rgb)/0.76)] bg-[rgb(var(--dc-surface-hover-rgb)/0.48)] text-white/48 hover:border-violet-300/28 hover:text-white/78"
                  }`}
                >
                  <span className="whitespace-nowrap">{variant.gradedLabel ?? "Graded"}</span>
                  <span
                    aria-hidden="true"
                    className={`hidden sm:inline ${isSelected ? "text-white/72" : "text-white/32"}`}
                  >
                    {formattedVariantValue}
                  </span>
                </button>
              );
            })}
          </div>
        ) : null}

        <CardListTileFooter className="max-[359px]:flex-col max-[359px]:items-stretch max-[359px]:gap-1">
          <CardListTileAnalysisLink className="max-[359px]:w-full max-[359px]:justify-center">
            Analysis
            <ChevronRight className="h-3.5 w-3.5 max-[359px]:hidden" />
          </CardListTileAnalysisLink>
          <CollectionCardQuickActions
            data={getMoverQuickActionData(item, cardQuickActions)}
            gradedLabel={displayMode === "graded" ? item.gradedLabel : null}
            className="max-[359px]:self-end"
          />
        </CardListTileFooter>
      </CardListTileBody>
    </CardListTile>
  );
});

function MoverSpotlightCard({
  title,
  item,
  windowKey,
  isLoading,
  cardQuickActions,
  onOpenCard,
}: {
  title: string;
  item: CollectionMoverBrowserItem | null;
  windowKey: "7d" | "30d";
  isLoading: boolean;
  cardQuickActions: CardQuickActionMap;
  onOpenCard: (cardId: string) => void;
}) {
  const pct = windowKey === "7d" ? item?.change7dPct ?? null : item?.change30dPct ?? null;
  const delta = windowKey === "7d" ? item?.change7d ?? null : item?.change30d ?? null;
  const coveredDays =
    windowKey === "7d" ? item?.change7dCoveredDays ?? null : item?.change30dCoveredDays ?? null;
  const open = () => {
    if (item) {
      onOpenCard(item.cardId);
    }
  };

  return (
    <article
      role={item ? "button" : undefined}
      tabIndex={item ? 0 : undefined}
      onClick={item ? open : undefined}
      onKeyDown={item ? (event) => handleOpenKey(event, open) : undefined}
      className={`relative rounded-2xl border border-white/8 bg-white/[0.035] p-3.5 outline-none transition-colors ${
        item
          ? "cursor-pointer hover:border-white/14 hover:bg-white/[0.055] focus-visible:ring-2 focus-visible:ring-emerald-400/50"
          : ""
      }`}
    >
      {isLoading ? (
        <div className="absolute right-3 top-3 inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-black/80 text-white">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      ) : null}

      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/38">
        {title}
      </p>

      {item ? (
        <div className="mt-3 flex items-start gap-3">
          <div
            className={getCardImageFrameClassName(
              item.imageUrl,
              "relative h-[4.25rem] w-[3rem] shrink-0 overflow-hidden rounded-[4.75%] bg-transparent drop-shadow-[0_6px_12px_rgba(0,0,0,0.2)]"
            )}
          >
            {item.imageUrl ? (
              <CachedImage
                sourceUrl={item.imageUrl}
                alt={item.name}
                fill
                className={getCardImageClassName(item.imageUrl, "rounded-[4.75%] object-fill")}
                sizes="48px"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-xs text-white/35">
                {item.name.slice(0, 2)}
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold text-white">
              {item.name}
            </p>
            <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11px] text-white/42">
              <span className="shrink-0 tabular-nums">{item.cardNumber ? `#${item.cardNumber}` : "--"}</span>
              <span className="text-white/20">·</span>
              <Link
                href={getExpansionHref(item.episodeId)}
                prefetch={false}
                onClick={stopCardOpen}
                className="truncate transition-colors hover:text-white/80"
              >
                {item.episodeName}
                {item.episodeCode ? <span className="ml-1 opacity-60">({item.episodeCode})</span> : null}
              </Link>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {item.normalizedRarity ? (
                <span
                  className={`inline-flex rounded-md px-2 py-0.5 text-[10px] font-semibold ${rarityBadge(
                    item.normalizedRarity
                  )}`}
                >
                  {item.normalizedRarity}
                </span>
              ) : null}
              <MoverBuySignalChip signal={item.buySignal} />
              <span className="inline-flex rounded-md border border-white/8 bg-white/[0.04] px-2 py-0.5 text-[10px] font-medium text-white/50">
                {item.sourceLabel}
              </span>
              {item.gradedLabel ? (
                <span className="inline-flex rounded-md border border-white/8 bg-white/[0.04] px-2 py-0.5 text-[10px] font-medium tabular-nums text-white/50">
                  {item.gradedLabel}
                </span>
              ) : null}
            </div>
          </div>

          <div className="shrink-0 text-right">
            <p className={`text-lg font-bold leading-none tabular-nums ${getToneClass(pct)}`}>
              {formatPercent(pct)}
            </p>
            <p className="mt-1 text-xs font-medium text-white/55">
              {formatDelta(delta, item.currency)}
            </p>
            <p className="mt-1 text-[10px] uppercase tracking-[0.12em] text-white/30">
              {coveredDays != null ? `${coveredDays}d used` : "Recent"}
            </p>
          </div>
        </div>
      ) : (
        <p className="mt-3 text-sm text-white/48">
          Not enough recent history yet to show a clear winner here.
        </p>
      )}
      {item ? (
        <div className="mt-3 flex justify-end border-t border-white/7 pt-2">
          <CollectionCardQuickActions
            data={getMoverQuickActionData(item, cardQuickActions)}
            gradedLabel={item.source === "graded" ? item.gradedLabel : null}
          />
        </div>
      ) : null}
    </article>
  );
}

function PocketPreviewCard({
  title,
  eyebrow,
  description,
  items,
  href,
  hrefLabel = "Open page",
  loadingCardId,
  cardQuickActions,
  onOpenCard,
  reasonMode = "raw",
}: {
  title: string;
  eyebrow: string;
  description: string;
  items: CollectionMoverBrowserItem[];
  href: string;
  hrefLabel?: string;
  loadingCardId: string | null;
  cardQuickActions: CardQuickActionMap;
  onOpenCard: (cardId: string) => void;
  reasonMode?: MoverDisplayMode;
}) {
  return (
    <article
      data-market-pocket-preview={title}
      className="rounded-2xl border border-[rgb(var(--dc-border-rgb)/0.88)] bg-[rgb(var(--dc-surface-primary-rgb)/0.72)] p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--dc-text-muted)]">
            {eyebrow}
          </p>
          <h2 className="mt-1 text-lg font-bold tracking-tight text-[var(--dc-text-primary)]">
            {title}
          </h2>
          <p className="mt-1.5 max-w-2xl text-[13px] leading-snug text-[var(--dc-text-muted)]">{description}</p>
        </div>

        <div className="shrink-0 text-right">
          <p className="text-2xl font-bold tracking-tight tabular-nums text-[var(--dc-text-primary)]">
            {items.length.toLocaleString("en-US")}
          </p>
          <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--dc-text-disabled)]">
            cards
          </p>
        </div>
      </div>

      <CardListTileGrid className="mt-3">
        {items.slice(0, 4).map((item, index) => (
          <MoverTile
            key={`${href}-${item.cardId}`}
            variants={[item]}
            isLoading={loadingCardId === item.cardId}
            displayMode={reasonMode}
            isHighlighted={false}
            changeDisplay="percent"
            cardQuickActions={cardQuickActions}
            prioritizeImage={index === 0}
            onOpen={onOpenCard}
          />
        ))}
      </CardListTileGrid>

      <div className="mt-4">
        <Link
          href={href}
          prefetch={false}
          className="inline-flex min-h-11 items-center rounded-full border border-[rgb(var(--dc-border-rgb)/0.9)] bg-[rgb(var(--dc-surface-elevated-rgb)/0.66)] px-3 text-xs font-semibold text-[var(--dc-text-secondary)] transition-colors hover:border-[rgb(var(--dc-border-hover-rgb)/0.95)] hover:bg-[rgb(var(--dc-surface-hover-rgb)/0.78)] hover:text-[var(--dc-text-primary)]"
        >
          {hrefLabel}
        </Link>
      </div>
    </article>
  );
}

export function MoverSpotlightSections({
  spotlights,
  previewCards,
  loadingCardId,
  cardQuickActions,
  onOpenCard,
}: {
  spotlights: SpotlightConfig[];
  previewCards: PreviewCardConfig[];
  loadingCardId: string | null;
  cardQuickActions: CardQuickActionMap;
  onOpenCard: (cardId: string) => void;
}) {
  return (
    <>
      {spotlights.length > 0 ? (
        <section className="grid gap-4 lg:grid-cols-2">
          {spotlights.map((spotlight) => (
            <MoverSpotlightCard
              key={`${spotlight.title}-${spotlight.item?.cardId ?? "none"}`}
              title={spotlight.title}
              item={spotlight.item}
              windowKey={spotlight.windowKey}
              isLoading={loadingCardId === spotlight.item?.cardId}
              cardQuickActions={cardQuickActions}
              onOpenCard={onOpenCard}
            />
          ))}
        </section>
      ) : null}

      {previewCards.length > 0 ? (
        <section className="grid gap-4 xl:grid-cols-2">
          {previewCards.map((card) => (
            <PocketPreviewCard
              key={card.href}
              eyebrow={card.eyebrow}
              title={card.title}
              description={card.description}
              items={card.items}
              href={card.href}
              hrefLabel={card.hrefLabel}
              loadingCardId={loadingCardId}
              cardQuickActions={cardQuickActions}
              onOpenCard={onOpenCard}
              reasonMode={card.reasonMode ?? "raw"}
            />
          ))}
        </section>
      ) : null}
    </>
  );
}

export function MoverGrid({
  moverGroups,
  loadingCardId,
  cardQuickActions,
  displayMode,
  highlightedCardId,
  metricWindowLabel,
  changeDisplay = "percent",
  onOpenCard,
}: {
  moverGroups: ReadonlyArray<{
    cardId: string;
    variants: CollectionMoverBrowserItem[];
  }>;
  loadingCardId: string | null;
  cardQuickActions: CardQuickActionMap;
  displayMode: MoverDisplayMode;
  highlightedCardId?: string | null;
  metricWindowLabel?: string;
  changeDisplay?: MoverChangeDisplay;
  onOpenCard: (cardId: string) => void;
}) {
  return (
    <CardListTileGrid>
      {moverGroups.map((group, index) => (
        <MoverTile
          key={`${group.cardId}:${group.variants.map(getMoverVariantKey).join("|")}`}
          variants={group.variants}
          isLoading={loadingCardId === group.cardId}
          displayMode={displayMode}
          isHighlighted={group.cardId === highlightedCardId}
          metricWindowLabel={metricWindowLabel}
          changeDisplay={changeDisplay}
          cardQuickActions={cardQuickActions}
          prioritizeImage={index === 0}
          onOpen={onOpenCard}
        />
      ))}
    </CardListTileGrid>
  );
}
