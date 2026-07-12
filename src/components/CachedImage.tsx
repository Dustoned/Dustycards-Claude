"use client";

import Image, { type ImageProps } from "next/image";
import { useMemo, useState } from "react";
import { getCachedImageUrl } from "@/lib/image-cache";

type CachedImageProps = Omit<ImageProps, "src" | "onLoad" | "onError"> & {
  sourceUrl: string;
  alt: string;
};

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
  unoptimized = true,
  ...props
}: Omit<CachedImageProps, "sourceUrl"> & { sourceUrl: string; preferredUrl: string }) {
  const [activeUrl, setActiveUrl] = useState(preferredUrl);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

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
          src={activeUrl}
          alt={alt}
          className={`${className} transition-opacity duration-200`}
          style={{ ...style, opacity: loaded ? style?.opacity : 0 }}
          unoptimized={unoptimized}
          onLoad={() => setLoaded(true)}
          onError={() => {
            if (activeUrl !== sourceUrl) {
              setActiveUrl(sourceUrl);
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
