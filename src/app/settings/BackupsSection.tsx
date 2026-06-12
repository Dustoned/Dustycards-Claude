"use client";

import { useState } from "react";
import type { BackupFileInfo } from "@/lib/backups";

interface BackupsSectionProps {
  initialDir: string | null;
  initialBackups: BackupFileInfo[];
}

const VISIBLE_BACKUPS = 8;

function formatByteSize(value: number): string {
  const units = ["B", "KB", "MB", "GB"] as const;
  let unitIndex = 0;
  let scaled = value;

  while (scaled >= 1024 && unitIndex < units.length - 1) {
    scaled /= 1024;
    unitIndex += 1;
  }

  const decimals = scaled >= 10 || unitIndex === 0 ? 0 : 1;
  return `${scaled.toFixed(decimals)} ${units[unitIndex]}`;
}

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export default function BackupsSection({ initialDir, initialBackups }: BackupsSectionProps) {
  const [backups, setBackups] = useState(initialBackups);
  const [dir, setDir] = useState(initialDir);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastCreated, setLastCreated] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  async function createBackup() {
    setBusy(true);
    setError(null);
    setLastCreated(null);
    try {
      const response = await fetch("/api/admin/backups", { method: "POST" });
      const payload = (await response.json()) as {
        ok?: boolean;
        created?: BackupFileInfo;
        dir?: string | null;
        backups?: BackupFileInfo[];
        error?: string;
      };
      if (!response.ok || !payload.ok || !payload.backups) {
        throw new Error(payload.error ?? "Could not create backup");
      }
      setBackups(payload.backups);
      setDir(payload.dir ?? null);
      setLastCreated(payload.created?.name ?? null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create backup");
    } finally {
      setBusy(false);
    }
  }

  const visibleBackups = showAll ? backups : backups.slice(0, VISIBLE_BACKUPS);

  return (
    <section className="settings-panel glass min-w-0 rounded-2xl p-6 shadow-md shadow-black/5">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">Backups</h2>
          <p className="mt-0.5 text-sm text-gray-400">
            Restore points for the live database.
            {dir ? ` Stored in ${dir}.` : " No backup directory found yet."}
          </p>
        </div>
        <button
          type="button"
          onClick={createBackup}
          disabled={busy}
          className="inline-flex w-fit shrink-0 items-center rounded-full border border-sky-400/40 bg-sky-400/[0.08] px-3.5 py-1.5 text-xs font-semibold text-sky-700 transition-colors hover:bg-sky-400/[0.16] disabled:cursor-not-allowed disabled:opacity-60 dark:text-sky-200"
        >
          {busy ? "Backing up..." : "Backup now"}
        </button>
      </div>

      {error && <p className="mb-3 text-sm text-rose-500 dark:text-rose-300">{error}</p>}
      {lastCreated && !error && (
        <p className="mb-3 text-sm text-emerald-700 dark:text-emerald-300">
          Backup created: {lastCreated}
        </p>
      )}

      {backups.length === 0 ? (
        <p className="text-sm text-gray-400">
          No restore points yet. Use Backup now to create the first one.
        </p>
      ) : (
        <>
          <ul className="divide-y divide-black/5 dark:divide-white/8">
            {visibleBackups.map((backup) => (
              <li key={backup.name} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm text-gray-900 dark:text-white">{backup.name}</p>
                  <p className="text-[11px] text-gray-500 dark:text-white/45">
                    {formatDateTime(backup.updatedAt)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {backup.manual && (
                    <span className="rounded-full border border-sky-400/30 bg-sky-400/[0.08] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-700 dark:text-sky-200">
                      Manual
                    </span>
                  )}
                  <span className="text-xs tabular-nums text-gray-500 dark:text-white/45">
                    {formatByteSize(backup.sizeBytes)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
          {backups.length > VISIBLE_BACKUPS && (
            <button
              type="button"
              onClick={() => setShowAll((current) => !current)}
              className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400 hover:text-gray-600 dark:hover:text-white"
            >
              {showAll ? "Show fewer" : `Show all ${backups.length}`}
            </button>
          )}
        </>
      )}
    </section>
  );
}
