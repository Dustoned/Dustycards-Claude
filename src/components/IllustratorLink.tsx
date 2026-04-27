"use client";

import Link from "next/link";

interface Props {
  artist: string;
  className?: string;
  onClick?: () => void;
}

export default function IllustratorLink({ artist, className, onClick }: Props) {
  return (
    <Link
      href={`/illustrators/${encodeURIComponent(artist)}`}
      prefetch={false}
      onClick={onClick}
      className={className}
    >
      {artist}
    </Link>
  );
}
