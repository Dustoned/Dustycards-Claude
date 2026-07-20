import { afterEach, describe, expect, it, vi } from "vitest";

const instrumentationNode = vi.hoisted(() => ({
  registerNodeInstrumentation: vi.fn(),
}));

vi.mock("./instrumentation-node", () => instrumentationNode);

import { register } from "./instrumentation";

describe("instrumentation runtime isolation", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    instrumentationNode.registerNodeInstrumentation.mockReset();
  });

  it("does not load Node instrumentation in the Edge runtime", async () => {
    vi.stubEnv("NEXT_RUNTIME", "edge");

    await register();

    expect(instrumentationNode.registerNodeInstrumentation).not.toHaveBeenCalled();
  });

  it("runs Node startup instrumentation in the Node.js runtime", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");

    await register();

    expect(instrumentationNode.registerNodeInstrumentation).toHaveBeenCalledOnce();
  });
});
