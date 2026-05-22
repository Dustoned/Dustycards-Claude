const TCGGO_BORDERED_CARD_SCALE_CLASS = "scale-[1.075]";

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
  return hasTcggoGeneratedCardBorder(imageUrl)
    ? `${baseClassName} ${TCGGO_BORDERED_CARD_SCALE_CLASS}`
    : baseClassName;
}
