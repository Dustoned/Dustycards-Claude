import Link from "next/link";
import { ArrowLeft, Activity, Target, CheckCircle2, Clock3 } from "lucide-react";
import { db } from "@/lib/db";
import { requirePageUser } from "@/lib/page-auth";
import { getServerUserSettings } from "@/lib/user-settings-server";
import { summarizeLearning } from "@/lib/signal-learning";

export const dynamic = "force-dynamic";
const base = "/movers/signal-radar/learning";
const panel = "rounded-2xl border border-white/10 bg-white/[0.025] p-4 sm:p-6";
const number = (value: number | null) => value == null ? "—" : value.toLocaleString("en-GB");
const percent = (value: number | null) => value == null ? "Not available" : `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
const date = (value: Date) => value.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const outlooks: Record<string, string> = { strong_up: "Strong rise", modest_up: "Modest rise", down: "Decline", flat: "Stable", sideways: "Stable" };

export default async function LearningPage({ searchParams }: { searchParams: Promise<{ horizon?: string; result?: string; page?: string; outcome?: string }> }) {
  const user = await requirePageUser(base);
  const settings = await getServerUserSettings(user.id);
  const params = await searchParams;
  const visibility = settings.onePieceLibraryEnabled ? {} : { game: "pokemon" };
  const focused = params.outcome ? await db.externalSignalOutcome.findFirst({ where: { id: params.outcome, entry_observation: visibility }, include: { entry_observation: true } }) : null;
  const horizon = [30, 90, 180].includes(Number(params.horizon)) ? Number(params.horizon) : focused?.horizon_days ?? 30;
  const result = ["correct", "missed", "pending", "insufficient"].includes(params.result ?? "") ? params.result! : "all";
  const page = Math.min(10000, Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1));
  const where = { horizon_days: horizon, entry_observation: visibility };
  const filtered = { ...where, ...(result === "correct" || result === "missed" ? { status: "complete", meaningful_direction_hit: result === "correct" } : result !== "all" ? { status: result } : {}) };
  const [groups, rows, count] = await Promise.all([
    db.externalSignalOutcome.groupBy({ by: ["horizon_days", "status", "meaningful_direction_hit"], where: { entry_observation: visibility }, _count: { _all: true } }),
    db.externalSignalOutcome.findMany({ where: filtered, orderBy: [{ updated_at: "desc" }, { id: "desc" }], take: 24, skip: (page - 1) * 24, include: { entry_observation: true } }),
    db.externalSignalOutcome.count({ where: filtered }),
  ]);
  const stats = summarizeLearning(groups.filter(row => row.horizon_days === horizon));
  const href = (h = horizon, r = result, p = 1) => `${base}?horizon=${h}&result=${r}&page=${p}`;
  function outcomeCard(row: (typeof rows)[number], highlighted = false) {
    const entry = row.entry_observation;
    const verdict = row.status === "complete" ? row.meaningful_direction_hit === true ? "Correct" : row.meaningful_direction_hit === false ? "Missed" : "Unscored" : row.status === "pending" ? "Watching" : "Insufficient data";
    const tone = verdict === "Correct" ? "text-emerald-200 bg-emerald-400/10" : verdict === "Missed" ? "text-amber-200 bg-amber-400/10" : "text-violet-200 bg-violet-400/10";
    const maturity = new Date(entry.observed_at.getTime() + row.horizon_days * 86400000);
    return <article key={row.id} id={`${highlighted ? "focused" : "outcome"}-${row.id}`} className={`${panel} ${highlighted ? "ring-1 ring-violet-400/50" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-bold text-white">{entry.card_name}</h3><p className="mt-1 text-xs text-white/45">{entry.game === "one-piece" ? "One Piece" : "Pokémon"} · {entry.episode_code ?? "Set unknown"} {entry.card_number ? `#${entry.card_number}` : ""} · {row.horizon_days} days</p></div><span className={`rounded-full px-3 py-1 text-xs font-semibold ${tone}`}>{verdict}</span></div>
      <dl className="mt-5 grid grid-cols-2 gap-4 text-sm"><div><dt className="text-xs text-white/40">Original call</dt><dd className="mt-1 font-semibold">{entry.entry_outlook ? outlooks[entry.entry_outlook] ?? entry.entry_outlook.replaceAll("_", " ") : "Not recorded"}</dd></div><div><dt className="text-xs text-white/40">Actual move · {row.horizon_days}d</dt><dd className="mt-1 font-semibold">{row.status === "complete" ? percent(row.realized_return_pct) : "Awaiting evidence"}</dd></div><div><dt className="text-xs text-white/40">Entry price</dt><dd className="mt-1">{entry.reference_price == null ? "—" : `${entry.currency} ${entry.reference_price.toFixed(2)}`}</dd></div><div><dt className="text-xs text-white/40">End price</dt><dd className="mt-1">{row.end_reference_price == null ? "—" : `${entry.currency} ${row.end_reference_price.toFixed(2)}`}</dd></div></dl>
      {entry.entry_expected_return_pct_180 != null ? <p className="mt-4 text-xs text-white/50">Original 180-day estimate: {percent(entry.entry_expected_return_pct_180)}. This check covers {row.horizon_days} days.</p> : null}
      <div className="mt-4 border-t border-white/10 pt-3 text-xs leading-5 text-white/45"><p>Started {date(entry.observed_at)} · {row.status === "pending" ? `Check due ${date(maturity)}` : `Checked ${date(row.evaluated_at ?? row.updated_at)}`}</p><p>{row.observed_days} observed days · {Math.round(row.coverage_ratio * 100)}% coverage · {entry.model_version}</p></div>
    </article>;
  }
  return <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 text-white/85 sm:px-6 sm:py-10">
    <Link prefetch={false} href="/movers/signal-radar" className="inline-flex items-center gap-2 text-sm text-white/50 hover:text-white"><ArrowLeft className="h-4 w-4" />Signal Radar</Link>
    <header className="rounded-3xl border border-violet-300/15 bg-gradient-to-br from-violet-500/15 via-violet-500/5 to-transparent p-6 sm:p-8"><div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-violet-200"><Activity className="h-4 w-4" />Prediction journal</div><h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">What Radar is learning</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-white/55">Every saved call meets a real price check. See what worked, what missed and what still needs time.</p></header>
    {params.outcome ? <section><h2 className="mb-3 text-lg font-semibold">From your notification</h2>{focused ? outcomeCard(focused, true) : <p className={panel}>This saved result is no longer available. You can still browse the journal below.</p>}</section> : null}
    <nav aria-label="Prediction horizon" className="grid grid-cols-3 gap-2">{[30,90,180].map(h => <Link prefetch={false} key={h} href={href(h)} aria-current={horizon === h ? "page" : undefined} className={`rounded-xl border px-4 py-3 text-center text-sm font-semibold ${horizon === h ? "border-violet-400/50 bg-violet-500/20 text-violet-100" : "border-white/10 text-white/50"}`}>{h} days</Link>)}</nav>
    <section aria-label="Prediction results" className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[{ label: "Correct", value: stats.correct, icon: CheckCircle2, color: "text-emerald-200" },{ label: "Missed", value: stats.missed, icon: Target, color: "text-amber-200" },{ label: "Still watching", value: stats.pending, icon: Clock3, color: "text-violet-200" },{ label: "Hit rate", value: stats.accuracy, icon: Activity, color: "text-white" }].map(item => <div key={item.label} className={panel}><item.icon className={`h-5 w-5 ${item.color}`} /><p className={`mt-4 text-3xl font-bold tabular-nums ${item.color}`}>{number(item.value)}{item.label === "Hit rate" && item.value != null ? "%" : ""}</p><p className="mt-1 text-xs text-white/50">{item.label}</p></div>)}</section>
    <div className="grid gap-4 lg:grid-cols-2"><section className={panel}><h2 className="font-semibold">How to read this</h2><p className="mt-2 text-sm leading-6 text-white/55">Hit rate uses {number(stats.scored)} completed checks with a recorded verdict. {number(stats.insufficient)} checks have insufficient price data; {number(stats.unscored)} completed checks have no verdict. Neither counts as a miss.</p><p className="mt-2 text-xs leading-5 text-white/40">All saved model versions, for this horizon. Checks are not unique cards or a calibrated probability of future success.</p></section><section className={panel}><h2 className="font-semibold">What is being tested?</h2><p className="mt-2 text-sm leading-6 text-white/55">Whether the predicted direction held up after 30, 90 and 180 days, using meaningful price moves and observed price coverage.</p><p className="mt-2 text-xs leading-5 text-white/40">Results feed the model’s evidence and calibration checks. A new result does not mean the model automatically rewrites itself.</p></section></div>
    <section><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">Saved checks <span className="text-sm font-normal text-white/40">{number(count)}</span></h2><nav aria-label="Filter results" className="flex flex-wrap gap-2">{["all","correct","missed","pending","insufficient"].map(r => <Link prefetch={false} key={r} href={href(horizon,r)} aria-current={result === r ? "page" : undefined} className={`rounded-lg px-3 py-2 text-xs capitalize ${result === r ? "bg-violet-500/25 text-violet-100" : "bg-white/5 text-white/50"}`}>{r === "pending" ? "Watching" : r === "insufficient" ? "Needs data" : r}</Link>)}</nav></div><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{rows.map(row => outcomeCard(row))}</div>{!rows.length ? <p className={`${panel} text-center text-sm text-white/50`}>No saved checks in this view yet.</p> : null}<nav aria-label="Results pages" className="mt-5 flex items-center justify-between text-sm">{page > 1 ? <Link prefetch={false} href={href(horizon,result,page-1)}>← Previous</Link> : <span />}<span className="text-white/40">Page {page}</span>{page*24 < count ? <Link prefetch={false} href={href(horizon,result,page+1)}>Next →</Link> : <span />}</nav></section>
  </main>;
}
