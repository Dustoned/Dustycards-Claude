import { describe, expect, it } from "vitest";
import {
  FeedbackValidationError,
  normalizeFeedbackInput,
} from "@/lib/feedback";

describe("normalizeFeedbackInput", () => {
  it("normalizes a valid category and same-origin page", () => {
    expect(
      normalizeFeedbackInput(
        {
          category: "bug",
          message: "  The detail graph remains visible forever.  ",
          pageUrl: "https://dustycards.example/cards/123?mode=graded#chart",
        },
        "https://dustycards.example"
      )
    ).toEqual({
      category: "bug",
      message: "The detail graph remains visible forever.",
      pageUrl: "/cards/123?mode=graded",
    });
  });

  it("drops external page URLs", () => {
    expect(
      normalizeFeedbackInput(
        {
          category: "idea",
          message: "Please add a compact comparison mode.",
          pageUrl: "https://malicious.example/collect",
        },
        "https://dustycards.example"
      ).pageUrl
    ).toBeNull();
  });

  it("rejects feedback without useful detail", () => {
    expect(() =>
      normalizeFeedbackInput(
        { category: "bug", message: "broken" },
        "https://dustycards.example"
      )
    ).toThrow(FeedbackValidationError);
  });
});
