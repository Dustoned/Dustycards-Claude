import { describe, expect, it } from "vitest";
import {
  FALLBACK_CHASE_BUY_SIGNAL,
  getSafeChaseBuySignal,
} from "@/lib/expansion-chase-compat";

describe("legacy expansion chase compatibility", () => {
  it("keeps a current buy signal intact", () => {
    const signal = {
      label: "buy" as const,
      label_text: "Buy",
      score: 73,
      confidence: "medium" as const,
    };

    expect(getSafeChaseBuySignal({ buySignal: signal })).toEqual(signal);
  });

  it("uses a neutral hold instead of crashing on an older cached card", () => {
    expect(getSafeChaseBuySignal({})).toEqual(FALLBACK_CHASE_BUY_SIGNAL);
    expect(getSafeChaseBuySignal({ buySignal: { label: "buy" } })).toEqual(
      FALLBACK_CHASE_BUY_SIGNAL
    );
  });
});
