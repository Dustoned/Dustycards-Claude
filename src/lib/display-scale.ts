import type { CardSize, ModalSize, UiScale } from "@/lib/user-settings";

type DisplayMode = "normal" | "wide";

type TrackScale = Record<CardSize, Record<DisplayMode, number>>;

const CARD_GRID_TRACK: TrackScale = {
  small: { normal: 160, wide: 192 },
  medium: { normal: 220, wide: 280 },
  large: { normal: 340, wide: 430 },
};

const SUPPORT_TILE_TRACK: TrackScale = {
  small: { normal: 200, wide: 230 },
  medium: { normal: 285, wide: 340 },
  large: { normal: 430, wide: 520 },
};

const SEALED_PRODUCT_TRACK: TrackScale = {
  small: { normal: 220, wide: 250 },
  medium: { normal: 320, wide: 380 },
  large: { normal: 470, wide: 560 },
};

const RICH_MOVER_TRACK: TrackScale = {
  small: { normal: 360, wide: 420 },
  medium: { normal: 460, wide: 540 },
  large: { normal: 620, wide: 720 },
};

const DETAIL_MODAL_MEDIA: Record<ModalSize, { imagePx: number; mediaWidth: string }> = {
  small: { imagePx: 224, mediaWidth: "14rem" },
  medium: { imagePx: 320, mediaWidth: "20rem" },
  large: { imagePx: 448, mediaWidth: "28rem" },
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
      logoHeightClass: "h-14",
      fallbackHeightClass: "h-14",
      titleClass: "text-xs",
      metaClass: "text-xs",
      valueClass: "text-sm",
      progressHeightClass: "h-1",
    };
  }

  if (uiScale === "large") {
    return {
      minWidth,
      tileClass: "rounded-[24px] p-6 gap-5",
      logoHeightClass: "h-28",
      fallbackHeightClass: "h-28",
      titleClass: "text-lg",
      metaClass: "text-sm",
      valueClass: "text-xl",
      progressHeightClass: "h-2",
    };
  }

  return {
    minWidth,
    tileClass: "rounded-2xl p-3.5 gap-3",
    logoHeightClass: "h-[4.5rem]",
    fallbackHeightClass: "h-[4.5rem]",
    titleClass: "text-sm",
    metaClass: "text-xs",
    valueClass: "text-base",
    progressHeightClass: "h-1.5",
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
      footerPad: "px-3 pb-3 sm:px-4 sm:pb-4",
      gridGap: "gap-3 sm:gap-4",
      imageSize,
      maxW: widescreen ? "66rem" : "62rem",
      mediaWidth: media.mediaWidth,
      metaClassName: "text-[13px]",
      pad: "p-3 sm:p-4",
      titleClass: "text-[1.55rem] sm:text-[1.75rem]",
    };
  }

  if (size === "large") {
    return {
      footerPad: "px-6 pb-6 sm:px-7 sm:pb-7 xl:px-8 xl:pb-8",
      gridGap: "gap-7 sm:gap-8",
      imageSize,
      maxW: widescreen ? "112rem" : "104rem",
      mediaWidth: media.mediaWidth,
      metaClassName: "text-[17px] sm:text-lg",
      pad: "p-7 sm:p-8",
      titleClass: "text-[2.75rem] sm:text-[3.1rem]",
    };
  }

  return {
    footerPad: "px-5 pb-5 sm:px-6 sm:pb-6",
    gridGap: "gap-5 sm:gap-6",
    imageSize,
    maxW: widescreen ? "88rem" : "82rem",
    mediaWidth: media.mediaWidth,
    metaClassName: "text-[15px] sm:text-base",
    pad: "p-5 sm:p-6",
    titleClass: "text-[2.1rem] sm:text-[2.4rem]",
  };
}
