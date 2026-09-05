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

export function learningDayRange(day: string | undefined) {
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const start = new Date(`${day}T00:00:00.000Z`);
  if (!Number.isFinite(start.getTime()) || start.toISOString().slice(0, 10) !== day) return null;
  return { gte: start, lt: new Date(start.getTime() + 86400000) };
}

export function dailySignalNotifications(outcomes: readonly { evaluated_at: Date | null; meaningful_direction_hit: boolean | null; entry_observation: { game: string } }[], onePieceEnabled: boolean) {
  const days = new Map<string, { correct: number; missed: number; latest: Date }>();
  for (const outcome of outcomes) {
    if (!outcome.evaluated_at || outcome.meaningful_direction_hit == null || (!onePieceEnabled && outcome.entry_observation.game !== "pokemon")) continue;
    const day = outcome.evaluated_at.toISOString().slice(0, 10);
    const bucket = days.get(day) ?? { correct: 0, missed: 0, latest: outcome.evaluated_at };
    if (outcome.meaningful_direction_hit) bucket.correct++; else bucket.missed++;
    if (outcome.evaluated_at > bucket.latest) bucket.latest = outcome.evaluated_at;
    days.set(day, bucket);
  }
  return [...days].map(([day, bucket]) => ({
    id: `signal-day-${day}`, kind: "signal" as const,
    title: "Daily prediction results",
    detail: `${bucket.correct} correct · ${bucket.missed} missed · ${day} (UTC)`,
    href: `/movers/signal-radar/learning?day=${day}&horizon=all`,
    occurredAt: bucket.latest.toISOString(), tone: "neutral" as const,
  }));
}
