import { describe, expect, it } from "vitest";
import { formatBuildLabel } from "@/lib/app-version";

describe("formatBuildLabel", () => {
  it("keeps semantic versions as semantic versions", () => {
    expect(formatBuildLabel("3.11.0")).toBe("build 3.11.0");
  });

  it("formats ISO timestamps as dated build labels", () => {
    expect(formatBuildLabel("2026-08-05T12:34:00.000Z")).toBe("build 20260805-1234");
  });

  it("keeps commit identifiers compact", () => {
    expect(formatBuildLabel("a393481fedcba987")).toBe("build a393481fedcb");
  });
});
