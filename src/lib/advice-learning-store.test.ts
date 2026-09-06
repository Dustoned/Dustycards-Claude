import { beforeEach, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({upsert:vi.fn(),findMany:vi.fn(),update:vi.fn(),graded:vi.fn(),ebay:vi.fn()}));
vi.mock("@/lib/db",()=>({db:{adviceObservation:{upsert:mocks.upsert},adviceOutcome:{findMany:mocks.findMany,update:mocks.update},cardGradedPriceSnapshot:{findMany:mocks.graded},cardEbaySoldGradedPriceSnapshot:{findMany:mocks.ebay}}}));
vi.mock("@/lib/pull-rates",()=>({getPullRateInfoForSetRarity:vi.fn()}));
import { recordAdvice, evaluateAdviceOutcomes } from "./advice-learning-store";
import type { BuildBuySignalInput } from "./buy-signal";
const now=new Date("2026-09-06T10:00:00Z");
const card={id:"card",name:"Card",game:"pokemon"};
const signalInput:BuildBuySignalInput={price:{cm_en_lowest_nm:100,cm_de_lowest_nm:null,cm_fr_lowest_nm:null,cm_es_lowest_nm:null,cm_it_lowest_nm:null,tcp_market:null,tcp_mid:null,tcp_low:null,cm_en_avg_7d:null,cm_en_avg_30d:null},price_fetched_at:now.toISOString(),price_history:[]};
beforeEach(()=>{vi.clearAllMocks();mocks.upsert.mockImplementation(async ({create})=>create);mocks.findMany.mockResolvedValue([]);});
it("freezes the first daily observation and isolates owner and replay namespaces",async()=>{
 const first=await recordAdvice({card,signalInput,now});
 const second=await recordAdvice({card,signalInput:{...signalInput,price:{...signalInput.price!,cm_en_lowest_nm:150}},now});
 expect(second!.id).toBe(first!.id);
 expect(mocks.upsert.mock.calls[1][0].update).toEqual({});
 const personal=await recordAdvice({card,signalInput,ownerId:"owner",copyId:"copy",now});
 const replay=await recordAdvice({card,signalInput,origin:"replay",now});
 expect(new Set([first!.id,personal!.id,replay!.id]).size).toBe(3);
 expect(personal).toMatchObject({owner_id:"owner",context:"owned"});
 expect(first).toMatchObject({owner_id:null,context:"market"});
 expect(mocks.upsert.mock.calls[0][0].create.outcomes.create.map((o:{horizon_days:number})=>o.horizon_days)).toEqual([30,90,180]);
});
it("does not create evidence from missing or stale quotes",async()=>{
 expect(await recordAdvice({card,now,signalInput:{...signalInput,price_fetched_at:null}})).toBeNull();
 expect(await recordAdvice({card,now,signalInput:{...signalInput,price_fetched_at:"2020-01-01"}})).toBeNull();
 expect(await recordAdvice({card,now,signalInput:{...signalInput,price:null}})).toBeNull();
 expect(mocks.upsert).not.toHaveBeenCalled();
});
it("captures native graded currency and rejects raw fallbacks for a graded copy",async()=>{
 const owned={...signalInput,collection_item:{purchase_price:50,cost_basis_value:50,grading_company:"PSA",grading_grade:"10"}};
 expect(await recordAdvice({card,now,ownerId:"owner",signalInput:owned})).toBeNull();
 const entry=await recordAdvice({card,now,ownerId:"owner",signalInput:{...owned,ebay_sold_graded_prices:[{label:"PSA 10",company:"PSA",grade:"10",median_price:200,median_price_eur:180,currency:"USD",sample_size:8,fetched_at:now.toISOString()}]}});
 expect(entry).toMatchObject({source:"ebay-graded",grade_label:"PSA 10",currency:"USD",entry_price:200});
 expect(JSON.parse(entry!.evidence_json).features.collection_item.purchase_price).toBe(50);
});
it("evaluates only the frozen source, grade and native currency",async()=>{
 mocks.findMany.mockResolvedValue([{id:"outcome",horizon_days:30,observation:{card_id:"card",source:"ebay-graded",grade_label:"PSA 10",currency:"USD",label:"hold",entry_price:200,observed_at:new Date("2026-07-01")}}]);
 mocks.ebay.mockResolvedValue([]);
 await evaluateAdviceOutcomes(now);
 expect(mocks.ebay).toHaveBeenCalledWith(expect.objectContaining({where:{card_id:"card",label:"PSA 10",currency:"USD",source:"ebay_sold",sample_size:{gte:3},fetched_at:{lte:now}}}));
 expect(mocks.graded).not.toHaveBeenCalled();
 expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({status:"insufficient",correct:null})}));
});
