"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { MouseEvent, ReactNode } from "react";
import {
  getDustyHistoryIndex,
  saveCurrentScrollPosition,
} from "@/lib/client-navigation-state";

interface Props {
  href: string;
  children: ReactNode;
  className?: string;
  prefetch?: boolean;
}

export default function BackNavigationLink({
  href,
  children,
  className,
  prefetch = false,
}: Props) {
  const router = useRouter();

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.altKey ||
      event.ctrlKey ||
      event.shiftKey
    ) {
      return;
    }

    const historyIndex = getDustyHistoryIndex();
    if (historyIndex <= 0) return;

    event.preventDefault();
    saveCurrentScrollPosition();

    if (window.history.length > 1) {
      window.history.back();
      return;
    }

    router.push(href);
  }

  return (
    <Link href={href} prefetch={prefetch} className={className} onClick={handleClick}>
      {children}
    </Link>
  );
}
