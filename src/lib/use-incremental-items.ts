"use client";

import { useEffect, useMemo, useState } from "react";

interface IncrementalRenderOptions {
  initialCount: number;
  batchSize: number;
  delayMs?: number;
}

type IdleCallbackHandle = number;

type WindowWithIdleCallback = Window & {
  requestIdleCallback?: (
    callback: IdleRequestCallback,
    options?: IdleRequestOptions
  ) => IdleCallbackHandle;
  cancelIdleCallback?: (handle: IdleCallbackHandle) => void;
};

interface IncrementalRenderState<T> {
  items: readonly T[];
  initialCount: number;
  renderCount: number;
}

export function useIncrementalItems<T>(
  items: readonly T[],
  { initialCount, batchSize, delayMs = 24 }: IncrementalRenderOptions
): readonly T[] {
  const [renderState, setRenderState] = useState<IncrementalRenderState<T>>(() => ({
    items,
    initialCount,
    renderCount: Math.min(initialCount, items.length),
  }));

  const isStaleState =
    renderState.items !== items || renderState.initialCount !== initialCount;

  if (isStaleState) {
    setRenderState({
      items,
      initialCount,
      renderCount: Math.min(initialCount, items.length),
    });
  }

  const renderCount = isStaleState
    ? Math.min(initialCount, items.length)
    : renderState.renderCount;

  useEffect(() => {
    if (renderCount >= items.length) return;

    const schedule = window as WindowWithIdleCallback;
    let timeoutId: number | null = null;
    let idleId: IdleCallbackHandle | null = null;
    let cancelled = false;

    const revealMore = () => {
      if (cancelled) return;

      setRenderState((current) => {
        if (current.items !== items || current.initialCount !== initialCount) return current;

        const nextCount = Math.min(current.renderCount + batchSize, items.length);
        if (nextCount === current.renderCount) return current;

        return {
          ...current,
          renderCount: nextCount,
        };
      });
    };

    if (schedule.requestIdleCallback) {
      idleId = schedule.requestIdleCallback(revealMore, { timeout: 180 });
    } else {
      timeoutId = window.setTimeout(revealMore, delayMs);
    }

    return () => {
      cancelled = true;
      if (timeoutId != null) {
        window.clearTimeout(timeoutId);
      }
      if (idleId != null && schedule.cancelIdleCallback) {
        schedule.cancelIdleCallback(idleId);
      }
    };
  }, [batchSize, delayMs, initialCount, items, items.length, renderCount]);

  return useMemo(() => items.slice(0, renderCount), [items, renderCount]);
}
