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
  "www.pokebeach.com",
  "www.pokemon.com",
  "mcdn.pokemon.com",
  "icv2.com",
  "billsarchive.com",
  "bills-archive.nyc3.cdn.digitaloceanspaces.com",
]);

// These hosts are already optimized card-image CDNs. Sending them through the
// application server makes a first visit slower and adds no visual processing.
export const DIRECT_BROWSER_IMAGE_HOSTS = new Set([
  "assets.tcgdex.net",
  "pokemoncardimages.pokedata.io",
  "product-images.tcgplayer.com",
]);

export const TCGGO_CARD_TRANSPARENT_TRIM_VARIANT = "tcggo-card-transparent-trim-v3";

// Keep the number of generated files bounded while still covering the image
// sizes used by card grids. The browser picks one candidate from the srcset;
// detail and WebGL views deliberately keep using the original image.
export const RESPONSIVE_IMAGE_WIDTHS = [
  64,
  96,
  128,
  160,
  192,
  256,
  320,
  384,
  512,
  640,
  768,
  1024,
] as const;

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
    return url.protocol === "https:" && CACHEABLE_IMAGE_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

export function getCachedImageUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!isCacheableRemoteImageUrl(value)) return value;

  const sourceUrl = new URL(value);
  if (DIRECT_BROWSER_IMAGE_HOSTS.has(sourceUrl.hostname)) return value;

  return getProxiedImageUrl(value);
}

export function normalizeResponsiveImageWidth(
  value: number | string | null | undefined
): number | null {
  if (value === null || value === undefined || value === "") return null;

  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;

  const requested = Math.ceil(parsed);
  return (
    RESPONSIVE_IMAGE_WIDTHS.find((candidate) => candidate >= requested) ??
    RESPONSIVE_IMAGE_WIDTHS[RESPONSIVE_IMAGE_WIDTHS.length - 1]
  );
}

/**
 * Returns a same-origin, width-aware URL for cacheable remote artwork. This is
 * used by next/image's custom loader, so list/grid images no longer download
 * the full source file. Callers that need original pixels keep using
 * `getCachedImageUrl` or `getTextureImageUrl`.
 */
export function getResponsiveCachedImageUrl(
  value: string | null | undefined,
  width: number | string | null | undefined
): string | null {
  if (!value) return null;
  if (!isCacheableRemoteImageUrl(value)) return value;

  const normalizedWidth = normalizeResponsiveImageWidth(width);
  if (!normalizedWidth) return getCachedImageUrl(value);

  return getProxiedImageUrl(value, normalizedWidth);
}

function getProxiedImageUrl(value: string, width: number | null = null): string {
  const variant = getImageCacheVariantForSourceUrl(value);
  const variantParam = variant ? `&variant=${encodeURIComponent(variant)}` : "";
  const widthParam = width ? `&width=${width}` : "";
  return `/api/image-cache?url=${encodeURIComponent(value)}${variantParam}${widthParam}`;
}

/**
 * WebGL textures require CORS-safe image bytes. Even optimized CDNs that are
 * safe for a normal <img> can omit the headers needed by Three.js, so texture
 * sources always use the same-origin image cache when the host is supported.
 */
export function getTextureImageUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!isCacheableRemoteImageUrl(value)) return value;

  return getProxiedImageUrl(value);
}
