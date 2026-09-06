import type { BuySignalLabel } from "@/lib/buy-signal";

export const ADVICE_HORIZONS = [30, 90, 180] as const;
export const ADVICE_THRESHOLDS: Record<number, number> = {30: 5, 90: 10, 180: 15};
export type AdvicePoint = { at: Date; value: number };
export function adviceFamily(label: string): "buy" | "hold" | "sell" {
  return label.includes("buy") ? "buy" : label.includes("sell") ? "sell" : "hold";
}
export function scoreAdvice(label: BuySignalLabel, returnPct: number, horizon: number) {
  const threshold = ADVICE_THRESHOLDS[horizon];
  if (threshold == null || !Number.isFinite(returnPct)) return null;
  const family = adviceFamily(label);
  // Hold means keep the asset, not predict a flat price. A rise is not a failed hold.
  const rounded = Math.round(returnPct * 1e8) / 1e8;
  return family === "buy" ? rounded >= threshold : family === "sell" ? rounded <= -threshold : rounded > -threshold;
}
export function evaluateAdvice(input: {label: BuySignalLabel; entry: number; at: Date; horizon: number; points: AdvicePoint[]; now: Date}) {
  const due = input.at.getTime() + input.horizon * 86400000;
  if (input.now.getTime() < due) return {status: "pending", correct: null, return_pct: null, end_price: null, observed_days: 0};
  const days = new Map<string, AdvicePoint>();
  for (const point of [...input.points].sort((a,b) => a.at.getTime()-b.at.getTime())) {
    if (point.at.getTime() > input.at.getTime() && point.at.getTime() <= due && Number.isFinite(point.value) && point.value > 0 && point.value !== 9001) days.set(point.at.toISOString().slice(0,10),point);
  }
  const points = [...days.values()];
  const end = points.at(-1);
  const enough = input.entry > 0 && points.length >= Math.max(3, Math.ceil(input.horizon/7)) && end && due-end.at.getTime() <= 7*86400000 && end.at.getTime()-points[0].at.getTime() >= input.horizon*0.7*86400000;
  if (!enough) return {status: "insufficient", correct: null, return_pct: null, end_price: null, observed_days: points.length};
  const change = (end.value/input.entry-1)*100;
  return {status: "complete", correct: scoreAdvice(input.label, change, input.horizon), return_pct: change, end_price: end.value, observed_days: points.length};
}

export function summarizeAdvice(rows: {correct: boolean|null; return_pct: number|null; status: string; label: string; horizon: number}[]) {
  return ["buy","hold","sell"].map(family => {
    const matching=rows.filter(row=>adviceFamily(row.label)===family);
    const scored=matching.filter(row=>row.status==="complete" && row.correct!=null);
    const correct=scored.filter(row=>row.correct).length;
    const baseline=scored.filter(row=>row.return_pct!=null && scoreAdvice("hold",row.return_pct,row.horizon)).length;
    return {family,correct,missed:scored.length-correct,pending:matching.filter(row=>row.status==="pending").length,insufficient:matching.filter(row=>row.status==="insufficient").length,total:matching.length,scored:scored.length,accuracy:scored.length?correct/scored.length*100:null,holdBaseline:scored.length?baseline/scored.length*100:null,averageReturn:scored.length?scored.reduce((sum,row)=>sum+(row.return_pct??0),0)/scored.length:null};
  });
}
