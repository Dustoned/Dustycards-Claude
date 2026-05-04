import type { ModalSize } from "@/components/SettingsProvider";
import { getDetailModalScale } from "@/lib/display-scale";
import { formatCurrency } from "@/lib/format";
import { rarityBadge } from "@/lib/rarity-styles";

export { formatCurrency, rarityBadge };

function normalizeGradePickerValue(value: string | null | undefined): string {
  return value?.toUpperCase().replace(/\s+/g, " ").trim() ?? "";
}

function normalizeGradeMatcherValue(value: string): string {
  return normalizeGradePickerValue(value)
    .replace(/[^A-Z0-9.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isPsa10Label(label: string): boolean {
  return /^PSA\s*10(?:\.0+)?(?:$|\s)/.test(normalizeGradeMatcherValue(label));
}

function isPsaLabel(label: string): boolean {
  return /^PSA(?:$|\s|\d)/.test(normalizeGradeMatcherValue(label));
}

export function getPreferredGradedLabel(
  prices: Array<{ label: string; price: number }>
): string | null {
  if (prices.length === 0) return null;

  const psa10Price = prices.find((price) => isPsa10Label(price.label));
  if (psa10Price) return psa10Price.label;

  const psaPrice = prices.find((price) => isPsaLabel(price.label));
  if (psaPrice) return psaPrice.label;

  return prices[0]?.label ?? null;
}

export function getCardModalLayoutClasses(
  size: ModalSize,
  widescreen: boolean,
  hasCollectionItem: boolean
) {
  const scale = getDetailModalScale(size, widescreen);
  const detailStatClass =
    size === "small"
      ? "rounded-[16px] border border-white/8 bg-black/18 px-3 py-2.5 backdrop-blur-sm"
      : size === "large"
        ? "rounded-[22px] border border-white/8 bg-black/18 px-5 py-4 backdrop-blur-sm"
        : "rounded-[19px] border border-white/8 bg-black/18 px-4 py-3 backdrop-blur-sm";
  const footerGridClass = hasCollectionItem
    ? `grid gap-3 ${scale.footerPad} sm:grid-cols-2 xl:grid-cols-3`
    : `grid gap-3 ${scale.footerPad} sm:grid-cols-2`;

  return {
    detailStatClass,
    footerGridClass,
    gridGap: scale.gridGap,
    imageSize: scale.imageSize,
    maxW: scale.maxW,
    mediaWidth: scale.mediaWidth,
    metaClassName: scale.metaClassName,
    pad: scale.pad,
    titleClass: scale.titleClass,
  };
}
