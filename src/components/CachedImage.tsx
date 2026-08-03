"use client";

import Image, { type ImageLoaderProps, type ImageProps } from "next/image";
import { useMemo, useState } from "react";
import {
  getCachedImageUrl,
  getResponsiveCachedImageUrl,
  isCacheableRemoteImageUrl,
} from "@/lib/image-cache";

type CachedImageProps = Omit<ImageProps, "src" | "onLoad" | "onError"> & {
  sourceUrl: string;
  alt: string;
};

function responsiveImageLoader({ src, width }: ImageLoaderProps): string {
  return getResponsiveCachedImageUrl(src, width) ?? src;
}

export default function CachedImage({
  sourceUrl,
  alt,
  ...props
}: CachedImageProps) {
  const preferredUrl = useMemo(() => getCachedImageUrl(sourceUrl) ?? sourceUrl, [sourceUrl]);

  return (
    <CachedImageInner
      key={preferredUrl}
      {...props}
      sourceUrl={sourceUrl}
      preferredUrl={preferredUrl}
      alt={alt}
    />
  );
}

function CachedImageInner({
  sourceUrl,
  preferredUrl,
  alt,
  className = "",
  style,
  unoptimized = false,
  onContextMenu,
  ...props
}: Omit<CachedImageProps, "sourceUrl"> & { sourceUrl: string; preferredUrl: string }) {
  const [fallbackToSource, setFallbackToSource] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const useResponsiveDelivery =
    !unoptimized && !fallbackToSource && isCacheableRemoteImageUrl(sourceUrl);
  const activeUrl = fallbackToSource ? sourceUrl : preferredUrl;

  return (
    <>
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit] transition-opacity duration-200 ${
          loaded ? "opacity-0" : "opacity-100"
        }`}
      >
        <span className="absolute inset-0 animate-pulse bg-[linear-gradient(110deg,rgba(255,255,255,0.025),rgba(124,92,255,0.10),rgba(255,255,255,0.025))]" />
      </span>
      {!failed ? (
        <Image
          {...props}
          src={useResponsiveDelivery ? sourceUrl : activeUrl}
          alt={alt}
          className={`dc-protected-image ${className} transition-opacity duration-200`}
          style={{ ...style, opacity: loaded ? style?.opacity : 0 }}
          loader={useResponsiveDelivery ? responsiveImageLoader : undefined}
          unoptimized={!useResponsiveDelivery}
          onContextMenu={(event) => {
            if (!event.currentTarget.closest("[data-card-detail-shell]")) {
              event.preventDefault();
            }
            onContextMenu?.(event);
          }}
          onLoad={() => setLoaded(true)}
          onError={() => {
            if (!fallbackToSource && (useResponsiveDelivery || activeUrl !== sourceUrl)) {
              setFallbackToSource(true);
              setLoaded(false);
              return;
            }
            setFailed(true);
          }}
        />
      ) : null}
    </>
  );
}
