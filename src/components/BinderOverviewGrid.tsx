"use client";

import { useMemo, type CSSProperties } from "react";
import BinderOverviewTile, { type BinderOverviewItem } from "@/components/BinderOverviewTile";
import { useSettings } from "@/components/SettingsProvider";
import { getBinderGridTemplateColumns, getBinderTileTrackWidth } from "@/lib/display-scale";

export default function BinderOverviewGrid({
  binders,
  className = "",
}: {
  binders: BinderOverviewItem[];
  className?: string;
}) {
  const { displaySettings, isMobileViewport } = useSettings();
  const binderTileTrackWidth = getBinderTileTrackWidth(
    displaySettings.cardSize,
    displaySettings.widescreen
  );
  const gridTemplateColumns = getBinderGridTemplateColumns(
    displaySettings.cardSize,
    displaySettings.widescreen,
    isMobileViewport
  );
  const binderGridStyle = useMemo(
    () =>
      ({
        "--binder-tile-track": binderTileTrackWidth,
        gridTemplateColumns,
      }) as CSSProperties,
    [binderTileTrackWidth, gridTemplateColumns]
  );

  return (
    <div
      className={`grid gap-2 lg:gap-3 ${className}`}
      style={binderGridStyle}
    >
      {binders.map((binder) => (
        <BinderOverviewTile key={binder.id} binder={binder} />
      ))}
    </div>
  );
}
