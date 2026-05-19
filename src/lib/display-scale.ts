import type { CardSize, ModalSize, UiScale } from "@/lib/user-settings";

type DisplayMode = "normal" | "wide";

type TrackScale = Record<UiScale, Record<DisplayMode, number>>;
type CardTrackScale = Record<CardSize, Record<DisplayMode, number>>;

const CARD_GRID_TRACK: CardTrackScale = {
  xsmall: { normal: 110, wide: 122 },
  small: { normal: 128, wide: 144 },
  medium: { normal: 154, wide: 176 },
  large: { normal: 188, wide: 212 },
};

const MOBILE_CARD_GRID_COLUMNS: Record<CardSize, number> = {
  xsmall: 4,
  small: 3,
  medium: 2,
  large: 1,
};

const SUPPORT_TILE_TRACK: TrackScale = {
  small: { normal: 200, wide: 230 },
  medium: { normal: 285, wide: 340 },
  large: { normal: 430, wide: 520 },
};

const SEALED_PRODUCT_TRACK: TrackScale = {
  small: { normal: 210, wide: 230 },
  medium: { normal: 260, wide: 300 },
  large: { normal: 330, wide: 380 },
};

const MOBILE_SEALED_PRODUCT_COLUMNS = 2;

const RICH_MOVER_TRACK: TrackScale = {
  small: { normal: 360, wide: 420 },
  medium: { normal: 460, wide: 540 },
  large: { normal: 620, wide: 720 },
};

const DETAIL_MODAL_MEDIA: Record<ModalSize, { imagePx: number; mediaWidth: string }> = {
  small: { imagePx: 280, mediaWidth: "17.5rem" },
  medium: { imagePx: 360, mediaWidth: "22.5rem" },
  large: { imagePx: 460, mediaWidth: "28.75rem" },
};

function displayMode(widescreen: boolean): DisplayMode {
  return widescreen ? "wide" : "normal";
}

function px(value: number): string {
  return `${value}px`;
}

function getSharedTrackSize(cardSize: CardSize): UiScale {
  return cardSize === "xsmall" ? "small" : cardSize;
}

function responsiveTwoColumnTrack(value: number, min = 150): string {
  return `clamp(${min}px, calc((100vw - 3rem) / 2), ${value}px)`;
}

export function getCardGridTrackWidth(cardSize: CardSize, widescreen: boolean): string {
  return px(CARD_GRID_TRACK[cardSize][displayMode(widescreen)]);
}

export function getCardGridColumnCount(cardSize: CardSize, isMobileViewport: boolean): number {
  return isMobileViewport ? MOBILE_CARD_GRID_COLUMNS[cardSize] : 0;
}

export function getCardGridTemplateColumns(
  cardSize: CardSize,
  widescreen: boolean,
  isMobileViewport: boolean
): string {
  if (isMobileViewport) {
    return `repeat(${MOBILE_CARD_GRID_COLUMNS[cardSize]}, minmax(0, 1fr))`;
  }

  const trackWidth = getCardGridTrackWidth(cardSize, widescreen);
  return `repeat(auto-fill, minmax(min(100%, ${trackWidth}), ${trackWidth}))`;
}

export function getCardGridImageSizes(
  cardSize: CardSize,
  widescreen: boolean,
  isMobileViewport: boolean
): string {
  if (!isMobileViewport) {
    return getCardGridTrackWidth(cardSize, widescreen);
  }

  const columns = MOBILE_CARD_GRID_COLUMNS[cardSize];
  if (columns === 1) return "calc(100vw - 2rem)";
  if (columns === 2) return "calc((100vw - 2.75rem) / 2)";
  if (columns === 4) return "calc((100vw - 3.25rem) / 4)";
  return "calc((100vw - 3rem) / 3)";
}

export function getSupportTileTrackWidth(cardSize: CardSize, widescreen: boolean): string {
  return responsiveTwoColumnTrack(
    SUPPORT_TILE_TRACK[getSharedTrackSize(cardSize)][displayMode(widescreen)]
  );
}

export function getSealedProductTrackWidth(cardSize: CardSize, widescreen: boolean): string {
  return px(SEALED_PRODUCT_TRACK[getSharedTrackSize(cardSize)][displayMode(widescreen)]);
}

export function getSealedProductGridTemplateColumns(
  cardSize: CardSize,
  widescreen: boolean,
  isMobileViewport: boolean
): string {
  if (isMobileViewport) {
    return `repeat(${MOBILE_SEALED_PRODUCT_COLUMNS}, minmax(0, 1fr))`;
  }

  const trackWidth = getSealedProductTrackWidth(cardSize, widescreen);
  return `repeat(auto-fill, minmax(min(100%, ${trackWidth}), ${trackWidth}))`;
}

export function getSealedProductImageSizes(
  cardSize: CardSize,
  widescreen: boolean,
  isMobileViewport: boolean
): string {
  if (isMobileViewport) {
    return "calc((100vw - 2.75rem) / 2)";
  }

  return getSealedProductTrackWidth(cardSize, widescreen);
}

export function getRichMoverTrackWidth(cardSize: CardSize, widescreen: boolean): string {
  return px(RICH_MOVER_TRACK[getSharedTrackSize(cardSize)][displayMode(widescreen)]);
}

export function getFixedTrackGridTemplate(trackWidth: string): string {
  return `repeat(auto-fill, minmax(min(100%, ${trackWidth}), 1fr))`;
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
      maxW: widescreen ? "100rem" : "86rem",
      mediaWidth: media.mediaWidth,
      metaClassName: "text-[13px]",
      pad: "p-3 sm:p-4",
      titleClass: "text-[1.45rem] sm:text-[2rem]",
    };
  }

  if (size === "large") {
    return {
      footerPad: "px-6 pb-6 sm:px-7 sm:pb-7 xl:px-8 xl:pb-8",
      gridGap: "gap-7 sm:gap-8",
      imageSize,
      maxW: widescreen ? "124rem" : "104rem",
      mediaWidth: media.mediaWidth,
      metaClassName: "text-[17px] sm:text-lg",
      pad: "p-4 sm:p-8",
      titleClass: "text-[1.95rem] sm:text-[3.1rem]",
    };
  }

  return {
    footerPad: "px-5 pb-5 sm:px-6 sm:pb-6",
      gridGap: "gap-5 sm:gap-6",
      imageSize,
    maxW: widescreen ? "112rem" : "94rem",
    mediaWidth: media.mediaWidth,
    metaClassName: "text-[15px] sm:text-base",
    pad: "p-4 sm:p-6",
    titleClass: "text-[1.75rem] sm:text-[2.4rem]",
  };
}
