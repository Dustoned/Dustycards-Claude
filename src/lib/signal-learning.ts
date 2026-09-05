export type LearningCount = { status: string; meaningful_direction_hit: boolean | null; _count: { _all: number } };
export function summarizeLearning(rows: LearningCount[]) {
  const total = { correct: 0, missed: 0, pending: 0, insufficient: 0, unscored: 0 };
  for (const row of rows) {
    const key = row.status === "complete" ? row.meaningful_direction_hit === true ? "correct" : row.meaningful_direction_hit === false ? "missed" : "unscored" : row.status === "pending" ? "pending" : "insufficient";
    total[key] += row._count._all;
  }
  const scored = total.correct + total.missed;
  return { ...total, scored, accuracy: scored ? Math.round(total.correct / scored * 100) : null };
}
