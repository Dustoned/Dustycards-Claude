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
    ? "h-9 min-w-[2.35rem] px-2 text-[10px] sm:min-w-[2.45rem] sm:text-[11px]"
    : "h-10 min-w-[2.8rem] px-2.5 text-[11px] sm:min-w-[4rem] sm:text-xs";

  return (
    <div
      className={`grid min-w-0 shrink-0 gap-1 ${className}`}
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
            className={`${buttonSizeClass} rounded-xl border font-black leading-none shadow-sm transition-[border-color,background-color,color,box-shadow,transform] active:scale-[0.97] ${
              active
                ? "border-[rgb(var(--dc-primary-rgb)/0.42)] bg-[rgb(var(--dc-primary-rgb)/0.14)] text-[var(--dc-primary)] shadow-[0_7px_18px_rgb(var(--dc-primary-rgb)/0.12)]"
                : "border-[rgb(var(--dc-border-rgb)/0.82)] bg-[rgb(var(--dc-surface-elevated-rgb)/0.7)] text-[rgb(var(--dc-text-primary-rgb)/0.58)] hover:border-[rgb(var(--dc-primary-rgb)/0.26)] hover:bg-[rgb(var(--dc-primary-rgb)/0.07)] hover:text-[var(--dc-text-primary)]"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
