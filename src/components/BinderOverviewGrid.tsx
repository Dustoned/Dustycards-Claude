"use client";

import { useMemo, type CSSProperties } from "react";
import BinderOverviewTile, { type BinderOverviewItem } from "@/components/BinderOverviewTile";
import { useSettings } from "@/components/SettingsProvider";
import { getBinderTileTrackWidth } from "@/lib/display-scale";

export default function BinderOverviewGrid({
  binders,
  className = "",
}: {
  binders: BinderOverviewItem[];
  className?: string;
}) {
  const { displaySettings } = useSettings();
  const binderTileTrackWidth = getBinderTileTrackWidth(
    displaySettings.cardSize,
    displaySettings.widescreen
  );
  const binderGridStyle = useMemo(
    () =>
      ({
        "--binder-tile-track": binderTileTrackWidth,
      }) as CSSProperties,
    [binderTileTrackWidth]
  );

  return (
    <div
      className={`grid grid-cols-2 gap-2 lg:gap-3 lg:[grid-template-columns:repeat(auto-fill,minmax(min(100%,var(--binder-tile-track)),1fr))] ${className}`}
      style={binderGridStyle}
    >
      {binders.map((binder) => (
        <BinderOverviewTile key={binder.id} binder={binder} />
      ))}
    </div>
  );
}
