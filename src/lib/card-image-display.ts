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
  _imageUrl: string | null | undefined,
  baseClassName: string
): string {
  return baseClassName;
}
