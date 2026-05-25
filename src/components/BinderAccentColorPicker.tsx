"use client";

import { Palette } from "lucide-react";
import { COLLECTION_BINDER_COLORS } from "@/lib/collection";

const DEFAULT_CUSTOM_COLOR = "#7C5CFF";

function isHexColor(value: string | null | undefined): value is string {
  return /^#[0-9a-f]{6}$/i.test(value ?? "");
}

function isPresetColor(value: string | null): boolean {
  return COLLECTION_BINDER_COLORS.includes(
    value as (typeof COLLECTION_BINDER_COLORS)[number]
  );
}

interface BinderAccentColorPickerProps {
  value: string | null;
  onChange: (value: string | null) => void;
  compact?: boolean;
  className?: string;
}

export default function BinderAccentColorPicker({
  value,
  onChange,
  compact = false,
  className = "",
}: BinderAccentColorPickerProps) {
  const activeCustom = value != null && !isPresetColor(value);
  const colorValue = isHexColor(value) ? value : DEFAULT_CUSTOM_COLOR;
  const swatchClass = compact
    ? "h-8 w-8 max-[640px]:h-8 max-[640px]:w-8"
    : "h-9 w-9 max-[640px]:h-8 max-[640px]:w-8";

  return (
    <div className={["space-y-2", className].filter(Boolean).join(" ")}>
      <div className="flex flex-wrap items-center gap-2 max-[640px]:gap-1.5">
        <button
          type="button"
          onClick={() => onChange(null)}
          className={`relative inline-flex ${swatchClass} items-center justify-center rounded-full border-2 bg-white/[0.06] transition-all ${
            value == null ? "scale-105 border-white" : "border-white/14 hover:border-white/26"
          }`}
          aria-label="No accent color"
          title="No accent color"
        >
          <span className="absolute inset-[7px] rounded-full border border-white/25 max-[640px]:inset-[6px]" />
          <span className="absolute h-px w-5 rotate-45 rounded-full bg-white/70 max-[640px]:w-4" />
        </button>

        {COLLECTION_BINDER_COLORS.map((option) => {
          const active = option === value;
          return (
            <button
              key={option}
              type="button"
              onClick={() => onChange(option)}
              className={`${swatchClass} rounded-full border-2 transition-transform ${
                active ? "scale-105 border-white" : "border-transparent"
              }`}
              style={{ backgroundColor: option }}
              aria-label={`Choose ${option}`}
            />
          );
        })}

        <label
          className={`relative inline-flex h-9 min-w-[6.5rem] cursor-pointer items-center gap-2 overflow-hidden rounded-full border-2 px-2.5 text-xs font-semibold transition-colors max-[640px]:h-8 max-[640px]:min-w-[5.75rem] max-[640px]:gap-1.5 max-[640px]:px-2 max-[640px]:text-[11px] ${
            activeCustom
              ? "border-violet-400/40 bg-violet-600 text-white"
              : "border-white/16 bg-white/[0.06] text-white/74 hover:border-white/28 hover:bg-white/[0.1]"
          }`}
          title="Custom color"
          aria-label="Choose custom color"
        >
          <span
            className="h-4 w-4 shrink-0 rounded-full border border-white/24 max-[640px]:h-3.5 max-[640px]:w-3.5"
            style={{ backgroundColor: colorValue }}
          />
          <Palette className="h-3.5 w-3.5 shrink-0 max-[640px]:h-3 max-[640px]:w-3" />
          <span>Custom</span>
          <input
            type="color"
            value={colorValue}
            onChange={(event) => onChange(event.target.value)}
            className="absolute inset-0 cursor-pointer opacity-0"
          />
        </label>
      </div>

      {activeCustom && (
        <input
          type="text"
          value={value ?? ""}
          onChange={(event) => {
            const next = event.target.value.trim();
            onChange(next || null);
          }}
          className="h-9 w-full rounded-xl border border-white/10 bg-white/8 px-3 text-xs font-semibold text-white outline-none transition-colors placeholder:text-white/28 focus:border-white/18 max-[640px]:h-8 max-[640px]:text-[12px]"
          placeholder="#7C5CFF"
          aria-label="Custom accent color hex"
        />
      )}
    </div>
  );
}
