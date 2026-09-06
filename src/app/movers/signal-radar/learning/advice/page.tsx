import Link from "next/link";
import CachedImage from "@/components/CachedImage";
import { db } from "@/lib/db";
import { requirePageAdmin } from "@/lib/page-auth";
import { getServerUserSettings } from "@/lib/user-settings-server";
import { ADVICE_THRESHOLDS, adviceFamily } from "@/lib/advice-learning";
import { BUY_SIGNAL_MODEL_VERSION, getBuySignalModelVersionFallback } from "@/lib/buy-signal";

export const dynamic="force-dynamic";
const base="/movers/signal-radar/learning/advice";
const panel="rounded-2xl border border-white/10 bg-white/[0.025] p-5";
const colors={buy:"text-emerald-200 bg-emerald-500/10",hold:"text-violet-200 bg-violet-500/10",sell:"text-amber-200 bg-amber-500/10"};
const pct=(value:number|null)=>value==null?"—":`${value.toFixed(1)}%`;
const day=(value:Date)=>value.toISOString().slice(0,10);

export default async function AdviceLearningPage({searchParams}:{searchParams:Promise<{context?:string;origin?:string;horizon?:string;label?:string;result?:string;sample?:string;page?:string}>}) {
  const user=await requirePageAdmin(base);
  const [params,settings,cutoffSetting,statusSetting]=await Promise.all([searchParams,getServerUserSettings(user.id),db.appSetting.findUnique({where:{key:"advice-validation-cutoff"}}),db.appSetting.findUnique({where:{key:"advice-learning-status"}})]);
  const context=params.context==="owned"?"owned":"market";
  const origin=context==="market" && params.origin==="replay"?"replay":"live";
  const horizon=[30,90,180].includes(Number(params.horizon))?Number(params.horizon):30;
  const label=["buy","strong_buy","hold","sell","strong_sell"].includes(params.label??"")?params.label!:"all";
  const result=["correct","missed","pending","insufficient"].includes(params.result??"")?params.result!:"all";
  const sample=params.sample==="development"?"development":"validation";
  const page=Math.max(1,Math.min(10000,parseInt(params.page??"1",10)||1));
  const cutoff=cutoffSetting?new Date(cutoffSetting.value):new Date(0);
  const link=(change:Record<string,string|number>)=>`${base}?${new URLSearchParams({context,origin,horizon:String(horizon),label,result,sample,page:"1",...Object.fromEntries(Object.entries(change).map(([key,value])=>[key,String(value)]))})}`;
  const baseObservation={owner_id:context==="owned"?user.id:null,context,origin,...(!settings.onePieceLibraryEnabled?{game:{in:["pokemon","pokemon-jp"]}}:{}),...(origin==="replay" && sample==="validation"?{observed_at:{gte:cutoff}}:{})};
  // A freshly bumped model has no journal yet; show the version it replaced
  // (labelled below) rather than an empty page while the batch rebuilds.
  const currentVersionCount=await db.adviceObservation.count({where:{...baseObservation,model_version:BUY_SIGNAL_MODEL_VERSION}});
  const fallbackVersion=getBuySignalModelVersionFallback(BUY_SIGNAL_MODEL_VERSION);
  const modelVersion=currentVersionCount===0 && fallbackVersion?fallbackVersion:BUY_SIGNAL_MODEL_VERSION;
  const observation={...baseObservation,model_version:modelVersion};
  const where={observation,horizon_days:horizon,...(origin==="replay" && sample==="development"?{due_at:{lt:cutoff}}:{})};
  const families={buy:["buy","strong_buy"],hold:["hold"],sell:["sell","strong_sell"]};
  const labelSets={...families,strong_buy:["strong_buy"],strong_sell:["strong_sell"]};
  const filtered={...where,observation:{...observation,...(label!=="all"?{label:{in:labelSets[label as keyof typeof labelSets]}}:{})},...(result==="correct"||result==="missed"?{status:"complete",correct:result==="correct"}:result!=="all"?{status:result}:{})};
  const [rows,count,stats]=await Promise.all([
    db.adviceOutcome.findMany({where:filtered,include:{observation:true},orderBy:[{observation:{observed_at:"desc"}},{id:"desc"}],skip:(page-1)*24,take:24}),
    db.adviceOutcome.count({where:filtered}),
    Promise.all(Object.entries(families).map(async([family,labels])=>{
      const filter={...where,observation:{...observation,label:{in:labels}}};
      const [groups,baseline]=await Promise.all([db.adviceOutcome.groupBy({by:["status","correct"],where:filter,_count:{_all:true},_avg:{return_pct:true}}),db.adviceOutcome.count({where:{...filter,status:"complete",correct:{not:null},return_pct:{gt:-ADVICE_THRESHOLDS[horizon]}}})]);
      const correct=groups.filter(g=>g.status==="complete"&&g.correct===true).reduce((n,g)=>n+g._count._all,0);
      const missed=groups.filter(g=>g.status==="complete"&&g.correct===false).reduce((n,g)=>n+g._count._all,0);
      const scored=correct+missed;
      return {family,correct,missed,scored,pending:groups.filter(g=>g.status==="pending").reduce((n,g)=>n+g._count._all,0),insufficient:groups.filter(g=>g.status==="insufficient").reduce((n,g)=>n+g._count._all,0),accuracy:scored?correct/scored*100:null,baseline:scored?baseline/scored*100:null,average:scored?groups.reduce((n,g)=>n+(g._avg.return_pct??0)*g._count._all,0)/scored:null};
    })),
  ]);
  const cards = await db.card.findMany({
    where: { id: { in: [...new Set(rows.map(row => row.observation.card_id))] } },
    select: { id: true, image_url: true, card_number: true, printed_card_number: true, episode: { select: { name: true } } },
  });
  const cardsById = new Map(cards.map(card => [card.id, card]));
  let progress:{at?:string;finished?:boolean}|null=null;
  try{progress=JSON.parse(statusSetting?.value??"null");}catch{/* Optional progress metadata. */}
  function choice(title:string,items:{label:string;value:string|number}[],key:string,current:string|number) {
    return <nav aria-label={title} className="flex flex-wrap gap-2">{items.map(item=><Link prefetch={false} key={item.value} href={link({[key]:item.value})} aria-current={current===item.value?"page":undefined} className={`rounded-xl border px-4 py-2 text-sm ${current===item.value?"border-violet-400/40 bg-violet-500/20 text-white":"border-white/10 text-white/50"}`}>{item.label}</Link>)}</nav>;
  }
  return <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 text-white/85 sm:px-6 sm:py-10">
    <Link href="/movers/signal-radar/learning" className="text-sm text-white/50">← Prediction journal</Link>
    <header className="rounded-3xl border border-violet-300/15 bg-gradient-to-br from-violet-500/15 to-transparent p-6 sm:p-8"><p className="text-xs font-semibold uppercase tracking-widest text-violet-200">Advice journal</p><h1 className="mt-3 text-3xl font-bold">Buy, Hold &amp; Sell</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-white/55">Track the original advice, the evidence behind it and what happened next. Market calls and your collection stay separate.</p></header>
    {modelVersion!==BUY_SIGNAL_MODEL_VERSION?<p className={`${panel} text-sm leading-6 text-white/60`} data-advice-model-fallback={modelVersion}>Showing results from the previous model <span className="font-semibold text-white/80">{modelVersion}</span>. The current model <span className="font-semibold text-white/80">{BUY_SIGNAL_MODEL_VERSION}</span> has no entries in this selection yet; its journal is rebuilt in background batches and takes over automatically once entries exist.</p>:null}
    {choice("Advice context",[{label:"Market",value:"market"},{label:"My collection",value:"owned"}],"context",context)}
    {context==="market"?choice("Advice evidence",[{label:"Recorded advice",value:"live"},{label:"Historical replay",value:"replay"}],"origin",origin):<p className="text-sm text-white/50">Only your saved collection advice is shown. Purchase cost and grading are frozen when recorded; personal advice is never reconstructed retroactively.</p>}
    {origin==="replay"?<section className={panel}><h2 className="font-semibold">Reconstructed, not past live advice</h2><p className="mt-2 text-sm leading-6 text-white/55">The current model uses all available EN NM history up to each entry, with current rarity and set metadata. Historical pull rates, owned costs, grading and external comparisons are omitted because their past state is not recorded. Entries are at least 180 days apart per card.</p><div className="mt-4">{choice("Replay period",[{label:"Later dates · validation",value:"validation"},{label:"Earlier dates · development",value:"development"}],"sample",sample)}</div><p className="mt-3 text-xs text-white/40">Split: {cutoffSetting ? day(cutoff) : "pending first batch"}. Earlier checks finish before this date; later entries start on or after it. Crossing checks are excluded. No model weights have been tuned on these results.</p></section>:null}
    {choice("Advice horizon",[30,90,180].map(value=>({label:`${value} days`,value})),"horizon",horizon)}
    <section aria-label="Advice label results" className="grid gap-4 md:grid-cols-3">{stats.map(stat=><div key={stat.family} className={panel}><span className={`inline-flex rounded-lg px-3 py-1 text-sm font-bold uppercase ${colors[stat.family as keyof typeof colors]}`}>{stat.family}</span><p className="mt-4 text-3xl font-bold">{pct(stat.accuracy)} <span className="text-sm font-normal text-white/40">correct</span></p><p className="mt-2 text-sm">{stat.correct} correct · {stat.missed} missed</p><p className="mt-1 text-xs text-white/45">{stat.pending} watching · {stat.insufficient} need data</p><dl className="mt-4 border-t border-white/10 pt-3 text-xs text-white/50"><div className="flex justify-between gap-3"><dt>Average price move</dt><dd>{pct(stat.average)}</dd></div><div className="mt-2 flex justify-between gap-3"><dt>Hold reference</dt><dd>{pct(stat.baseline)}</dd></div></dl><p className="mt-4 text-xs leading-5 text-white/50">{stat.scored<20?`Need more evidence: ${stat.scored}/20 completed checks before drawing conclusions.`:stat.missed>stat.correct?"Review this label: more misses than correct checks in this selection.":"Compare later-date results and source coverage before changing the model."}</p></div>)}</section>
    <details className={panel}><summary className="cursor-pointer font-semibold">How correctness is measured</summary><p className="mt-3 text-sm leading-6 text-white/55">For {horizon} days: Buy needs a rise of at least {ADVICE_THRESHOLDS[horizon]}%; Sell needs a fall of at least {ADVICE_THRESHOLDS[horizon]}%; Hold succeeds if the fall stays smaller than {ADVICE_THRESHOLDS[horizon]}%. Strong labels use their family’s rule. Hold means keeping a card, so rising prices do not count as a failed hold.</p><p className="mt-2 text-sm leading-6 text-white/55">A fresh endpoint and observations spanning the period are required. Missing prices never count as misses. Results use the same source, grade and native currency as the entry, before fees; they measure quoted price movement, not realised trading profit. Hit rates are checks, not unique cards or probabilities of profit. The Hold reference applies the Hold rule to the same prices; its easier target means a higher percentage does not establish a better trading strategy.</p></details>
    <section><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">Saved advice · {count.toLocaleString("en-GB")}</h2>{choice("Advice labels",["all","strong_buy","buy","hold","sell","strong_sell"].map(value=>({label:value==="all"?"All labels":value.replace("_"," ").toUpperCase(),value})),"label",label)}</div>
    <div className="mb-4">{choice("Advice results",[{label:"All results",value:"all"},{label:"Correct",value:"correct"},{label:"Missed",value:"missed"},{label:"Watching",value:"pending"},{label:"Needs data",value:"insufficient"}],"result",result)}</div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{rows.map(row => {
      const entry = row.observation;
      const card = cardsById.get(entry.card_id);
      const href = card ? `/movers/signal-radar/${encodeURIComponent(entry.card_id)}?game=${encodeURIComponent(entry.game)}` : null;
      let evidence: {reasons?: string[]; warnings?: string[]; metrics?: {history_points?: number}} = {};
      try { evidence = JSON.parse(entry.evidence_json); } catch { /* Preserve entries with unavailable evidence. */ }
      const artwork = <div className="relative flex h-64 items-center justify-center bg-gradient-to-b from-violet-500/10 to-transparent p-5">
        {card?.image_url ? <div className="relative h-full w-40 transition-transform duration-200 group-hover:scale-[1.03]">
          <CachedImage sourceUrl={card.image_url} alt={entry.card_name} fill sizes="160px" className="object-contain drop-shadow-xl" />
        </div> : <div className="flex aspect-[5/7] h-full items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] p-5 text-center text-xs text-white/40">Image unavailable</div>}
      </div>;
      return <article key={row.id} className="min-w-0 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.025]">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4">
          <span className={`rounded-lg px-3 py-1 text-xs font-bold ${colors[adviceFamily(entry.label)]}`}>{entry.label.replaceAll("_", " ").toUpperCase()}</span>
          <span className={`text-xs font-medium ${row.status === "complete" ? row.correct ? "text-emerald-200" : "text-amber-200" : "text-white/55"}`}>{row.status === "complete" ? row.correct ? "Correct" : "Missed" : row.status === "pending" ? "Watching" : "Needs data"}</span>
        </div>
        {href ? <Link prefetch={false} href={href} aria-label={`Open ${entry.card_name}`} className="group block rounded-xl focus-visible:outline-2 focus-visible:outline-violet-400">{artwork}</Link> : artwork}
        <div className="space-y-4 px-4 pb-4">
          <div>
            <h3 className="font-bold leading-snug">{href ? <Link prefetch={false} href={href} className="hover:text-violet-200">{entry.card_name}</Link> : entry.card_name}</h3>
            {card ? <p className="mt-1 text-xs text-white/45">{card.episode.name}{card.printed_card_number || card.card_number ? ` · #${card.printed_card_number || card.card_number}` : ""}</p> : <p className="mt-1 text-xs text-white/45">Archived card</p>}
            <p className="mt-2 text-xs text-white/55">{entry.grade_label ?? "Raw EN NM"} · {entry.confidence} confidence · {Math.round(entry.score)}/100</p>
          </div>
          <dl className="grid grid-cols-2 gap-3 rounded-xl bg-black/15 p-3 text-sm tabular-nums">
            <div><dt className="text-xs text-white/40">Entry · {entry.currency}</dt><dd className="mt-1 font-semibold">{entry.entry_price.toFixed(2)}</dd></div>
            <div><dt className="text-xs text-white/40">After {horizon} days</dt><dd className="mt-1 font-semibold">{row.end_price == null ? "—" : row.end_price.toFixed(2)} <span className="text-xs text-white/55">{row.return_pct == null ? "" : `(${pct(row.return_pct)})`}</span></dd></div>
          </dl>
          <p className="line-clamp-2 text-xs leading-5 text-white/55">{evidence.reasons?.[0] || "No recorded reasons"}</p>
          <details className="border-t border-white/10 pt-3 text-xs text-white/50">
            <summary className="cursor-pointer font-medium text-white/65">Advice details</summary>
            <div className="mt-3 space-y-2 leading-5">
              {evidence.reasons?.length ? <p>{evidence.reasons.join(" · ")}</p> : null}
              {evidence.warnings?.length ? <p className="text-amber-200/70">{evidence.warnings.join(" · ")}</p> : null}
              <p>{origin === "replay" ? "Replayed" : "Recorded"} {day(entry.observed_at)} · Due {day(row.due_at)}</p>
              <p>{entry.source} · {row.observed_days} observed days<br/>{entry.model_version} · {evidence.metrics?.history_points ?? 0} history points at entry</p>
            </div>
          </details>
        </div>
      </article>;
    })}</div>
    {!rows.length?<p className={`${panel} text-sm text-white/50`}>{origin==="live"?"New advice is now recorded automatically. Results appear as each check reaches its due date.":"No historical checks in this selection yet. The archive is processed in background batches; sparse history stays unscored."}</p>:null}
    <nav aria-label="Advice pages" className="mt-5 flex justify-between text-sm">{page>1?<Link href={link({page:page-1})}>← Previous</Link>:<span/>}<span className="text-white/40">Page {page}</span>{page*24<count?<Link href={link({page:page+1})}>Next →</Link>:<span/>}</nav></section>
    <p className="text-xs text-white/35">{progress?.at?`Background history batch: ${progress.at.slice(0,16).replace("T"," ")} UTC.`:"The first background history batch is pending."} New outcomes update these comparisons; they do not automatically rewrite model weights.</p>
  </main>;
}
