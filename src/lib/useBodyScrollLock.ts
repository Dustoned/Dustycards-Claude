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
      overscrollBehavior: string;
      scrollY: number;
    }
  | null = null;

export default function useBodyScrollLock(active = true) {
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
        overscrollBehavior: body.style.overscrollBehavior,
        scrollY,
      };

      body.style.overflow = "hidden";
      body.style.position = "fixed";
      body.style.top = `-${scrollY}px`;
      body.style.left = "0";
      body.style.right = "0";
      body.style.width = "100%";
      body.style.overscrollBehavior = "none";

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
      body.style.overscrollBehavior = nextState.overscrollBehavior;

      window.scrollTo(0, nextState.scrollY);
    };
  }, [active]);
}
