"use client";

import {
  useSettings,
  Card3dSize,
  CardView,
  CardSize,
  ModalSize,
  PriceSource,
} from "@/components/SettingsProvider";

const VIEWS: { value: CardView; label: string; icon: React.ReactNode }[] = [
  {
    value: "table",
    label: "Table",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 0 1 0 3.75H5.625a1.875 1.875 0 0 1 0-3.75Z" />
      </svg>
    ),
  },
  {
    value: "grid",
    label: "Grid",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z" />
      </svg>
    ),
  },
];

const SIZES: { value: CardSize; label: string; desc: string }[] = [
  { value: "small", label: "Small", desc: "More cards visible" },
  { value: "medium", label: "Medium", desc: "Balanced" },
  { value: "large", label: "Large", desc: "Larger images" },
];

const PRICE_SOURCES: { value: PriceSource; label: string; desc: string }[] = [
  { value: "cm_en", label: "CardMarket", desc: "Use EUR prices as main prices" },
  { value: "tcp", label: "TCGPlayer", desc: "Use USD prices as main prices" },
];

const ACTIVE_OPTION_CLASS =
  "border-violet-400/40 bg-violet-600 text-white";
const INACTIVE_OPTION_CLASS =
  "border-white/8 text-white/55 hover:border-white/18 hover:bg-white/[0.055] hover:text-white";

export default function CardDefaultsSection() {
  const { settings, set } = useSettings();

  return (
    <div className="settings-panel glass rounded-2xl p-6 shadow-md shadow-black/5">
      <div className="mb-5">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">Card Display</h2>
        <p className="text-sm text-gray-400 mt-0.5">Default view and size when opening a set.</p>
      </div>

      <div className="mb-5">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Default View</p>
        <div className="grid grid-cols-3 gap-3">
          {VIEWS.map((v) => {
            const active = settings.defaultView === v.value;
            return (
              <button
                key={v.value}
                onClick={() => set("defaultView", v.value)}
                className={`flex flex-col items-center gap-2 py-4 px-3 rounded-xl border transition-all ${
                  active ? ACTIVE_OPTION_CLASS : INACTIVE_OPTION_CLASS
                }`}
              >
                {v.icon}
                <span className="text-xs font-semibold">{v.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Card Size</p>
        <div className="grid grid-cols-3 gap-3">
          {SIZES.map((s) => {
            const active = settings.cardSize === s.value;
            return (
              <button
                key={s.value}
                onClick={() => set("cardSize", s.value)}
                className={`flex flex-col items-center gap-1.5 py-3 px-3 rounded-xl border transition-all ${
                  active ? ACTIVE_OPTION_CLASS : INACTIVE_OPTION_CLASS
                }`}
              >
                <span className="text-sm font-semibold">{s.label}</span>
                <span className="text-xs opacity-60">{s.desc}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-5">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Card Detail Size</p>
        <div className="grid grid-cols-3 gap-3">
          {(["small", "medium", "large"] as ModalSize[]).map((v) => {
            const active = settings.modalSize === v;
            return (
              <button
                key={v}
                onClick={() => set("modalSize", v)}
                className={`flex flex-col items-center gap-1.5 py-3 px-3 rounded-xl border transition-all capitalize ${
                  active ? ACTIVE_OPTION_CLASS : INACTIVE_OPTION_CLASS
                }`}
              >
                <span className="text-sm font-semibold capitalize">{v}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-5">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">3D Card Size</p>
        <div className="grid grid-cols-3 gap-3">
          {(["small", "medium", "large"] as Card3dSize[]).map((v) => {
            const active = settings.card3dSize === v;
            return (
              <button
                key={v}
                onClick={() => set("card3dSize", v)}
                className={`flex flex-col items-center gap-1.5 py-3 px-3 rounded-xl border transition-all capitalize ${
                  active ? ACTIVE_OPTION_CLASS : INACTIVE_OPTION_CLASS
                }`}
              >
                <span className="text-sm font-semibold capitalize">{v}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-5">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Main Prices</p>
        <div className="grid grid-cols-2 gap-3">
          {PRICE_SOURCES.map((source) => {
            const active = settings.primaryPriceSource === source.value;
            return (
              <button
                key={source.value}
                onClick={() => set("primaryPriceSource", source.value)}
                className={`flex flex-col items-center gap-1.5 rounded-xl border px-3 py-3 transition-all ${
                  active ? ACTIVE_OPTION_CLASS : INACTIVE_OPTION_CLASS
                }`}
              >
                <span className="text-sm font-semibold">{source.label}</span>
                <span className="text-xs opacity-60">{source.desc}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
