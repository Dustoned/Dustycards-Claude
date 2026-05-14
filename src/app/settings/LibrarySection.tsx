"use client";

import { useSettings } from "@/components/SettingsProvider";

export default function LibrarySection() {
  const { settings, set } = useSettings();
  const onePieceEnabled = settings.onePieceLibraryEnabled;

  return (
    <div className="settings-panel glass rounded-2xl p-6 shadow-md shadow-black/5">
      <div className="mb-5">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">Libraries</h2>
        <p className="mt-0.5 text-sm text-gray-400">
          Choose which card libraries are visible for your account.
        </p>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900 dark:text-white">One Piece library</p>
          <p className="mt-0.5 text-xs text-gray-400">
            Shows One Piece in Browse, collection, wants, search and movers for you.
          </p>
        </div>
        <button
          type="button"
          aria-pressed={onePieceEnabled}
          onClick={() => set("onePieceLibraryEnabled", !onePieceEnabled)}
          className={`relative inline-flex h-6 w-11 shrink-0 items-center overflow-hidden rounded-full transition-colors ${
            onePieceEnabled ? "bg-emerald-500" : "bg-gray-300 dark:bg-white/18"
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
              onePieceEnabled ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
      </div>
    </div>
  );
}
