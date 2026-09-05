import { expect, it } from "vitest";
import { summarizeLearning } from "./signal-learning";
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
