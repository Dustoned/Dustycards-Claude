import { appBuildLabel, appVersion, buildVersion } from "@/lib/app-version";
import { BookOpen, Sparkles } from "lucide-react";
import ReleaseNoteChapterCard from "@/components/ReleaseNoteChapterCard";
import { releaseNotes, roadmapItems } from "@/lib/release-notes";

const RECENT_RELEASE_COUNT = 5;

function statusClasses(status: string): string {
  if (status === "Next") return "border-emerald-400/22 bg-emerald-400/[0.08] text-emerald-700 dark:text-emerald-200";
  return "border-white/10 bg-white/[0.04] text-gray-500 dark:text-white/55";
}

export default function SettingsUpdatesPanel() {
  const latest = releaseNotes[0] ?? null;
  const recentReleases = releaseNotes.slice(1, RECENT_RELEASE_COUNT);
  const olderReleases = releaseNotes.slice(RECENT_RELEASE_COUNT);

  return (
    <section className="settings-panel glass min-w-0 rounded-2xl p-5 shadow-md shadow-black/5 sm:p-6">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-xl border border-violet-400/15 bg-violet-400/[0.08] text-violet-600 dark:text-violet-200">
              <BookOpen className="h-4 w-4" aria-hidden="true" />
            </span>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">
              What’s new in DustyCards
            </h2>
          </div>
          <p className="mt-0.5 max-w-2xl text-sm text-gray-500 dark:text-white/45">
            Finished features grouped into readable release chapters. Repeated hotfixes are combined into their final result.
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
              Latest chapter
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
            {latest ? <ReleaseNoteChapterCard note={latest} isLatest /> : null}

            {recentReleases.length > 0 ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3 px-1 pt-1">
                  <h3 className="text-sm font-semibold text-gray-950 dark:text-white">
                    Feature chapters
                  </h3>
                  <span className="text-[11px] font-semibold text-gray-400">
                    {recentReleases.length} recent
                  </span>
                </div>
                {recentReleases.map((note) => (
                  <ReleaseNoteChapterCard key={note.version} note={note} />
                ))}
              </div>
            ) : null}

            {olderReleases.length > 0 ? (
              <details className="rounded-xl border border-black/6 bg-white/40 p-3 dark:border-white/8 dark:bg-white/[0.03]">
                <summary className="flex cursor-pointer select-none items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
                  <Sparkles className="h-4 w-4 text-violet-500 dark:text-violet-300" aria-hidden="true" />
                  Earlier feature chapters ({olderReleases.length})
                </summary>
                <div className="mt-3 space-y-3">
                  {olderReleases.map((note) => (
                    <ReleaseNoteChapterCard key={note.version} note={note} />
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
