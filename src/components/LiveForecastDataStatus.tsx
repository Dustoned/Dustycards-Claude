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
  { key: "1.5x-30d", label: "1.5x / 30d", minimum: 40 },
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

  const next30d = formatExpectedDate(tracking.next30dMaturesAt ?? null);
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
            {tracking.observations.toLocaleString("en-US")} measurements · {tracking.independentPredictions.toLocaleString("en-US")} independent calls
          </span>
        </span>
        <span className="shrink-0 text-[9px] font-semibold text-white/32">Details</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-white/28 transition-transform group-open:rotate-180" />
      </summary>

      <div className="border-t border-white/7 px-3 pb-3 pt-2.5">
        <div className="grid grid-cols-2 gap-1.5 min-[420px]:grid-cols-3">
          {[
            ["30-day horizon", `${tracking.pending30d ?? 0} active · ${tracking.complete30d ?? 0} ready`],
            ["90-day horizon", `${tracking.pending90d} active · ${tracking.complete90d} ready`],
            ["180-day horizon", `${tracking.pending180d} active · ${tracking.complete180d} ready`],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg border border-white/6 bg-white/[0.025] px-2 py-2">
              <p className="text-[8px] font-bold uppercase tracking-[0.1em] text-white/28">{label}</p>
              <p className="mt-1 text-[10px] font-bold tabular-nums text-white/68">{value}</p>
            </div>
          ))}
        </div>

        <div className="mt-2 grid grid-cols-3 gap-1.5">
          {[
            ["Correct", tracking.meaningfulCorrect90d, "text-emerald-200"],
            ["Wrong", tracking.meaningfulWrong90d, "text-rose-200"],
            ["Small move", tracking.smallMove90d, "text-white/58"],
          ].map(([label, value, tone]) => (
            <div key={String(label)} className="rounded-lg border border-white/6 bg-white/[0.025] px-2 py-1.5">
              <p className={`text-[12px] font-black tabular-nums ${tone}`}>
                {Number(value).toLocaleString("en-US")}
              </p>
              <p className="mt-0.5 text-[8px] font-bold uppercase tracking-[0.08em] text-white/30">
                {label}
              </p>
            </div>
          ))}
        </div>
        <p className="mt-1.5 text-[8px] leading-3.5 text-white/28">
          A directional result only scores after at least 15% and EUR 10 movement. Smaller changes stay neutral.
        </p>

        <div className="mt-2.5 space-y-2">
          {TARGET_GATES.map((target) => {
            const targetSummary = forecast.targets[target.key];
            const completed = targetSummary?.samples ?? 0;
            const hits = targetSummary?.hits ?? 0;
            const misses = Math.max(0, completed - hits);
            const width = Math.min(100, (completed / target.minimum) * 100);
            const calibrated =
              targetSummary?.status === "calibrated" && targetSummary.interval != null;
            return (
              <div key={target.key}>
                <div className="flex items-start justify-between gap-3 text-[9px]">
                  <span className="font-semibold text-white/52">{target.label}</span>
                  <span className="text-right tabular-nums text-white/36">
                    <strong className="block font-semibold text-sky-100/62">
                      {calibrated
                        ? `${Math.round(targetSummary.interval!.estimate * 100)}% probability`
                        : completed > 0
                          ? `Learning · ${completed} of ${target.minimum} complete`
                          : `Learning · ${target.minimum} outcomes needed`}
                    </strong>
                    {completed > 0 ? (
                      <small className="mt-0.5 block text-[8px] font-medium text-white/28">
                        {hits} correct · {misses} missed
                      </small>
                    ) : null}
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

        {next30d || next90d || next180d ? (
          <div className="mt-2.5 flex items-start gap-2 rounded-lg border border-violet-300/10 bg-violet-400/[0.045] px-2.5 py-2 text-[9px] leading-4 text-white/42">
            <Clock3 className="mt-0.5 h-3 w-3 shrink-0 text-violet-200/54" />
            <span>
              {[
                next30d ? `Next 30-day result expected ${next30d}.` : null,
                next90d ? `Next 90-day result expected ${next90d}.` : null,
                next180d ? `Next 180-day result expected ${next180d}.` : null,
              ]
                .filter(Boolean)
                .join(" ")}
            </span>
          </div>
        ) : null}

        {(tracking.insufficient90d > 0 || tracking.insufficient180d > 0) && (
          <p className="mt-2 text-[9px] leading-4 text-amber-100/45">
            {tracking.insufficient90d + tracking.insufficient180d} matured measurements lacked enough continuous price evidence and are excluded from probabilities.
          </p>
        )}
        <p className="mt-2 text-[9px] leading-4 text-white/28">
          Multiplier rows measure 1.5x, 2x and 3x targets. Active calls score only after their horizon ends.
        </p>
      </div>
    </details>
  );
}
