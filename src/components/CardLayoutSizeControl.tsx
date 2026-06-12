"use client";

import { useSettings, type CardSize } from "@/components/SettingsProvider";

const MOBILE_CARD_LAYOUT_OPTIONS: Array<{
  value: CardSize;
  label: string;
  title: string;
}> = [
  { value: "large", label: "L", title: "Largest phone card tiles" },
  { value: "medium", label: "M", title: "Medium phone card tiles" },
  { value: "small", label: "S", title: "Small phone card tiles" },
  { value: "xsmall", label: "XS", title: "Compact phone card tiles" },
];

const DESKTOP_CARD_LAYOUT_OPTIONS: Array<{
  value: CardSize;
  label: string;
  title: string;
}> = [
  { value: "large", label: "L", title: "Largest card tiles" },
  { value: "medium", label: "M", title: "Medium card tiles" },
  { value: "small", label: "S", title: "Small card tiles" },
  { value: "xsmall", label: "XS", title: "Densest card tiles" },
];

export default function CardLayoutSizeControl({
  dense = false,
  className = "",
}: {
  dense?: boolean;
  className?: string;
}) {
  const { displaySettings, isMobileViewport, setDisplay } = useSettings();
  const layoutOptions = isMobileViewport ? MOBILE_CARD_LAYOUT_OPTIONS : DESKTOP_CARD_LAYOUT_OPTIONS;
  const buttonSizeClass = dense
    ? "min-h-8 min-w-[2.35rem] px-2 text-[10px] sm:min-w-[2.45rem] sm:text-[11px]"
    : "min-h-8 min-w-[2.8rem] px-2 text-[11px] sm:min-w-[4rem] sm:text-xs";

  return (
    <div
      className={`grid min-w-0 shrink-0 gap-1 rounded-[1.15rem] border border-white/10 bg-white/[0.055] p-1 shadow-sm shadow-black/20 ${className}`}
      style={{ gridTemplateColumns: `repeat(${layoutOptions.length}, minmax(0, 1fr))` }}
      aria-label="Card layout"
    >
      {layoutOptions.map((option) => {
        const active = displaySettings.cardSize === option.value;

        return (
          <button
            key={option.value}
            type="button"
            title={option.title}
            aria-pressed={active}
            onClick={() => setDisplay("cardSize", option.value)}
            className={`${buttonSizeClass} rounded-full font-black leading-none transition-colors ${
              active
                ? "border border-violet-400/40 bg-violet-600 text-white"
                : "text-white/56 hover:bg-white/[0.07] hover:text-white"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
