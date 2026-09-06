import { describe, expect, it } from "vitest";
import { evaluateAdvice, scoreAdvice, summarizeAdvice } from "./advice-learning";
import { buildAdviceReplayEntries } from "./advice-replay";
import { latestUsablePriceField } from "./card-price-fields";
import { buildBuySignal } from "./buy-signal";
import type { CardMarketHistoryPriceRow } from "./card-market-history";

const DAY = 86400000;
const start = new Date("2024-01-01T00:00:00Z");
const at = (day: number) => new Date(start.getTime() + day * DAY);
const points = Array.from({length: 30}, (_, i) => ({at: at(i + 1), value: 95}));
const input = {label: "sell" as const, entry: 100, at: start, horizon: 30, points, now: at(40)};
function row(day: number, value = 100): CardMarketHistoryPriceRow {
  return {card_id:"test", fetched_at:at(day), cm_fetched_at:at(day), cm_en_lowest_nm:value,
    cm_de_lowest_nm:null, cm_fr_lowest_nm:null, cm_es_lowest_nm:null, cm_it_lowest_nm:null,
    cm_jp_lowest_nm:null, tcp_market:5000, tcp_mid:null, tcp_low:null, cm_en_avg_7d:8000, cm_en_avg_30d:9000};
}

describe("advice outcome evidence", () => {
  it("uses horizon-specific thresholds and treats rising holds as successful", () => {
    expect(scoreAdvice("strong_buy", 5, 30)).toBe(true);
    expect(scoreAdvice("buy", 5, 90)).toBe(false);
    expect(scoreAdvice("strong_sell", -15, 180)).toBe(true);
    expect(scoreAdvice("hold", 25, 30)).toBe(true);
    expect(scoreAdvice("hold", -5, 30)).toBe(false);
    expect(scoreAdvice("buy", 5, 7)).toBeNull();
  });
  it("scores exact negative boundaries despite floating-point error", () => {
    expect(evaluateAdvice(input)).toMatchObject({status:"complete", correct:true, end_price:95, observed_days:30});
  });
  it("never reads prices beyond the due date or scores immature entries", () => {
    expect(evaluateAdvice({...input, points:[...points, {at:at(31), value:2000}]})).toEqual(evaluateAdvice(input));
    expect(evaluateAdvice({...input, now:at(29)}).status).toBe("pending");
  });
  it("keeps sparse, repeated, or stale observations out of the miss count", () => {
    for (const evidence of [points.slice(0,10), Array(100).fill(points[29]), points.slice(25)]) {
      expect(evaluateAdvice({...input, points:evidence})).toMatchObject({status:"insufficient", correct:null, return_pct:null});
    }
    const summary=summarizeAdvice([{label:"buy",horizon:30,status:"insufficient",correct:null,return_pct:null}]);
    expect(summary[0]).toMatchObject({missed:0,accuracy:null,insufficient:1});
  });
});

describe("historical advice replay", () => {
  const history=Array.from({length:500},(_,i)=>row(i,100+i/10));
  it("only uses evidence available at entry, even after future prices arrive", () => {
    const old=buildAdviceReplayEntries(history.slice(0,121),{},at(120));
    const extended=buildAdviceReplayEntries(history,{},at(499));
    expect(old).toHaveLength(1);
    expect(extended[0]).toEqual(old[0]);
    expect(buildBuySignal(extended[0].input)).toEqual(buildBuySignal(old[0].input));
    expect(old[0].input.price_history).toHaveLength(61);
    expect(old[0].input.price?.tcp_market).toBeNull();
    expect(old[0].input.price?.cm_en_avg_30d).toBeNull();
    expect(old[0].input.price_history.every(p=>p.tcp_market===null&&p.cm_avg_30d===null)).toBe(true);
  });
  it("spaces entries 180 days apart and does not invent personal history", () => {
    const entries=buildAdviceReplayEntries(history,{},at(499));
    expect(entries.map(e=>(e.at.getTime()-start.getTime())/DAY)).toEqual([60,240,420]);
    expect(entries.every(e=>!e.input.collection_item&&!e.input.pull_rate_info&&!e.input.graded_prices)).toBe(true);
  });
  it("rejects future, prerelease and stale entry quotes", () => {
    expect(buildAdviceReplayEntries(history,{episode_release_date:at(600).toISOString()},at(499))).toEqual([]);
    expect(buildAdviceReplayEntries(history.map(r=>({...r,cm_fetched_at:at(-20)})),{},at(499))).toEqual([]);
    expect(buildAdviceReplayEntries(history,{},at(30))).toEqual([]);
  });
});

it("resolves independent marketplace fields without hiding older source-pure quotes", () => {
  const rows=[{...row(1),tcp_market:120,cm_en_avg_30d:90},{...row(2),tcp_market:null,cm_en_avg_30d:null}];
  expect(latestUsablePriceField(rows,"tcp_market")).toBe(120);
  expect(latestUsablePriceField(rows,"cm_en_avg_30d",{cardMarket:true})).toBe(90);
});
