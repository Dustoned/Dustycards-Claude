import { describe, expect, it } from "vitest";
import { safeExternalHref } from "./safe-external-url";

describe("safeExternalHref", () => {
  it("allows ordinary HTTP and HTTPS links", () => {
    expect(safeExternalHref("https://example.com/path?q=1")).toBe("https://example.com/path?q=1");
    expect(safeExternalHref("http://example.com/")).toBe("http://example.com/");
  });

  it("rejects executable, credential-bearing and malformed links", () => {
    expect(safeExternalHref("javascript:alert(1)")).toBeNull();
    expect(safeExternalHref("data:text/html,test")).toBeNull();
    expect(safeExternalHref("https://user:secret@example.com/")).toBeNull();
    expect(safeExternalHref("not a url")).toBeNull();
  });
});
