const TCGGO_IMAGE_CLASS = "object-contain z-10";

export function hasTcggoGeneratedCardBorder(imageUrl: string | null | undefined): boolean {
  if (!imageUrl) return false;

  try {
    const url = new URL(imageUrl);
    return (
      url.hostname === "images.tcggo.com" &&
      url.pathname.startsWith("/tcggo/storage/") &&
      /\.(?:webp|png|jpe?g)$/i.test(url.pathname)
    );
  } catch {
    return false;
  }
}

export function getCardImageClassName(
  imageUrl: string | null | undefined,
  baseClassName: string
): string {
  if (!hasTcggoGeneratedCardBorder(imageUrl)) {
    return baseClassName;
  }

  return baseClassName
    .replace(/\brounded-\[4\.75%\]\s*/g, "")
    .replace(/\bobject-fill\b/g, TCGGO_IMAGE_CLASS)
    .trim();
}

export function getCardImageFrameClassName(
  imageUrl: string | null | undefined,
  baseClassName: string
): string {
  if (!hasTcggoGeneratedCardBorder(imageUrl)) {
    return baseClassName;
  }

  return baseClassName
    .replace(/\boverflow-hidden\b\s*/g, "")
    .replace(/\brounded-(?:\[[^\]]+\]|[^\s]+)\s*/g, "")
    .trim();
}
