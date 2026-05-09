import type { ModalSize } from "@/components/SettingsProvider";
import { getDetailModalScale } from "@/lib/display-scale";
import { formatCurrency } from "@/lib/format";
import type { SealedDetailResponse, SealedModalProductData } from "./types";

export { formatCurrency };

const NL_TIMESTAMP_FORMATTER = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatTimestamp(value: string | null | undefined): string | null {
  if (!value) return null;

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return NL_TIMESTAMP_FORMATTER.format(parsed);
}

export function buildInitialSealedDetail(
  product: SealedModalProductData
): SealedDetailResponse {
  return {
    ...product,
    tcggo_url: product.tcggo_url ?? null,
    cardmarket_id: product.cardmarket_id ?? null,
    price_fetched_at: null,
    history_synced_at: null,
    price_history: [],
  };
}

export function getSealedModalLayoutClasses(size: ModalSize, widescreen: boolean) {
  const scale = getDetailModalScale(size, widescreen);
  const imagePadding =
    size === "small" ? "p-2" : size === "large" ? "p-5 sm:p-6" : "p-2.5 sm:p-3";
  const detailStatClass =
    size === "small"
      ? "rounded-[16px] border border-white/8 bg-black/18 px-3 py-2.5 backdrop-blur-sm"
      : size === "large"
        ? "rounded-[22px] border border-white/8 bg-black/18 px-5 py-4 backdrop-blur-sm"
        : "rounded-[19px] border border-white/8 bg-black/18 px-4 py-3 backdrop-blur-sm";
  const footerGridClass = `grid gap-3 border-t border-white/8 bg-black/12 ${scale.footerPad} pt-3 sm:pt-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]`;

  return {
    detailStatClass,
    footerGridClass,
    gridGap: scale.gridGap,
    imagePadding,
    imageSize: scale.imageSize,
    maxW: scale.maxW,
    mediaWidth: scale.mediaWidth,
    metaClassName: scale.metaClassName,
    pad: scale.pad,
    titleClass: scale.titleClass,
  };
}
