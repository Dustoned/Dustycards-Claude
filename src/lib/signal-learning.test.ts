import { expect, it } from "vitest";
import { dailySignalNotifications, learningDayRange, summarizeLearning } from "./signal-learning";
it("excludes pending, insufficient and unscored checks from accuracy", () => {
  expect(summarizeLearning([
    { status: "complete", meaningful_direction_hit: true, _count: { _all: 3 } },
    { status: "complete", meaningful_direction_hit: false, _count: { _all: 1 } },
    { status: "complete", meaningful_direction_hit: null, _count: { _all: 2 } },
    { status: "pending", meaningful_direction_hit: false, _count: { _all: 10 } },
    { status: "insufficient", meaningful_direction_hit: null, _count: { _all: 5 } },
  ])).toEqual({ correct: 3, missed: 1, unscored: 2, pending: 10, insufficient: 5, scored: 4, accuracy: 75 });
});
it("does not invent a hit rate without scored evidence", () => {
  expect(summarizeLearning([]).accuracy).toBeNull();
});

it("bundles all outcomes by UTC date with a stable receipt key", () => {
  const row = (time: string, hit: boolean) => ({ evaluated_at: new Date(time), meaningful_direction_hit: hit, entry_observation: { game: "pokemon" } });
  const rows = [row("2026-09-04T23:59:00Z", true), row("2026-09-05T00:00:00Z", false), ...Array.from({ length: 8 }, () => row("2026-09-05T10:00:00Z", true))];
  const result = dailySignalNotifications(rows, false);
  expect(result).toHaveLength(2);
  expect(result[1].detail).toContain("8 correct · 1 missed");
  expect(result[1].id).toBe("signal-day-2026-09-05");
  expect(dailySignalNotifications([...rows, row("2026-09-05T12:00:00Z", true)], false)[1].id).toBe(result[1].id);
  expect(learningDayRange("2026-09-05")).toEqual({ gte: new Date("2026-09-05T00:00:00Z"), lt: new Date("2026-09-06T00:00:00Z") });
  expect(learningDayRange("2026-02-31")).toBeNull();
});
