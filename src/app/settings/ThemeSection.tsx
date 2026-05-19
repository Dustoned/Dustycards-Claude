"use client";

import { useSettings } from "@/components/SettingsProvider";

const OPTIONS = [
  {
    value: "light" as const,
    label: "Light",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
      </svg>
    ),
  },
  {
    value: "dark" as const,
    label: "Dark",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z" />
      </svg>
    ),
  },
  {
    value: "system" as const,
    label: "System",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 0 1-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0 1 15 18.257V17.25m6-12V15a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 15V5.25m18 0A2.25 2.25 0 0 0 18.75 3H5.25A2.25 2.25 0 0 0 3 5.25m18 0H3" />
      </svg>
    ),
  },
];

const ACTIVE_OPTION_CLASS =
  "border-white/70 bg-white text-gray-950 shadow-[0_10px_22px_rgba(255,255,255,0.07)]";
const INACTIVE_OPTION_CLASS =
  "border-white/8 text-white/55 hover:border-white/18 hover:bg-white/[0.055] hover:text-white";

export default function ThemeSection() {
  const { settings, set } = useSettings();
  const theme = settings.theme;
  const setTheme = (v: typeof theme) => set("theme", v);

  return (
    <div className="settings-panel glass rounded-2xl p-6 shadow-md shadow-black/5">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">Appearance</h2>
        <p className="text-sm text-gray-400 mt-0.5">Choose how DustyCards looks on your device.</p>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {OPTIONS.map((opt) => {
          const active = theme === opt.value;
          return (
            <button
              key={opt.value}
              onClick={() => setTheme(opt.value)}
              className={`flex flex-col items-center gap-2 py-4 px-3 rounded-xl border transition-all ${
                active ? ACTIVE_OPTION_CLASS : INACTIVE_OPTION_CLASS
              }`}
            >
              {opt.icon}
              <span className="text-xs font-semibold">{opt.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
