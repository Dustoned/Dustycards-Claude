import { createHash, randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { buildBuySignal, BUY_SIGNAL_MODEL_VERSION, getBuySignalReference, type BuildBuySignalInput, type BuySignalResult, type BuySignalLabel } from "@/lib/buy-signal";
import { ADVICE_HORIZONS, evaluateAdvice, type AdvicePoint } from "@/lib/advice-learning";
import { loadSafeCardMarketHistoryRows } from "@/lib/card-market-history";
import { buildCardPriceHistory } from "@/lib/price-history";
import { buildAdviceReplayEntries } from "@/lib/advice-replay";
import { getPullRateInfoForSetRarity } from "@/lib/pull-rates";

const DAY = 86400000;
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
type CardIdentity = {id:string; game:string; name:string; episode_id:string; card_number:string|null; printed_card_number:string|null; cardmarket_id:string|null; cardmarket_url:string|null};
function identity(card: CardIdentity) { return {id:card.id,game:card.game,name:card.name,episodeId:card.episode_id,cardNumber:card.card_number,printedCardNumber:card.printed_card_number,cardmarketId:card.cardmarket_id,cardmarketUrl:card.cardmarket_url}; }

export async function recordAdvice(input: {card:{id:string;name:string;game:string}; signalInput:BuildBuySignalInput; signal?:BuySignalResult; ownerId?:string; copyId?:string; origin?:"live"|"replay"; now?:Date}) {
  const now = input.now ?? new Date();
  const signal = input.signal ?? buildBuySignal({...input.signalInput,now});
  const reference = getBuySignalReference(input.signalInput);
  const quoteAge = reference.fetchedAt ? now.getTime() - new Date(reference.fetchedAt).getTime() : NaN;
  if (!Number.isFinite(quoteAge) || quoteAge < 0 || quoteAge > 3 * DAY) return null;
  if (!reference.price || !Number.isFinite(reference.price) || reference.price===9001 || signal.current_value==null) return null;
  if (input.signalInput.collection_item?.grading_company && signal.market_mode!=="graded") return null;
  const origin=input.origin??"live";
  const id=hash([BUY_SIGNAL_MODEL_VERSION,input.card.id,input.ownerId??"market",input.copyId??"",reference.source,reference.label,reference.currency,now.toISOString().slice(0,10),origin]);
  const {price_history,graded_price_history,ebay_sold_graded_price_history,...features}=input.signalInput;
  const evidence=JSON.stringify({features,metrics:signal.metrics,reasons:signal.reasons,warnings:signal.warnings,historyDigest:hash([price_history,graded_price_history,ebay_sold_graded_price_history]),historyPoints:price_history.length,historyStart:price_history[0]?.date,historyEnd:price_history.at(-1)?.date,displayPrice:signal.current_value,displayCurrency:signal.currency});
  return db.adviceObservation.upsert({where:{id},update:{},create:{
    id,owner_id:input.ownerId??null,card_id:input.card.id,card_name:input.card.name,game:input.card.game,
    context:input.ownerId?"owned":"market",origin,model_version:BUY_SIGNAL_MODEL_VERSION,label:signal.label,
    score:signal.score,confidence:signal.confidence,source:reference.source,grade_label:reference.label,
    currency:reference.currency,entry_price:reference.price,observed_at:now,evidence_json:evidence,
    outcomes:{create:ADVICE_HORIZONS.map(horizon=>({horizon_days:horizon,due_at:new Date(now.getTime()+horizon*DAY)}))},
  }});
}

async function loadAdvicePoints(cardId:string, source:string, label:string|null, currency:string, now:Date):Promise<AdvicePoint[]> {
  if(source==="cm-raw") {
    const card=await db.card.findUnique({where:{id:cardId}});
    if(!card) return [];
    const rows=(await loadSafeCardMarketHistoryRows([identity(card)],{fetchedAtLte:now})).get(cardId)??[];
    return rows.flatMap(row=>row.cm_en_lowest_nm && row.cm_en_lowest_nm>0 && row.cm_en_lowest_nm!==9001?[{at:new Date(row.cm_fetched_at??row.fetched_at),value:row.cm_en_lowest_nm}]:[]);
  }
  if(source==="cm-graded") return (await db.cardGradedPriceSnapshot.findMany({where:{card_id:cardId,label:label??"",fetched_at:{lte:now}},orderBy:{fetched_at:"asc"}})).map(row=>({at:row.fetched_at,value:row.price}));
  // Keep the original native currency, grading label and source fixed: no FX or raw/graded switches.
  return (await db.cardEbaySoldGradedPriceSnapshot.findMany({where:{card_id:cardId,label:label??"",currency,source:"ebay_sold",fetched_at:{lte:now},sample_size:{gte:3}},orderBy:{fetched_at:"asc"}})).map(row=>({at:row.fetched_at,value:row.median_price}));
}

export async function evaluateAdviceOutcomes(now=new Date(),limit=200) {
  const rows=await db.adviceOutcome.findMany({where:{status:{in:["pending","insufficient"]},due_at:{lte:now},OR:[{evaluated_at:null},{evaluated_at:{lt:new Date(now.getTime()-DAY)}}]},take:limit,orderBy:[{evaluated_at:"asc"},{due_at:"asc"}],include:{observation:true}});
  const cache=new Map<string,AdvicePoint[]>();
  for(const row of rows) {
    const entry=row.observation;
    const key=JSON.stringify([entry.card_id,entry.source,entry.grade_label,entry.currency]);
    if(!cache.has(key)) cache.set(key,await loadAdvicePoints(entry.card_id,entry.source,entry.grade_label,entry.currency,now));
    const result=evaluateAdvice({label:entry.label as BuySignalLabel,entry:entry.entry_price,at:entry.observed_at,horizon:row.horizon_days,points:cache.get(key)!,now});
    await db.adviceOutcome.update({where:{id:row.id},data:{...result,evaluated_at:now}});
  }
  return rows.length;
}

// Work advances through the whole catalog in small batches; history is not truncated to a recent chart window.
export async function runAdviceLearningBatch(now=new Date(),batchSize=20) {
  const key="advice-learning-lease";
  const lease=await db.appSetting.upsert({where:{key},create:{key,value:""},update:{}});
  const expiry=Number(lease.value.split(":")[0]);
  const busy={cards:0,captured:0,replayed:0,finished:false,busy:true};
  if(expiry>now.getTime()) return busy;
  const value=`${now.getTime()+10*60_000}:${randomUUID()}`;
  const claimed=await db.appSetting.updateMany({where:{key,value:lease.value},data:{value}});
  if(!claimed.count) return busy;
  try { return await processAdviceLearningBatch(now,batchSize); }
  finally { await db.appSetting.updateMany({where:{key,value},data:{value:""}}); }
}

async function processAdviceLearningBatch(now:Date,batchSize:number) {
  await db.appSetting.upsert({where:{key:"advice-validation-cutoff"},update:{},create:{key:"advice-validation-cutoff",value:new Date(now.getTime()-180*DAY).toISOString()}});
  const cursorKey=`advice-learning-cursor:${BUY_SIGNAL_MODEL_VERSION}`;
  const cursor=(await db.appSetting.findUnique({where:{key:cursorKey}}))?.value??"";
  const cards=await db.card.findMany({where:{game:{in:["pokemon","pokemon-jp","one-piece"]},id:{gt:cursor}},orderBy:{id:"asc"},take:batchSize,include:{episode:true}});
  const histories=await loadSafeCardMarketHistoryRows(cards.map(identity),{fetchedAtLte:now});
  let captured=0,replayed=0;
  for(const card of cards) {
    const rows=(histories.get(card.id)??[]).filter(row=>row.cm_en_lowest_nm!=null && row.cm_en_lowest_nm>0 && row.cm_en_lowest_nm!==9001).sort((a,b)=>new Date(a.cm_fetched_at??a.fetched_at).getTime()-new Date(b.cm_fetched_at??b.fetched_at).getTime());
    const owners=await db.collectionCard.findMany({where:{card_id:card.id,sold_at:null},distinct:["user_id"],select:{user_id:true}});
    if(owners.length) {
      const {getCardDetailPayload}=await import("@/lib/card-detail-data");
      for(const owner of owners) if(owner.user_id) await getCardDetailPayload(card.id,owner.user_id);
    }
    const latest=rows.at(-1);
    if(!latest) continue;
    const baseInput={rarity:card.rarity,episode_name:card.episode.name,episode_code:card.episode.code,episode_release_date:card.episode.release_date};
    const history=buildCardPriceHistory(rows);
    const recent=await db.adviceObservation.findFirst({where:{card_id:card.id,owner_id:null,origin:"live",model_version:BUY_SIGNAL_MODEL_VERSION,observed_at:{gte:new Date(now.getTime()-30*DAY)}},select:{id:true}});
    if(!recent && now.getTime()-new Date(latest.cm_fetched_at??latest.fetched_at).getTime()<=3*DAY) {
      const pull=await getPullRateInfoForSetRarity({setCode:card.episode.code,rarity:card.rarity});
      const pull_rate_info=pull?{rarity_name:pull.rarityName,pull_rate_odds:pull.pullRateOdds,specific_pull_odds:pull.specificPullOdds,pull_rate_weight:pull.pullRateWeight,psa_avg_gem_pct:pull.psaAvgGemPct}:null;
      if(await recordAdvice({card,now,signalInput:{...baseInput,pull_rate_info,price:latest,price_fetched_at:new Date(latest.cm_fetched_at??latest.fetched_at).toISOString(),price_history:history}})) captured++;
    }
    for(const replay of buildAdviceReplayEntries(rows,baseInput,now)) {
      const observation=await recordAdvice({card,now:replay.at,origin:"replay",signalInput:replay.input});
      if(!observation) continue;
      const points=rows.map(p=>({at:new Date(p.cm_fetched_at??p.fetched_at),value:p.cm_en_lowest_nm!}));
      for(const horizon of ADVICE_HORIZONS) {
        const result=evaluateAdvice({label:observation.label as BuySignalLabel,entry:observation.entry_price,at:observation.observed_at,horizon,points,now});
        if(result.status!=="pending") await db.adviceOutcome.updateMany({where:{observation_id:observation.id,horizon_days:horizon,status:{not:"complete"}},data:{...result,evaluated_at:now}});
      }
      replayed++;
    }
  }
  await db.appSetting.upsert({where:{key:cursorKey},create:{key:cursorKey,value:cards.at(-1)?.id??""},update:{value:cards.at(-1)?.id??""}});
  await evaluateAdviceOutcomes(now);
  const status={at:now.toISOString(),cards:cards.length,captured,replayed,finished:cards.length<batchSize};
  await db.appSetting.upsert({where:{key:"advice-learning-status"},create:{key:"advice-learning-status",value:JSON.stringify(status)},update:{value:JSON.stringify(status)}});
  return {cards:cards.length,captured,replayed,finished:cards.length<batchSize};
}

