import { describe, expect, it } from "vitest";
import { getSafeNextPath } from "@/lib/safe-next-path";

describe("getSafeNextPath", () => {
  it("keeps local application paths", () => {
    expect(getSafeNextPath("/binders/abc?view=grid")).toBe("/binders/abc?view=grid");
  });

  it("rejects protocol-relative and malformed paths", () => {
    expect(getSafeNextPath("//evil.example/path")).toBe("/");
    expect(getSafeNextPath("/\\evil.example/path")).toBe("/");
    expect(getSafeNextPath("https://evil.example/path")).toBe("/");
  });

  it("supports an explicit fallback", () => {
    expect(getSafeNextPath(undefined, "/account")).toBe("/account");
  });
});
