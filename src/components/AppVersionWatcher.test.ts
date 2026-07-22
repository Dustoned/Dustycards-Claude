import { describe, expect, it } from "vitest";
import { appBuildChanged } from "./AppVersionWatcher";

describe("appBuildChanged", () => {
  it("reloads an installed app when production moved to a different build", () => {
    expect(appBuildChanged("old-release", "new-release")).toBe(true);
  });

  it("keeps the current page for the same or an unavailable build", () => {
    expect(appBuildChanged("same-release", "same-release")).toBe(false);
    expect(appBuildChanged("same-release", null)).toBe(false);
  });
});
