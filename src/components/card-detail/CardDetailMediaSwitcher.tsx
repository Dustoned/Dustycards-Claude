"use client";

import { Box, RectangleHorizontal } from "lucide-react";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

export type CardDetailMediaMode = "2d" | "3d";

const STORAGE_KEY = "dustycards-card-detail-media-mode";
const INLINE_THREE_DIMENSIONAL_MIN_WIDTH = 992;
const mediaModeListeners = new Set<() => void>();

function readStoredMode(): CardDetailMediaMode {
  if (typeof window === "undefined") return "2d";
  return window.localStorage.getItem(STORAGE_KEY) === "3d" ? "3d" : "2d";
}

function subscribeToStoredMode(listener: () => void): () => void {
  mediaModeListeners.add(listener);
  const handleStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) listener();
  };
  window.addEventListener("storage", handleStorage);
  return () => {
    mediaModeListeners.delete(listener);
    window.removeEventListener("storage", handleStorage);
  };
}

function persistMode(mode: CardDetailMediaMode): void {
  window.localStorage.setItem(STORAGE_KEY, mode);
  mediaModeListeners.forEach((listener) => listener());
}

export function CardDetailMediaSwitcher({
  cardName,
  threeDimensionalAvailable = true,
  twoDimensional,
  renderThreeDimensional,
}: {
  cardName: string;
  threeDimensionalAvailable?: boolean;
  twoDimensional: ReactNode;
  renderThreeDimensional: (showTwoDimensional: () => void) => ReactNode;
}) {
  const storedMode = useSyncExternalStore(
    subscribeToStoredMode,
    readStoredMode,
    () => "2d"
  );
  const switcherRef = useRef<HTMLDivElement | null>(null);
  const [detailContainerAvailable, setDetailContainerAvailable] = useState(false);

  useEffect(() => {
    const shell = switcherRef.current?.closest<HTMLElement>("[data-card-detail-shell]");
    if (!shell) return;
    const updateAvailability = () => {
      setDetailContainerAvailable(
        shell.getBoundingClientRect().width >= INLINE_THREE_DIMENSIONAL_MIN_WIDTH
      );
    };
    updateAvailability();
    if (typeof ResizeObserver === "function") {
      const observer = new ResizeObserver(updateAvailability);
      observer.observe(shell);
      return () => observer.disconnect();
    }
    window.addEventListener("resize", updateAvailability);
    return () => window.removeEventListener("resize", updateAvailability);
  }, []);

  const inlineThreeDimensionalAvailable =
    detailContainerAvailable && threeDimensionalAvailable;
  const mode = inlineThreeDimensionalAvailable ? storedMode : "2d";
  const selectMode = useCallback((nextMode: CardDetailMediaMode) => {
    persistMode(nextMode);
  }, []);
  const showTwoDimensional = useCallback(() => selectMode("2d"), [selectMode]);

  return (
    <div
      ref={switcherRef}
      className="card-detail-media-switcher"
      data-card-detail-media-mode={mode}
      data-card-detail-media-3d-available={inlineThreeDimensionalAvailable ? "true" : "false"}
    >
      {inlineThreeDimensionalAvailable ? (
      <div
        className="card-detail-media-switch"
        role="group"
        aria-label={`Card view for ${cardName}`}
        data-card-detail-media-switch
      >
        <button
          type="button"
          onClick={() => selectMode("2d")}
          aria-pressed={mode === "2d"}
          className="card-detail-media-switch-option"
        >
          <RectangleHorizontal className="h-4 w-4" aria-hidden="true" />
          2D
        </button>
        <button
          type="button"
          onClick={() => selectMode("3d")}
          aria-pressed={mode === "3d"}
          className="card-detail-media-switch-option"
        >
          <Box className="h-4 w-4" aria-hidden="true" />
          3D
        </button>
      </div>
      ) : null}

      <div className="card-detail-media-two-dimensional">{twoDimensional}</div>
      {mode === "3d" ? (
        <div className="card-detail-media-three-dimensional">
          {renderThreeDimensional(showTwoDimensional)}
        </div>
      ) : null}
    </div>
  );
}
