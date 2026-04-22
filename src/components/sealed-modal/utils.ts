import type { ModalSize } from "@/components/SettingsProvider";
import type { SealedDetailResponse, SealedModalProductData } from "./types";

const EUR_FORMATTER = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const NL_TIMESTAMP_FORMATTER = new Intl.DateTimeFormat("nl-NL", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatCurrency(value: number | null | undefined): string {
  if (value == null) return "--";

  return EUR_FORMATTER.format(value);
}

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
    cardmarket_id: null,
    price_fetched_at: null,
    history_synced_at: null,
    price_history: [],
  };
}

export function getSealedModalLayoutClasses(size: ModalSize, widescreen: boolean) {
  const mediaWidth =
    size === "small"
      ? widescreen
        ? "w-[12rem] sm:w-[13rem] xl:w-[14rem]"
        : "w-32 sm:w-40 xl:w-44"
      : size === "large"
        ? widescreen
          ? "w-[22rem] sm:w-[25rem] xl:w-[28rem]"
          : "w-72 sm:w-80 xl:w-[22rem]"
        : widescreen
          ? "w-[15rem] sm:w-[16.5rem] xl:w-[18rem]"
          : "w-40 sm:w-48 xl:w-[15rem]";
  const imageSize =
    size === "small"
      ? widescreen
        ? "216px"
        : "160px"
      : size === "large"
        ? widescreen
          ? "520px"
          : "416px"
        : widescreen
          ? "288px"
          : "224px";
  const maxW =
    size === "small"
      ? widescreen
        ? "max-w-[50rem]"
        : "max-w-[42rem]"
      : size === "large"
        ? widescreen
          ? "max-w-[98rem]"
          : "max-w-[84rem]"
        : widescreen
          ? "max-w-[64rem]"
          : "max-w-[54rem]";
  const pad =
    size === "small"
      ? "p-2.5 sm:p-3"
      : size === "large"
        ? "p-6 sm:p-7 xl:p-8"
        : "p-3 sm:p-4";
  const gridGap =
    size === "small"
      ? "gap-2.5 sm:gap-3"
      : size === "large"
        ? "gap-6 sm:gap-8 xl:gap-10"
        : "gap-3 sm:gap-4";
  const titleClass =
    size === "small"
      ? "text-[1.25rem] sm:text-[1.4rem]"
      : size === "large"
        ? "text-[2.4rem] sm:text-[2.8rem] xl:text-[3.05rem]"
        : "text-[1.62rem] sm:text-[1.82rem]";
  const metaClassName =
    size === "small"
      ? "text-[12px]"
      : size === "large"
        ? "text-base sm:text-[17px]"
        : "text-[13px]";
  const imagePadding =
    size === "small" ? "p-2" : size === "large" ? "p-5 sm:p-6" : "p-2.5 sm:p-3";
  const footerPad =
    size === "small"
      ? "px-2.5 pb-2.5 sm:px-3 sm:pb-3"
      : size === "large"
        ? "px-6 pb-6 sm:px-7 sm:pb-7 xl:px-8 xl:pb-8"
        : "px-3 pb-3 sm:px-4 sm:pb-4";
  const footerGridClass = `grid gap-3 ${footerPad} sm:grid-cols-2 xl:grid-cols-3`;

  return {
    footerGridClass,
    gridGap,
    imagePadding,
    imageSize,
    maxW,
    mediaWidth,
    metaClassName,
    pad,
    titleClass,
  };
}
