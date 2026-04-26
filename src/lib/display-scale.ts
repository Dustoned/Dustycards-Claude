import type { CardSize, ModalSize, UiScale } from "@/lib/user-settings";

type DisplayMode = "normal" | "wide";

type TrackScale = Record<CardSize, Record<DisplayMode, number>>;

const CARD_GRID_TRACK: TrackScale = {
  small: { normal: 112, wide: 136 },
  medium: { normal: 176, wide: 226 },
  large: { normal: 280, wide: 360 },
};

const SUPPORT_TILE_TRACK: TrackScale = {
  small: { normal: 150, wide: 170 },
  medium: { normal: 230, wide: 270 },
  large: { normal: 360, wide: 440 },
};

const SEALED_PRODUCT_TRACK: TrackScale = {
  small: { normal: 160, wide: 190 },
  medium: { normal: 260, wide: 310 },
  large: { normal: 380, wide: 460 },
};

const RICH_MOVER_TRACK: TrackScale = {
  small: { normal: 280, wide: 320 },
  medium: { normal: 360, wide: 420 },
  large: { normal: 500, wide: 580 },
};

const DETAIL_MODAL_MEDIA: Record<ModalSize, { imagePx: number; mediaWidth: string }> = {
  small: { imagePx: 168, mediaWidth: "w-[10.5rem]" },
  medium: { imagePx: 264, mediaWidth: "w-[16.5rem]" },
  large: { imagePx: 420, mediaWidth: "w-[26.25rem]" },
};

function displayMode(widescreen: boolean): DisplayMode {
  return widescreen ? "wide" : "normal";
}

function px(value: number): string {
  return `${value}px`;
}

export function getCardGridTrackWidth(cardSize: CardSize, widescreen: boolean): string {
  return px(CARD_GRID_TRACK[cardSize][displayMode(widescreen)]);
}

export function getSupportTileTrackWidth(cardSize: CardSize, widescreen: boolean): string {
  return px(SUPPORT_TILE_TRACK[cardSize][displayMode(widescreen)]);
}

export function getSealedProductTrackWidth(cardSize: CardSize, widescreen: boolean): string {
  return px(SEALED_PRODUCT_TRACK[cardSize][displayMode(widescreen)]);
}

export function getRichMoverTrackWidth(cardSize: CardSize, widescreen: boolean): string {
  return px(RICH_MOVER_TRACK[cardSize][displayMode(widescreen)]);
}

export function getFixedTrackGridTemplate(trackWidth: string): string {
  return `repeat(auto-fill, minmax(min(100%, ${trackWidth}), ${trackWidth}))`;
}

export function getExpansionTileScale(uiScale: UiScale, widescreen: boolean) {
  const minWidth = getSupportTileTrackWidth(uiScale, widescreen);

  if (uiScale === "small") {
    return {
      minWidth,
      tileClass: "rounded-2xl p-3 gap-2.5",
      logoHeightClass: "h-12",
      fallbackHeightClass: "h-12",
      titleClass: "text-xs",
      metaClass: "text-xs",
    };
  }

  if (uiScale === "large") {
    return {
      minWidth,
      tileClass: "rounded-[24px] p-6 gap-5",
      logoHeightClass: "h-24",
      fallbackHeightClass: "h-24",
      titleClass: "text-base",
      metaClass: "text-sm",
    };
  }

  return {
    minWidth,
    tileClass: "rounded-2xl p-3.5 gap-3",
    logoHeightClass: "h-14",
    fallbackHeightClass: "h-14",
    titleClass: "text-xs",
    metaClass: "text-xs",
  };
}

export function getIllustratorTileScale(uiScale: UiScale, widescreen: boolean) {
  const minWidth = getSupportTileTrackWidth(uiScale, widescreen);

  if (uiScale === "small") {
    return {
      minWidth,
      tileClass: "rounded-2xl p-3 gap-3",
      imageWrapClass: "aspect-[63/88]",
      titleClass: "text-sm",
      metaClass: "text-xs",
    };
  }

  if (uiScale === "large") {
    return {
      minWidth,
      tileClass: "rounded-[24px] p-6 gap-5",
      imageWrapClass: "aspect-[63/88]",
      titleClass: "text-lg",
      metaClass: "text-sm",
    };
  }

  return {
    minWidth,
    tileClass: "rounded-2xl p-4 gap-3.5",
    imageWrapClass: "aspect-[63/88]",
    titleClass: "text-sm",
    metaClass: "text-xs",
  };
}

export function getSearchLogoHeightClass(uiScale: UiScale): string {
  if (uiScale === "small") return "h-12";
  if (uiScale === "large") return "h-24";
  return "h-14";
}

export function getDetailModalScale(size: ModalSize, widescreen: boolean) {
  const media = DETAIL_MODAL_MEDIA[size];
  const imageSize = px(media.imagePx);

  if (size === "small") {
    return {
      footerPad: "px-2.5 pb-2.5 sm:px-3 sm:pb-3",
      gridGap: "gap-2.5 sm:gap-3",
      imageSize,
      maxW: widescreen ? "max-w-[50rem]" : "max-w-[44rem]",
      mediaWidth: media.mediaWidth,
      metaClassName: "text-[12px]",
      pad: "p-2.5 sm:p-3",
      titleClass: "text-[1.25rem] sm:text-[1.4rem]",
    };
  }

  if (size === "large") {
    return {
      footerPad: "px-4 pb-4 sm:px-5 sm:pb-5 xl:px-6 xl:pb-6",
      gridGap: "gap-5 sm:gap-6 xl:gap-8",
      imageSize,
      maxW: widescreen ? "max-w-[96rem]" : "max-w-[88rem]",
      mediaWidth: media.mediaWidth,
      metaClassName: "text-[15px] sm:text-base",
      pad: "p-5 sm:p-6 xl:p-8",
      titleClass: "text-[2.15rem] sm:text-[2.5rem] xl:text-[2.85rem]",
    };
  }

  return {
    footerPad: "px-3 pb-3 sm:px-4 sm:pb-4",
    gridGap: "gap-3 sm:gap-4",
    imageSize,
    maxW: widescreen ? "max-w-[72rem]" : "max-w-[62rem]",
    mediaWidth: media.mediaWidth,
    metaClassName: "text-[13px]",
    pad: "p-3 sm:p-4",
    titleClass: "text-[1.55rem] sm:text-[1.75rem]",
  };
}
