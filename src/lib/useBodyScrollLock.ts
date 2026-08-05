"use client";

import { useEffect } from "react";

let activeBodyScrollLocks = 0;
let restoreState:
  | {
      overflow: string;
      paddingRight: string;
      position: string;
      top: string;
      left: string;
      right: string;
      width: string;
      overscrollBehaviorX: string;
      overscrollBehaviorY: string;
      documentElementOverflow: string;
      documentElementOverscrollBehaviorX: string;
      documentElementOverscrollBehaviorY: string;
      hadBodyScrollLockClass: boolean;
      hadDocumentElementScrollLockClass: boolean;
      scrollY: number;
    }
  | null = null;

export default function useBodyScrollLock(
  active = true,
  strategy: "fixed" | "overflow" = "fixed"
) {
  useEffect(() => {
    if (!active || typeof window === "undefined") {
      return;
    }

    const { body, documentElement } = document;

    if (activeBodyScrollLocks === 0) {
      const scrollY = window.scrollY;
      const scrollbarWidth = Math.max(0, window.innerWidth - documentElement.clientWidth);

      restoreState = {
        overflow: body.style.overflow,
        paddingRight: body.style.paddingRight,
        position: body.style.position,
        top: body.style.top,
        left: body.style.left,
        right: body.style.right,
        width: body.style.width,
        overscrollBehaviorX: body.style.overscrollBehaviorX,
        overscrollBehaviorY: body.style.overscrollBehaviorY,
        documentElementOverflow: documentElement.style.overflow,
        documentElementOverscrollBehaviorX: documentElement.style.overscrollBehaviorX,
        documentElementOverscrollBehaviorY: documentElement.style.overscrollBehaviorY,
        hadBodyScrollLockClass: body.classList.contains("dc-scroll-locked"),
        hadDocumentElementScrollLockClass: documentElement.classList.contains("dc-scroll-locked"),
        scrollY,
      };

      documentElement.classList.add("dc-scroll-locked");
      body.classList.add("dc-scroll-locked");
      documentElement.style.overflow = "hidden";
      documentElement.style.overscrollBehaviorX = "auto";
      documentElement.style.overscrollBehaviorY = "none";
      body.style.overflow = "hidden";
      body.style.overscrollBehaviorX = "auto";
      body.style.overscrollBehaviorY = "none";

      if (strategy === "fixed") {
        body.style.position = "fixed";
        body.style.top = `-${scrollY}px`;
        body.style.left = "0";
        body.style.right = "0";
        body.style.width = "100%";
      }

      if (scrollbarWidth > 0) {
        body.style.paddingRight = `${scrollbarWidth}px`;
      }
    }

    activeBodyScrollLocks += 1;

    return () => {
      activeBodyScrollLocks = Math.max(0, activeBodyScrollLocks - 1);

      if (activeBodyScrollLocks !== 0 || !restoreState) {
        return;
      }

      const nextState = restoreState;
      restoreState = null;

      body.style.overflow = nextState.overflow;
      body.style.paddingRight = nextState.paddingRight;
      body.style.position = nextState.position;
      body.style.top = nextState.top;
      body.style.left = nextState.left;
      body.style.right = nextState.right;
      body.style.width = nextState.width;
      body.style.overscrollBehaviorX = nextState.overscrollBehaviorX;
      body.style.overscrollBehaviorY = nextState.overscrollBehaviorY;
      documentElement.style.overflow = nextState.documentElementOverflow;
      documentElement.style.overscrollBehaviorX = nextState.documentElementOverscrollBehaviorX;
      documentElement.style.overscrollBehaviorY = nextState.documentElementOverscrollBehaviorY;

      if (!nextState.hadDocumentElementScrollLockClass) {
        documentElement.classList.remove("dc-scroll-locked");
      }
      if (!nextState.hadBodyScrollLockClass) {
        body.classList.remove("dc-scroll-locked");
      }

      window.scrollTo(0, nextState.scrollY);
    };
  }, [active, strategy]);
}
