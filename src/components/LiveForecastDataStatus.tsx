import { ChevronDown, Clock3, Database } from "lucide-react";
import type {
  ExternalCardForecastSummary,
  ExternalForecastTargetKey,
} from "@/lib/external-signal-forecast-store";

const TARGET_GATES: Array<{
  key: ExternalForecastTargetKey;
  label: string;
  minimum: number;
}> = [
  { key: "1.5x-90d", label: "1.5x / 90d", minimum: 50 },
  { key: "2x-90d", label: "2x / 90d", minimum: 100 },
  { key: "3x-180d", label: "3x / 180d", minimum: 200 },
];

function cx(...classes: Array<string | null | undefined | false>) {
  return classes.filter(Boolean).join(" ");
}

function formatExpectedDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Europe/Amsterdam",
  }).format(date);
}

export default function LiveForecastDataStatus({
  forecast,
  className,
}: {
  forecast: ExternalCardForecastSummary | null | undefined;
  className?: string;
}) {
  const tracking = forecast?.tracking;
  if (!forecast || !tracking) return null;

  const activePredictions = Math.max(tracking.pending90d, tracking.pending180d);
  const next90d = formatExpectedDate(tracking.next90dMaturesAt);
  const next180d = formatExpectedDate(tracking.next180dMaturesAt);

  return (
    <details
      className={cx(
        "group overflow-hidden rounded-xl border border-sky-300/12 bg-black/18",
        className
      )}
      data-forecast-tracking-status
    >
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2.5 px-3 py-2 marker:hidden [&::-webkit-details-marker]:hidden">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-sky-300/12 bg-sky-400/[0.08] text-sky-200/68">
          <Database className="h-3.5 w-3.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[9px] font-bold uppercase tracking-[0.12em] text-sky-100/56">
            Live data status
          </span>
          <span className="mt-0.5 block truncate text-[10px] tabular-nums text-white/48">
            {tracking.observations} logged · {tracking.independentPredictions} independent · {activePredictions} active
          </span>
        </span>
        <span className="shrink-0 text-[9px] font-semibold text-white/32">Details</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-white/28 transition-transform group-open:rotate-180" />
      </summary>

      <div className="border-t border-white/7 px-3 pb-3 pt-2.5">
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          {[
            ["All observations", tracking.observations],
            ["Independent calls", tracking.independentPredictions],
            ["90d", `${tracking.complete90d} ready · ${tracking.pending90d} active`],
            ["180d", `${tracking.complete180d} ready · ${tracking.pending180d} active`],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg border border-white/6 bg-white/[0.025] px-2 py-2">
              <p className="text-[8px] font-bold uppercase tracking-[0.1em] text-white/28">{label}</p>
              <p className="mt-1 text-[10px] font-bold tabular-nums text-white/68">{value}</p>
            </div>
          ))}
        </div>

        <div className="mt-2.5 space-y-2">
          {TARGET_GATES.map((target) => {
            const targetSummary = forecast.targets[target.key];
            const completed = targetSummary?.samples ?? 0;
            const hits = targetSummary?.hits ?? 0;
            const misses = Math.max(0, completed - hits);
            const width = Math.min(100, (completed / target.minimum) * 100);
            return (
              <div key={target.key}>
                <div className="flex items-center justify-between gap-3 text-[9px]">
                  <span className="font-semibold text-white/52">{target.label}</span>
                  <span className="tabular-nums text-white/36">
                    {completed > 0
                      ? `${hits} correct · ${misses} missed · ${target.minimum} needed`
                      : `0 completed · ${target.minimum} needed for probability`}
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/[0.055]">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-sky-400/70 to-violet-400/75 transition-[width]"
                    style={{ width: `${width}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {next90d || next180d ? (
          <div className="mt-2.5 flex items-start gap-2 rounded-lg border border-violet-300/10 bg-violet-400/[0.045] px-2.5 py-2 text-[9px] leading-4 text-white/42">
            <Clock3 className="mt-0.5 h-3 w-3 shrink-0 text-violet-200/54" />
            <span>
              {next90d ? `Next 90-day result expected ${next90d}.` : ""}
              {next90d && next180d ? " " : ""}
              {next180d ? `Next 180-day result expected ${next180d}.` : ""}
            </span>
          </div>
        ) : null}

        {(tracking.insufficient90d > 0 || tracking.insufficient180d > 0) && (
          <p className="mt-2 text-[9px] leading-4 text-amber-100/45">
            {tracking.insufficient90d + tracking.insufficient180d} matured measurements lacked enough continuous price evidence and are excluded from probabilities.
          </p>
        )}
        <p className="mt-2 text-[9px] leading-4 text-white/28">
          “Correct” means the full multiplier target was reached, not just a small price move. “Completed” means the full horizon finished with enough price coverage; active predictions cannot be scored yet.
        </p>
      </div>
    </details>
  );
}
