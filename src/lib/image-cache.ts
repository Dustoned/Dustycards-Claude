export const CACHEABLE_IMAGE_HOSTS = new Set([
  "assets.tcgdex.net",
  "images.tcggo.com",
  "pokemoncardimages.pokedata.io",
  "product-images.tcgplayer.com",
  "www.cardmarket.com",
  "static.cardmarket.com",
  "img.cardmarket.com",
  "images.cardmarket.com",
  "product-images.cardmarket.com",
  "product-images.s3.cardmarket.com",
]);

export const TCGGO_CARD_TRANSPARENT_TRIM_VARIANT = "tcggo-card-transparent-trim-v1";

export type ImageCacheVariant = typeof TCGGO_CARD_TRANSPARENT_TRIM_VARIANT;

export function isTcggoStorageImageUrl(value: string | URL | null | undefined): boolean {
  if (!value) return false;

  try {
    const url = typeof value === "string" ? new URL(value) : value;
    return (
      url.hostname === "images.tcggo.com" &&
      url.pathname.startsWith("/tcggo/storage/") &&
      /\.(?:webp|png|jpe?g)$/i.test(url.pathname)
    );
  } catch {
    return false;
  }
}

export function getImageCacheVariantForSourceUrl(
  value: string | URL | null | undefined
): ImageCacheVariant | null {
  return isTcggoStorageImageUrl(value) ? TCGGO_CARD_TRANSPARENT_TRIM_VARIANT : null;
}

export function isCacheableRemoteImageUrl(value: string | null | undefined): value is string {
  if (!value) return false;

  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && CACHEABLE_IMAGE_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

export function getCachedImageUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!isCacheableRemoteImageUrl(value)) return value;

  const variant = getImageCacheVariantForSourceUrl(value);
  const variantParam = variant ? `&variant=${encodeURIComponent(variant)}` : "";
  return `/api/image-cache?url=${encodeURIComponent(value)}${variantParam}`;
}
