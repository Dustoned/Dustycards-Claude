"use client";

import {
  BarChart3,
  Check,
  Heart,
  Home,
  Layers3,
  Monitor,
  Palette,
  RotateCcw,
  Search,
  Smartphone,
  Sparkles,
  WalletCards,
  X,
} from "lucide-react";
import { useMemo, useState, type CSSProperties } from "react";
import { useSettings } from "@/components/SettingsProvider";
import {
  APPEARANCE_PALETTE_KEYS,
  APPEARANCE_THEME_PRESETS,
  appearancePaletteToCssVariables,
  getAppearanceContrastChecks,
  getAppearancePreset,
  isHexColor,
  normalizeAppearancePalette,
  normalizeAppearanceSettings,
  resolveAppearancePalette,
  type AppearancePalette,
  type AppearanceThemePreset,
} from "@/lib/appearance-themes";

type PreviewViewport = "desktop" | "phone";
type PaletteKey = keyof AppearancePalette;

interface ColorFieldDefinition {
  key: PaletteKey;
  label: string;
  description: string;
}

interface ColorGroupDefinition {
  id: string;
  title: string;
  description: string;
  fields: readonly ColorFieldDefinition[];
  defaultOpen?: boolean;
}

const COLOR_GROUPS: readonly ColorGroupDefinition[] = [
  {
    id: "brand",
    title: "Brand & selection",
    description: "Buttons, active tabs and ambient detail.",
    defaultOpen: true,
    fields: [
      { key: "primary", label: "Primary", description: "Filled controls and selections" },
      { key: "primaryHover", label: "Primary hover", description: "Hover and pressed feedback" },
      { key: "primarySoft", label: "Soft accent", description: "Icons, outlines and subtle highlights" },
      { key: "secondary", label: "Secondary", description: "Gradients and supporting accents" },
    ],
  },
  {
    id: "canvas",
    title: "Canvas & surfaces",
    description: "The page, panels, elevated cards and borders.",
    defaultOpen: true,
    fields: [
      { key: "background", label: "Background", description: "Main app canvas" },
      { key: "surface", label: "Surface", description: "Primary cards and navigation" },
      { key: "surfaceElevated", label: "Elevated", description: "Popups and raised panels" },
      { key: "surfaceHover", label: "Surface hover", description: "Hover and selected rows" },
      { key: "border", label: "Border", description: "Quiet dividers and outlines" },
      { key: "borderHover", label: "Border hover", description: "Focused and interactive borders" },
    ],
  },
  {
    id: "type",
    title: "Typography",
    description: "Primary, supporting and muted copy.",
    fields: [
      { key: "textPrimary", label: "Primary text", description: "Titles and important values" },
      { key: "textSecondary", label: "Secondary text", description: "Regular supporting copy" },
      { key: "textMuted", label: "Muted text", description: "Labels and metadata" },
    ],
  },
  {
    id: "market",
    title: "Market & data",
    description: "Charts and meaning-driven status colours.",
    fields: [
      { key: "data", label: "Data", description: "Forecasts and secondary charts" },
      { key: "success", label: "Positive", description: "Gains and successful states" },
      { key: "negative", label: "Negative", description: "Drops, errors and destructive states" },
      { key: "warning", label: "Warning", description: "Attention and gold data" },
    ],
  },
];

function asThemeStyle(palette: AppearancePalette): CSSProperties {
  return appearancePaletteToCssVariables(palette) as CSSProperties;
}

function ThemePresetCard({
  preset,
  active,
  onSelect,
}: {
  preset: AppearanceThemePreset;
  active: boolean;
  onSelect: () => void;
}) {
  const { palette } = preset;

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      data-theme-preset={preset.id}
      data-theme-selected={active ? "true" : "false"}
      className="group relative min-h-[7.75rem] min-w-0 overflow-hidden rounded-2xl border p-3 text-left transition duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
      style={{
        background: `radial-gradient(circle at 86% 4%, ${palette.primary}32, transparent 48%), linear-gradient(145deg, ${palette.surfaceElevated}, ${palette.background})`,
        borderColor: active ? palette.primary : palette.border,
        boxShadow: active
          ? `0 0 0 1px ${palette.primary}55, 0 16px 34px ${palette.primary}20`
          : `inset 0 1px 0 ${palette.textPrimary}0A`,
        color: palette.textPrimary,
        outlineColor: palette.primarySoft,
      }}
    >
      <span className="flex items-start justify-between gap-2">
        <span className="flex items-center gap-1.5" aria-hidden="true">
          {[palette.primary, palette.secondary, palette.data].map((color) => (
            <span
              key={color}
              className="h-3.5 w-3.5 rounded-full border"
              style={{ backgroundColor: color, borderColor: `${palette.textPrimary}24` }}
            />
          ))}
        </span>
        <span
          className={`inline-flex h-6 w-6 items-center justify-center rounded-full border transition ${
            active ? "opacity-100" : "opacity-0 group-hover:opacity-55"
          }`}
          style={{
            backgroundColor: `${palette.primary}2E`,
            borderColor: `${palette.primarySoft}50`,
            color: palette.primarySoft,
          }}
          aria-hidden="true"
        >
          <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
        </span>
      </span>
      <span className="mt-4 block truncate text-sm font-bold">{preset.name}</span>
      <span
        className="mt-1 block text-[11px] font-medium leading-snug"
        style={{ color: palette.textMuted }}
      >
        {preset.description}
      </span>
    </button>
  );
}

function CustomPresetCard({
  palette,
  active,
  onOpen,
}: {
  palette: AppearancePalette;
  active: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-pressed={active}
      data-theme-preset="custom"
      data-theme-selected={active ? "true" : "false"}
      className="group relative col-span-2 min-h-[7.75rem] min-w-0 overflow-hidden rounded-2xl border p-3 text-left transition duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 md:col-span-1"
      style={{
        background: `radial-gradient(circle at 86% 4%, ${palette.secondary}2E, transparent 43%), radial-gradient(circle at 12% 94%, ${palette.data}20, transparent 44%), linear-gradient(145deg, ${palette.surfaceElevated}, ${palette.background})`,
        borderColor: active ? palette.primary : palette.border,
        boxShadow: active
          ? `0 0 0 1px ${palette.primary}55, 0 16px 34px ${palette.primary}20`
          : `inset 0 1px 0 ${palette.textPrimary}0A`,
        color: palette.textPrimary,
        outlineColor: palette.primarySoft,
      }}
    >
      <span className="flex items-start justify-between gap-2">
        <span
          className="inline-flex h-8 w-8 items-center justify-center rounded-xl border"
          style={{
            background: `linear-gradient(145deg, ${palette.primary}44, ${palette.secondary}28)`,
            borderColor: `${palette.primarySoft}4D`,
            color: palette.primarySoft,
          }}
        >
          <Palette className="h-4 w-4" aria-hidden="true" />
        </span>
        {active ? (
          <span
            className="inline-flex h-6 w-6 items-center justify-center rounded-full border"
            style={{
              backgroundColor: `${palette.primary}2E`,
              borderColor: `${palette.primarySoft}50`,
              color: palette.primarySoft,
            }}
            aria-hidden="true"
          >
            <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
          </span>
        ) : null}
      </span>
      <span className="mt-2.5 block text-sm font-bold">Custom</span>
      <span
        className="mt-1 block text-[11px] font-medium leading-snug"
        style={{ color: palette.textMuted }}
      >
        Tune every colour with a live preview.
      </span>
    </button>
  );
}

function ThemeColorField({
  definition,
  value,
  fallback,
  onChange,
}: {
  definition: ColorFieldDefinition;
  value: string;
  fallback: string;
  onChange: (value: string) => void;
}) {
  const valid = isHexColor(value);
  const pickerValue = valid ? value : fallback;

  return (
    <div
      data-theme-color-field={definition.key}
      className="grid min-h-[5.25rem] min-w-0 grid-cols-[46px_minmax(0,1fr)] gap-2.5 rounded-xl border border-white/8 bg-white/[0.028] p-2.5 transition focus-within:border-violet-300/28 focus-within:bg-white/[0.045]"
    >
      <span className="relative row-span-2 h-[46px] w-[46px] overflow-hidden rounded-xl border border-white/12 shadow-inner shadow-black/20">
        <span
          className="absolute inset-0"
          style={{ backgroundColor: pickerValue }}
          aria-hidden="true"
        />
        <input
          type="color"
          value={pickerValue}
          onChange={(event) => onChange(event.target.value.toUpperCase())}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          aria-label={`Choose ${definition.label.toLowerCase()}`}
        />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-xs font-bold text-white">{definition.label}</span>
        <span className="mt-0.5 block truncate text-[10px] font-medium text-white/38">
          {definition.description}
        </span>
      </span>
      <span className="flex min-w-0 items-center gap-1.5">
        <input
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value.toUpperCase())}
          onBlur={(event) => {
            if (isHexColor(event.target.value)) onChange(event.target.value.toUpperCase());
          }}
          maxLength={7}
          spellCheck={false}
          autoCapitalize="none"
          aria-label={`${definition.label} hex colour`}
          aria-invalid={!valid}
          className={`h-[44px] min-w-0 flex-1 rounded-lg border px-2 font-mono text-[11px] font-semibold outline-none transition ${
            valid
              ? "border-white/8 bg-black/14 text-white/72 focus:border-violet-300/30"
              : "border-rose-400/45 bg-rose-500/[0.08] text-rose-100"
          }`}
        />
        {!valid ? (
          <span className="shrink-0 text-[9px] font-bold text-rose-300">HEX</span>
        ) : null}
      </span>
    </div>
  );
}

function PreviewMetric({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="min-w-0 rounded-lg border px-2 py-1.5"
      style={{
        backgroundColor: "rgb(var(--dc-surface-elevated-rgb) / 0.72)",
        borderColor: "rgb(var(--dc-border-rgb) / 0.88)",
      }}
    >
      <p className="truncate text-[7px] font-bold uppercase tracking-[0.1em] text-gray-400">
        {label}
      </p>
      <p className="mt-0.5 truncate text-[11px] font-black text-white">{value}</p>
    </div>
  );
}

function PreviewCard({
  accent,
  label,
}: {
  accent: string;
  label: string;
}) {
  return (
    <div
      className="min-w-0 rounded-lg border p-1.5"
      style={{
        backgroundColor: "rgb(var(--dc-surface-elevated-rgb) / 0.7)",
        borderColor: "rgb(var(--dc-border-rgb) / 0.85)",
      }}
    >
      <div
        className="aspect-[3/2] rounded-md border border-white/8"
        style={{
          background: `radial-gradient(circle at 70% 20%, ${accent}B8, transparent 34%), linear-gradient(145deg, ${accent}50, rgb(var(--dc-surface-primary-rgb) / 0.94))`,
        }}
      />
      <p className="mt-1 truncate text-[8px] font-bold text-white/82">{label}</p>
    </div>
  );
}

function HomeThemePreview({
  palette,
  viewport,
}: {
  palette: AppearancePalette;
  viewport: PreviewViewport;
}) {
  const phone = viewport === "phone";
  const chartWidth = phone ? 212 : 360;

  return (
    <div
      data-theme-preview
      data-theme-preview-viewport={viewport}
      aria-label={`Homepage theme preview, ${viewport} view`}
      className={`relative mx-auto w-full overflow-hidden border shadow-[0_24px_70px_rgba(0,0,0,0.38)] ${
        phone
          ? "max-w-[19rem] rounded-[1.7rem]"
          : "min-h-[22rem] rounded-[1.35rem]"
      }`}
      style={{
        ...asThemeStyle(palette),
        background: "var(--dc-bg-main)",
        borderColor: "var(--dc-border)",
        color: "var(--dc-text-primary)",
      }}
    >
      <div
        className={`flex items-center gap-2 border-b px-2.5 ${phone ? "h-10" : "h-11"}`}
        style={{
          backgroundColor: "rgb(var(--dc-surface-primary-rgb) / 0.96)",
          borderColor: "var(--dc-border)",
        }}
      >
        <span
          className="inline-flex h-6 w-6 items-center justify-center rounded-lg text-[9px] font-black text-white"
          style={{ background: "var(--dc-primary-gradient)" }}
        >
          D
        </span>
        {!phone ? (
          <>
            <div
              className="flex h-6 min-w-0 flex-1 items-center gap-1.5 rounded-lg border px-2 text-[7px] font-semibold text-gray-400"
              style={{
                backgroundColor: "rgb(var(--dc-bg-main-rgb) / 0.58)",
                borderColor: "var(--dc-border)",
              }}
            >
              <Search className="h-2.5 w-2.5" />
              Search your collection
            </div>
            <div className="flex items-center gap-1">
              {["Home", "Collection", "Market"].map((item, index) => (
                <span
                  key={item}
                  className="rounded-full border px-2 py-1 text-[7px] font-bold"
                  style={
                    index === 0
                      ? {
                          backgroundColor: "var(--dc-primary)",
                          borderColor: "var(--dc-primary-hover)",
                          color: "var(--dc-text-primary)",
                        }
                      : { borderColor: "transparent", color: "var(--dc-text-muted)" }
                  }
                >
                  {item}
                </span>
              ))}
            </div>
          </>
        ) : (
          <>
            <span className="min-w-0 flex-1 truncate text-[10px] font-black">DustyCards</span>
            <span
              className="h-6 w-6 rounded-full border"
              style={{
                backgroundColor: "rgb(var(--dc-primary-rgb) / 0.18)",
                borderColor: "rgb(var(--dc-primary-soft-rgb) / 0.32)",
              }}
            />
          </>
        )}
      </div>

      <div className={`flex ${phone ? "min-h-[31rem] pb-[3.6rem]" : "min-h-[19.2rem]"}`}>
        {!phone ? (
          <aside
            className="w-[4.6rem] shrink-0 border-r p-2"
            style={{
              backgroundColor: "rgb(var(--dc-surface-primary-rgb) / 0.76)",
              borderColor: "var(--dc-border)",
            }}
          >
            <p className="px-1 text-[6px] font-black uppercase tracking-[0.12em] text-gray-400">
              Collection
            </p>
            <div className="mt-2 grid gap-1">
              {[Home, Layers3, Heart, BarChart3].map((Icon, index) => (
                <span
                  key={index}
                  className="flex h-7 items-center gap-1.5 rounded-lg px-1.5 text-[7px] font-bold"
                  style={
                    index === 0
                      ? {
                          backgroundColor: "rgb(var(--dc-primary-rgb) / 0.17)",
                          color: "var(--dc-primary-soft)",
                        }
                      : { color: "var(--dc-text-muted)" }
                  }
                >
                  <Icon className="h-2.5 w-2.5" />
                  {index === 0 ? "Home" : index === 1 ? "Cards" : index === 2 ? "Wants" : "Market"}
                </span>
              ))}
            </div>
          </aside>
        ) : null}

        <div className={`min-w-0 flex-1 ${phone ? "p-3" : "p-3.5"}`}>
          <div className="flex items-end justify-between gap-2">
            <div className="min-w-0">
              <p className={`${phone ? "text-[15px]" : "text-base"} font-black tracking-tight text-white`}>
                My Collection
              </p>
              <p className="mt-0.5 text-[8px] font-semibold text-gray-400">284 cards · 9 binders</p>
            </div>
            <span
              className="rounded-full border px-2 py-1 text-[7px] font-bold"
              style={{
                backgroundColor: "rgb(var(--dc-primary-rgb) / 0.14)",
                borderColor: "rgb(var(--dc-primary-rgb) / 0.3)",
                color: "var(--dc-primary-soft)",
              }}
            >
              Pokémon
            </span>
          </div>

          <div className={`mt-2 grid gap-2 ${phone ? "grid-cols-1" : "grid-cols-[minmax(0,1.35fr)_minmax(8rem,0.65fr)]"}`}>
            <div
              className="relative min-h-[7.6rem] overflow-hidden rounded-xl border p-2.5"
              style={{
                background: "linear-gradient(145deg, rgb(var(--dc-surface-elevated-rgb) / 0.9), rgb(var(--dc-surface-primary-rgb) / 0.92))",
                borderColor: "var(--dc-border)",
              }}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[7px] font-black uppercase tracking-[0.1em] text-gray-400">Collection value</p>
                  <p className="mt-0.5 text-[15px] font-black tabular-nums text-white">€12,480</p>
                </div>
                <p className="text-[8px] font-black text-emerald-300">+8.4%</p>
              </div>
              <svg
                className="absolute inset-x-2 bottom-2 h-[3.4rem] w-[calc(100%-1rem)]"
                viewBox={`0 0 ${chartWidth} 64`}
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <path
                  d={`M 0 52 C ${chartWidth * 0.16} 48, ${chartWidth * 0.2} 55, ${chartWidth * 0.34} 40 S ${chartWidth * 0.56} 31, ${chartWidth * 0.67} 34 S ${chartWidth * 0.82} 16, ${chartWidth} 9`}
                  fill="none"
                  stroke="var(--dc-primary)"
                  strokeWidth="3"
                  strokeLinecap="round"
                />
                <path
                  d={`M 0 52 C ${chartWidth * 0.16} 48, ${chartWidth * 0.2} 55, ${chartWidth * 0.34} 40 S ${chartWidth * 0.56} 31, ${chartWidth * 0.67} 34 S ${chartWidth * 0.82} 16, ${chartWidth} 9`}
                  fill="none"
                  stroke="var(--dc-primary-soft)"
                  strokeWidth="1"
                  opacity="0.5"
                />
              </svg>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <PreviewMetric label="ROI" value="+18.2%" />
              <PreviewMetric label="Items" value="293" />
              <PreviewMetric label="Priced" value="96%" />
              <PreviewMetric label="Spend" value="€8.9K" />
            </div>
          </div>

          <div className="mt-2 flex items-center justify-between gap-2">
            <p className="text-[9px] font-black text-white">Collection highlights</p>
            <span className="text-[7px] font-bold text-violet-300">View all</span>
          </div>
          <div className="mt-1.5 grid grid-cols-3 gap-1.5">
            <PreviewCard accent={palette.primary} label="Top mover" />
            <PreviewCard accent={palette.data} label="New chase" />
            <PreviewCard accent={palette.warning} label="Rare pull" />
          </div>

          {!phone ? (
            <div className="mt-2 grid grid-cols-2 gap-2">
              {["Value drivers", "Recent opportunities"].map((label, index) => (
                <div
                  key={label}
                  className="rounded-xl border p-2"
                  style={{
                    backgroundColor: "rgb(var(--dc-surface-primary-rgb) / 0.8)",
                    borderColor: "var(--dc-border)",
                  }}
                >
                  <div className="flex items-center gap-1.5">
                    {index === 0 ? (
                      <WalletCards className="h-3 w-3 text-violet-300" />
                    ) : (
                      <Sparkles className="h-3 w-3 text-cyan-300" />
                    )}
                    <span className="text-[8px] font-black text-white">{label}</span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/20">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: index === 0 ? "72%" : "56%",
                        backgroundColor: index === 0 ? "var(--dc-primary)" : "var(--dc-cyan)",
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {phone ? (
        <div
          className="absolute inset-x-0 bottom-0 grid h-[3.55rem] grid-cols-4 border-t px-2 pt-1.5"
          style={{
            background: "linear-gradient(180deg, rgb(var(--dc-surface-primary-rgb) / 0.98), var(--dc-bg-main))",
            borderColor: "var(--dc-border)",
          }}
        >
          {[Home, Layers3, Heart, BarChart3].map((Icon, index) => (
            <span
              key={index}
              className="flex flex-col items-center justify-center gap-0.5 rounded-xl text-[6px] font-bold"
              style={
                index === 0
                  ? {
                      backgroundColor: "rgb(var(--dc-primary-rgb) / 0.16)",
                      color: "var(--dc-primary-soft)",
                    }
                  : { color: "var(--dc-text-muted)" }
              }
            >
              <Icon className="h-3 w-3" />
              {index === 0 ? "Home" : index === 1 ? "Cards" : index === 2 ? "Wants" : "Market"}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function ThemeSection() {
  const { settings, set, isMobileViewport } = useSettings();
  const appearance = normalizeAppearanceSettings(settings.appearance);
  const activePalette = resolveAppearancePalette(appearance);
  const activeName =
    getAppearancePreset(appearance.preset)?.name ?? (appearance.preset === "custom" ? "Custom" : "Collector Violet");
  const [editorOpen, setEditorOpen] = useState(false);
  const [previewViewport, setPreviewViewport] = useState<PreviewViewport>(() =>
    isMobileViewport ? "phone" : "desktop"
  );
  const [draft, setDraft] = useState<AppearancePalette>(() => ({ ...activePalette }));
  const [baseline, setBaseline] = useState<AppearancePalette>(() => ({ ...activePalette }));
  const [openGroups, setOpenGroups] = useState<Set<string>>(
    () => new Set(COLOR_GROUPS.filter((group) => group.defaultOpen).map((group) => group.id))
  );

  const normalizedDraft = useMemo(
    () => normalizeAppearancePalette(draft, baseline),
    [baseline, draft]
  );
  const invalidKeys = useMemo(
    () => APPEARANCE_PALETTE_KEYS.filter((key) => !isHexColor(draft[key])),
    [draft]
  );
  const contrastChecks = useMemo(
    () => getAppearanceContrastChecks(normalizedDraft),
    [normalizedDraft]
  );
  const contrastPass =
    contrastChecks.page >= 4.5 &&
    contrastChecks.surface >= 4.5 &&
    contrastChecks.button >= 4.5;

  function selectPreset(preset: AppearanceThemePreset) {
    set("appearance", { ...appearance, preset: preset.id });
    setEditorOpen(false);
  }

  function openCustomEditor() {
    const source = appearance.preset === "custom" ? appearance.custom : activePalette;
    const next = normalizeAppearancePalette(source);
    setDraft({ ...next });
    setBaseline({ ...next });
    setPreviewViewport(isMobileViewport ? "phone" : "desktop");
    setEditorOpen(true);
  }

  function updateDraft(key: PaletteKey, value: string) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function applyCustomTheme() {
    if (invalidKeys.length > 0) return;
    set("appearance", {
      preset: "custom",
      custom: normalizeAppearancePalette(draft, baseline),
    });
    setEditorOpen(false);
  }

  return (
    <section
      data-appearance-section
      className="settings-panel glass rounded-2xl p-5 shadow-md shadow-black/5 sm:p-6"
    >
      <div className="mb-5 flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-violet-300/18 bg-violet-500/[0.11] text-violet-200">
              <Palette className="h-4 w-4" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">Appearance</h2>
              <p className="mt-0.5 text-sm text-gray-400">
                Give every DustyCards screen one consistent collector palette.
              </p>
            </div>
          </div>
        </div>
        <span className="inline-flex min-h-8 w-fit items-center gap-1.5 rounded-full border border-violet-300/16 bg-violet-500/[0.09] px-3 text-[11px] font-bold text-violet-100">
          <Sparkles className="h-3 w-3" aria-hidden="true" />
          {activeName}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-7">
        {APPEARANCE_THEME_PRESETS.map((preset) => (
          <ThemePresetCard
            key={preset.id}
            preset={preset}
            active={appearance.preset === preset.id}
            onSelect={() => selectPreset(preset)}
          />
        ))}
        <CustomPresetCard
          palette={appearance.preset === "custom" ? appearance.custom : activePalette}
          active={appearance.preset === "custom"}
          onOpen={openCustomEditor}
        />
      </div>

      {editorOpen ? (
        <div
          data-custom-theme-open="true"
          className="mt-4 rounded-2xl border border-violet-300/16 bg-black/16 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]"
        >
          <div className="flex min-w-0 items-center justify-between gap-3 rounded-t-2xl border-b border-white/8 px-3 py-3 sm:px-4">
            <div className="min-w-0">
              <p className="text-sm font-bold text-white">Build your custom theme</p>
              <p className="mt-0.5 text-xs text-white/42">
                Changes stay in this preview until you apply them.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setEditorOpen(false)}
              className="inline-flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-white/58 transition hover:bg-white/[0.08] hover:text-white"
              aria-label="Close custom theme editor"
              data-theme-cancel
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid min-w-0 gap-4 p-3 sm:p-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(22rem,1.05fr)] lg:items-start">
            <div className="min-w-0 space-y-2.5">
              {COLOR_GROUPS.map((group) => (
                <details
                  key={group.id}
                  className="group overflow-hidden rounded-xl border border-white/8 bg-white/[0.022]"
                  open={openGroups.has(group.id)}
                  onToggle={(event) => {
                    const nextOpen = event.currentTarget.open;
                    setOpenGroups((current) => {
                      if (current.has(group.id) === nextOpen) return current;
                      const next = new Set(current);
                      if (nextOpen) next.add(group.id);
                      else next.delete(group.id);
                      return next;
                    });
                  }}
                >
                  <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 [&::-webkit-details-marker]:hidden">
                    <span className="min-w-0">
                      <span className="block text-xs font-bold text-white">{group.title}</span>
                      <span className="mt-0.5 block truncate text-[10px] font-medium text-white/38">
                        {group.description}
                      </span>
                    </span>
                    <span className="text-[10px] font-bold text-violet-200/70 group-open:hidden">Edit</span>
                    <span className="hidden text-[10px] font-bold text-white/34 group-open:inline">Hide</span>
                  </summary>
                  <div className="grid gap-2 border-t border-white/7 p-2.5 sm:grid-cols-2">
                    {group.fields.map((definition) => (
                      <ThemeColorField
                        key={definition.key}
                        definition={definition}
                        value={draft[definition.key]}
                        fallback={baseline[definition.key]}
                        onChange={(value) => updateDraft(definition.key, value)}
                      />
                    ))}
                  </div>
                </details>
              ))}
            </div>

            <div className="order-first min-w-0 lg:order-none lg:sticky lg:top-[calc(var(--ui-header-height)+1rem)]">
              <div className="mb-2.5 flex min-w-0 items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/42">Live home preview</p>
                  <p className="mt-0.5 text-xs font-semibold text-white/72">Canvas, data and navigation together</p>
                </div>
                <div className="grid shrink-0 grid-cols-2 rounded-xl border border-white/9 bg-black/18 p-0.5">
                  {([
                    ["desktop", Monitor, "Desktop preview"],
                    ["phone", Smartphone, "Phone preview"],
                  ] as const).map(([value, Icon, label]) => {
                    const active = previewViewport === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setPreviewViewport(value)}
                        aria-label={label}
                        aria-pressed={active}
                        className={`inline-flex h-[44px] w-[44px] items-center justify-center rounded-[0.6rem] transition ${
                          active
                            ? "bg-violet-600 text-white shadow-sm shadow-black/20"
                            : "text-white/42 hover:bg-white/[0.05] hover:text-white/72"
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                      </button>
                    );
                  })}
                </div>
              </div>

              <HomeThemePreview palette={normalizedDraft} viewport={previewViewport} />

              <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  ["page", contrastChecks.page, 4.5],
                  ["surface", contrastChecks.surface, 4.5],
                  ["muted", contrastChecks.muted, 3],
                  ["button", contrastChecks.button, 4.5],
                ].map(([key, value, target]) => {
                  const pass = Number(value) >= Number(target);
                  return (
                    <div
                      key={String(key)}
                      data-theme-contrast={key}
                      data-status={pass ? "pass" : "warning"}
                      className={`rounded-xl border px-2.5 py-2 ${
                        pass
                          ? "border-emerald-400/14 bg-emerald-500/[0.045]"
                          : "border-amber-400/18 bg-amber-500/[0.055]"
                      }`}
                    >
                      <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-white/38">{key}</p>
                      <p className={`mt-0.5 text-xs font-black ${pass ? "text-emerald-300" : "text-amber-300"}`}>
                        {Number(value).toFixed(1)}:1
                      </p>
                    </div>
                  );
                })}
              </div>
              {!contrastPass ? (
                <p className="mt-2 text-[10px] font-semibold leading-relaxed text-amber-200/72">
                  Preview warning: one or more important text pairs are below WCAG AA contrast.
                </p>
              ) : null}
            </div>
          </div>

          <div className="flex flex-col-reverse gap-2 rounded-b-2xl border-t border-white/8 bg-black/12 p-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
            <button
              type="button"
              onClick={() => setDraft({ ...baseline })}
              data-theme-reset
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.035] px-4 text-xs font-bold text-white/58 transition hover:bg-white/[0.07] hover:text-white"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset changes
            </button>
            <div className="grid grid-cols-2 gap-2 sm:flex">
              <button
                type="button"
                onClick={() => setEditorOpen(false)}
                className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-white/10 px-4 text-xs font-bold text-white/58 transition hover:bg-white/[0.055] hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={applyCustomTheme}
                disabled={invalidKeys.length > 0}
                data-theme-apply
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-violet-300/28 bg-violet-600 px-4 text-xs font-bold text-white shadow-[0_12px_28px_rgb(var(--dc-primary-rgb)/0.2)] transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-45"
              >
                <Palette className="h-3.5 w-3.5" />
                Apply custom theme
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
