"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AppFeatures } from "@/lib/app-settings";

export default function AppFeaturesSection({
  initialFeatures,
}: {
  initialFeatures: AppFeatures;
}) {
  const router = useRouter();
  const [features, setFeatures] = useState(initialFeatures);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function setOnePieceEnabled(enabled: boolean) {
    setSaving(true);
    setStatus(null);

    try {
      const response = await fetch("/api/admin/app-settings", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ onePieceLibraryEnabled: enabled }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok || !data.ok) {
        throw new Error(data.error ?? "Could not save app setting");
      }

      setFeatures(data.features);
      setStatus(enabled ? "One Piece is visible for all users." : "One Piece is hidden for all users.");
      router.refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not save app setting");
    } finally {
      setSaving(false);
    }
  }

  const onePieceEnabled = features.onePieceLibraryEnabled;

  return (
    <div className="settings-panel glass min-w-0 rounded-2xl p-6 shadow-md shadow-black/5">
      <div className="mb-5">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">App Features</h2>
        <p className="mt-0.5 text-sm text-gray-400">
          Turn shared library sections on or off for every account.
        </p>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900 dark:text-white">One Piece library</p>
          <p className="mt-0.5 text-xs text-gray-400">
            Shows One Piece in Browse, collection, wants, search and movers for all users.
          </p>
        </div>
        <button
          type="button"
          disabled={saving}
          aria-pressed={onePieceEnabled}
          onClick={() => void setOnePieceEnabled(!onePieceEnabled)}
          className={`relative inline-flex h-6 w-11 shrink-0 items-center overflow-hidden rounded-full transition-colors disabled:cursor-wait disabled:opacity-60 ${
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

      {status && (
        <p
          className={`mt-3 text-xs ${
            status.startsWith("Could")
              ? "text-rose-600 dark:text-rose-300"
              : "text-gray-500 dark:text-white/48"
          }`}
        >
          {status}
        </p>
      )}
    </div>
  );
}
