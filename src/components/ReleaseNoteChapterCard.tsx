import { CalendarDays, CheckCircle2 } from "lucide-react";
import type { PatchNoteTone } from "@/lib/patch-notes";
import type { ReleaseNoteChapter } from "@/lib/release-notes";

function toneClasses(tone: PatchNoteTone): string {
  if (tone === "new") {
    return "border-emerald-400/22 bg-emerald-400/[0.08] text-emerald-700 dark:text-emerald-200";
  }
  if (tone === "fixed") {
    return "border-sky-400/22 bg-sky-400/[0.08] text-sky-700 dark:text-sky-200";
  }
  if (tone === "system") {
    return "border-violet-400/22 bg-violet-400/[0.08] text-violet-700 dark:text-violet-200";
  }
  return "border-amber-400/24 bg-amber-400/[0.08] text-amber-700 dark:text-amber-200";
}

function formatToneLabel(tone: PatchNoteTone): string {
  if (tone === "new") return "New";
  if (tone === "fixed") return "Fixed";
  if (tone === "system") return "System";
  return "Improved";
}

export default function ReleaseNoteChapterCard({
  note,
  isLatest = false,
}: {
  note: ReleaseNoteChapter;
  isLatest?: boolean;
}) {
  return (
    <article
      className={`min-w-0 overflow-hidden rounded-2xl border p-3.5 shadow-sm shadow-black/5 dark:shadow-none sm:p-4 ${
        isLatest
          ? "border-emerald-400/20 bg-emerald-400/[0.055] dark:border-emerald-300/14 dark:bg-emerald-300/[0.045]"
          : "border-black/6 bg-white/55 dark:border-white/8 dark:bg-white/[0.035]"
      }`}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="rounded-full border border-black/6 bg-black/[0.035] px-2.5 py-1 text-[11px] font-bold tabular-nums text-gray-900 dark:border-white/8 dark:bg-white/[0.055] dark:text-white">
          {note.version}
        </span>
        <span
          className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] ${toneClasses(
            note.tone
          )}`}
        >
          {formatToneLabel(note.tone)}
        </span>
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-400">
          <CalendarDays className="h-3 w-3" aria-hidden="true" />
          {note.releasedAt}
        </span>
      </div>

      <div className="mt-3 min-w-0">
        <h3 className="text-base font-bold tracking-tight text-gray-950 dark:text-white">
          {note.title}
        </h3>
        <p className="mt-1 max-w-4xl text-sm leading-5 text-gray-500 dark:text-white/50">
          {note.summary}
        </p>
      </div>

      <div className={`mt-4 grid gap-2.5 ${isLatest ? "lg:grid-cols-2" : "xl:grid-cols-2"}`}>
        {note.sections.map((section) => (
          <section
            key={section.title}
            className="min-w-0 rounded-xl border border-black/6 bg-black/[0.02] p-3 dark:border-white/8 dark:bg-black/10"
          >
            <div className="flex items-center gap-2">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg border border-violet-400/15 bg-violet-400/[0.08] text-violet-600 dark:text-violet-200">
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
              <h4 className="text-[12px] font-bold text-gray-900 dark:text-white/88">
                {section.title}
              </h4>
            </div>
            <ul className="mt-2.5 grid gap-2 text-[12px] leading-5 text-gray-500 dark:text-white/48">
              {section.highlights.map((highlight) => (
                <li key={highlight} className="flex min-w-0 gap-2">
                  <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-violet-400/70" />
                  <span className="min-w-0">{highlight}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </article>
  );
}
