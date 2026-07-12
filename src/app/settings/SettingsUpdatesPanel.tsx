import { appBuildLabel, appVersion, buildVersion } from "@/lib/app-version";
import {
  patchNotes,
  roadmapItems,
  type PatchNoteEntry,
  type PatchNoteTone,
} from "@/lib/patch-notes";

const RECENT_PATCH_NOTE_COUNT = 8;

function toneClasses(tone: PatchNoteTone): string {
  if (tone === "new") return "border-emerald-400/22 bg-emerald-400/[0.08] text-emerald-700 dark:text-emerald-200";
  if (tone === "fixed") return "border-sky-400/22 bg-sky-400/[0.08] text-sky-700 dark:text-sky-200";
  if (tone === "system") return "border-violet-400/22 bg-violet-400/[0.08] text-violet-700 dark:text-violet-200";
  return "border-amber-400/24 bg-amber-400/[0.08] text-amber-700 dark:text-amber-200";
}

function statusClasses(status: string): string {
  if (status === "Next") return "border-emerald-400/22 bg-emerald-400/[0.08] text-emerald-700 dark:text-emerald-200";
  return "border-white/10 bg-white/[0.04] text-gray-500 dark:text-white/55";
}

function formatToneLabel(tone: PatchNoteTone): string {
  if (tone === "new") return "New";
  if (tone === "fixed") return "Fixed";
  if (tone === "system") return "System";
  return "Improved";
}

function PatchNoteCard({
  note,
  isLatest = false,
  compact = false,
}: {
  note: PatchNoteEntry;
  isLatest?: boolean;
  compact?: boolean;
}) {
  return (
    <article
      className={`min-w-0 rounded-xl border p-3 shadow-sm shadow-black/5 dark:shadow-none ${
        isLatest
          ? "border-emerald-400/20 bg-emerald-400/[0.055] dark:border-emerald-300/14 dark:bg-emerald-300/[0.045]"
          : "border-black/6 bg-white/55 dark:border-white/8 dark:bg-white/[0.035]"
      }`}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="rounded-full border border-black/6 bg-black/[0.035] px-2 py-0.5 text-[11px] font-bold tabular-nums text-gray-900 dark:border-white/8 dark:bg-white/[0.055] dark:text-white">
          {note.version}
        </span>
        <span
          className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] ${toneClasses(
            note.tone
          )}`}
        >
          {formatToneLabel(note.tone)}
        </span>
        <span className="text-[11px] font-medium text-gray-400">
          {note.releasedAt}
        </span>
      </div>

      <div className="mt-2 min-w-0">
        <h3 className="text-sm font-semibold text-gray-950 dark:text-white">
          {note.title}
        </h3>
        <p className="mt-0.5 text-sm leading-5 text-gray-500 dark:text-white/50">
          {note.summary}
        </p>
      </div>

      <ul
        className={`mt-3 grid gap-1.5 text-[12px] leading-5 text-gray-500 dark:text-white/48 ${
          isLatest ? "lg:grid-cols-2" : compact ? "sm:grid-cols-2" : "sm:grid-cols-2 xl:grid-cols-3"
        }`}
      >
        {note.highlights.map((highlight) => (
          <li key={highlight} className="flex min-w-0 gap-2">
            <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-gray-400 dark:bg-white/35" />
            <span className="min-w-0">{highlight}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}

export default function SettingsUpdatesPanel() {
  const latest = patchNotes[0] ?? null;
  const recentPatchNotes = patchNotes.slice(1, RECENT_PATCH_NOTE_COUNT);
  const olderPatchNotes = patchNotes.slice(RECENT_PATCH_NOTE_COUNT);

  return (
    <section className="settings-panel glass min-w-0 rounded-2xl p-5 shadow-md shadow-black/5 sm:p-6">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">
            Patch Notes
          </h2>
          <p className="mt-0.5 max-w-2xl text-sm text-gray-500 dark:text-white/45">
            Complete release notes for the latest DustyCards changes.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:w-[17rem]">
          <div className="rounded-xl border border-black/6 bg-black/[0.025] px-3 py-2 dark:border-white/8 dark:bg-white/[0.035]">
            <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-gray-400">
              Current
            </p>
            <p
              className="mt-1 text-sm font-bold tabular-nums text-gray-950 dark:text-white"
              title={`${appVersion} / ${buildVersion}`}
            >
              {appVersion}
            </p>
            <p className="mt-0.5 truncate text-[10px] font-semibold text-gray-500 dark:text-white/40" title={buildVersion}>
              {appBuildLabel}
            </p>
          </div>
          <div className="rounded-xl border border-black/6 bg-black/[0.025] px-3 py-2 dark:border-white/8 dark:bg-white/[0.035]">
            <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-gray-400">
              Latest
            </p>
            <p className="mt-1 truncate text-sm font-bold text-gray-950 dark:text-white">
              {latest?.version ?? "--"}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)]">
        <div className="min-w-0 rounded-2xl border border-black/6 bg-black/[0.018] p-3 dark:border-white/8 dark:bg-white/[0.025]">
          <div className="space-y-3">
            {latest ? <PatchNoteCard note={latest} isLatest /> : null}

            {recentPatchNotes.length > 0 ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3 px-1 pt-1">
                  <h3 className="text-sm font-semibold text-gray-950 dark:text-white">
                    Recent releases
                  </h3>
                  <span className="text-[11px] font-semibold text-gray-400">
                    {recentPatchNotes.length} shown
                  </span>
                </div>
                {recentPatchNotes.map((note) => (
                  <PatchNoteCard key={note.version} note={note} compact />
                ))}
              </div>
            ) : null}

            {olderPatchNotes.length > 0 ? (
              <details className="rounded-xl border border-black/6 bg-white/40 p-3 dark:border-white/8 dark:bg-white/[0.03]">
                <summary className="cursor-pointer select-none text-sm font-semibold text-gray-900 dark:text-white">
                  Older releases ({olderPatchNotes.length})
                </summary>
                <div className="mt-3 space-y-3">
                  {olderPatchNotes.map((note) => (
                    <PatchNoteCard key={note.version} note={note} compact />
                  ))}
                </div>
              </details>
            ) : null}
          </div>
        </div>

        <aside className="min-w-0 rounded-2xl border border-black/6 bg-black/[0.018] p-3 dark:border-white/8 dark:bg-white/[0.025]">
          <div className="mb-3">
            <h3 className="text-sm font-semibold text-gray-950 dark:text-white">Roadmap</h3>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-white/45">
              Only concrete features that are not already live.
            </p>
          </div>

          <div className="space-y-2">
            {roadmapItems.map((item) => (
              <div
                key={item.title}
                className="rounded-xl border border-black/6 bg-white/55 p-2.5 dark:border-white/8 dark:bg-white/[0.035]"
              >
                <div className="flex items-center justify-between gap-2">
                  <h4 className="truncate text-sm font-semibold text-gray-950 dark:text-white">
                    {item.title}
                  </h4>
                  <span
                    className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusClasses(
                      item.status
                    )}`}
                  >
                    {item.status}
                  </span>
                </div>
                <p className="mt-1 text-xs leading-4 text-gray-500 dark:text-white/48">
                  {item.summary}
                </p>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </section>
  );
}
