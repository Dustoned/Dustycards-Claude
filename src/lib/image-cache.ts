export const CACHEABLE_IMAGE_HOSTS = new Set(["assets.tcgdex.net", "images.tcggo.com"]);

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

  return `/api/image-cache?url=${encodeURIComponent(value)}`;
}
