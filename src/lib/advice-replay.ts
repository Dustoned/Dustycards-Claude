import { buildCardPriceHistory } from "@/lib/price-history";
import type { CardMarketHistoryPriceRow } from "@/lib/card-market-history";
import type { BuildBuySignalInput } from "@/lib/buy-signal";

const DAY=86400000;
export function buildAdviceReplayEntries(rows: readonly CardMarketHistoryPriceRow[], metadata: Pick<BuildBuySignalInput,"rarity"|"episode_name"|"episode_code"|"episode_release_date">, now:Date) {
  const available=rows.filter(row=>row.cm_en_lowest_nm!=null && row.cm_en_lowest_nm>0 && row.cm_en_lowest_nm!==9001 && new Date(row.fetched_at).getTime()<=now.getTime() && new Date(row.cm_fetched_at??row.fetched_at).getTime()<=new Date(row.fetched_at).getTime()).sort((a,b)=>new Date(a.fetched_at).getTime()-new Date(b.fetched_at).getTime());
  const entries:Array<{at:Date;input:BuildBuySignalInput}>=[];
  const first=available[0];
  if(!first) return entries;
  let lastEntry=-Infinity;
  for(let index=0;index<available.length;index++) {
    const row=available[index];
    const at=new Date(row.fetched_at);
    if(at.getTime()-new Date(first.fetched_at).getTime()<60*DAY || at.getTime()-lastEntry<180*DAY || now.getTime()-at.getTime()<30*DAY) continue;
    if(metadata.episode_release_date && at.getTime()<new Date(metadata.episode_release_date).getTime()) continue;
    const quoteAt=new Date(row.cm_fetched_at??row.fetched_at);
    if(quoteAt.getTime()>at.getTime() || at.getTime()-quoteAt.getTime()>3*DAY) continue;
    const past=available.slice(0,index+1);
    const history=buildCardPriceHistory(past);
    if(history.length<8) continue;
    // Native EN NM values only. Never borrow current comparisons, pull rates or grading.
    const price={...row,tcp_market:null,tcp_mid:null,tcp_low:null,cm_en_avg_7d:null,cm_en_avg_30d:null};
    entries.push({at,input:{...metadata,price,price_fetched_at:quoteAt.toISOString(),price_history:history.map(point=>({...point,tcp_market:null,cm_avg_7d:null,cm_avg_30d:null})),now:at}});
    lastEntry=at.getTime();
  }
  return entries;
}
