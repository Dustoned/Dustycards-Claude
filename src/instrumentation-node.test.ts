import { afterEach, describe, expect, it, vi } from "vitest";

const bootReconcile = vi.hoisted(() => ({
  reconcileOrphanedSyncsOnBoot: vi.fn(),
}));

vi.mock("@/lib/sync/boot-reconcile", () => bootReconcile);

describe("Node instrumentation startup", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    bootReconcile.reconcileOrphanedSyncsOnBoot.mockReset();
  });

  it("registers shutdown handlers once and reconciles orphaned syncs", async () => {
    const once = vi.spyOn(process, "once").mockReturnValue(process);
    const { registerNodeInstrumentation } = await import("./instrumentation-node");

    await registerNodeInstrumentation();
    await registerNodeInstrumentation();

    expect(once).toHaveBeenCalledTimes(2);
    expect(once).toHaveBeenCalledWith("SIGTERM", expect.any(Function));
    expect(once).toHaveBeenCalledWith("SIGINT", expect.any(Function));
    expect(bootReconcile.reconcileOrphanedSyncsOnBoot).toHaveBeenCalledTimes(2);
  });
});
