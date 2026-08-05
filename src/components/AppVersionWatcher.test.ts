import { describe, expect, it } from "vitest";
import { appBuildChanged, shouldReloadForBuild } from "./AppVersionWatcher";

describe("appBuildChanged", () => {
  it("reloads an installed app when production moved to a different build", () => {
    expect(appBuildChanged("old-release", "new-release")).toBe(true);
  });

  it("keeps the current page for the same or an unavailable build", () => {
    expect(appBuildChanged("same-release", "same-release")).toBe(false);
    expect(appBuildChanged("same-release", null)).toBe(false);
  });

  it("attempts at most one reload for the same live build", () => {
    expect(shouldReloadForBuild("old-release", "new-release", null)).toBe(true);
    expect(shouldReloadForBuild("old-release", "new-release", "new-release")).toBe(false);
  });

  it("permits one reload when a later build becomes available", () => {
    expect(shouldReloadForBuild("old-release", "later-release", "new-release")).toBe(true);
  });
});
