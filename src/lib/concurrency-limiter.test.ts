import { describe, expect, it } from "vitest";
import { createConcurrencyLimiter } from "@/lib/concurrency-limiter";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("createConcurrencyLimiter", () => {
  it("never runs more than the configured number of tasks", async () => {
    const limiter = createConcurrencyLimiter(2);
    const gates = Array.from({ length: 4 }, () => deferred<void>());
    let running = 0;
    let peak = 0;

    const tasks = gates.map((gate) =>
      limiter.run(async () => {
        running += 1;
        peak = Math.max(peak, running);
        await gate.promise;
        running -= 1;
      })
    );

    await Promise.resolve();
    await Promise.resolve();
    expect(peak).toBe(2);
    expect(limiter.activeCount).toBe(2);
    expect(limiter.pendingCount).toBe(2);

    gates[0].resolve();
    await tasks[0];
    await Promise.resolve();
    expect(running).toBe(2);
    expect(limiter.pendingCount).toBe(1);

    gates[1].resolve();
    gates[2].resolve();
    gates[3].resolve();
    await Promise.all(tasks);
    expect(peak).toBe(2);
    expect(limiter.activeCount).toBe(0);
    expect(limiter.pendingCount).toBe(0);
  });

  it("releases a slot when a task rejects", async () => {
    const limiter = createConcurrencyLimiter(1);
    const failure = deferred<void>();
    let secondStarted = false;

    const first = limiter.run(async () => {
      await failure.promise;
    });
    const second = limiter.run(() => {
      secondStarted = true;
      return "ok";
    });

    await Promise.resolve();
    failure.reject(new Error("transform failed"));
    await expect(first).rejects.toThrow("transform failed");
    await expect(second).resolves.toBe("ok");
    expect(secondStarted).toBe(true);
    expect(limiter.activeCount).toBe(0);
  });

  it("rejects invalid concurrency limits", () => {
    expect(() => createConcurrencyLimiter(0)).toThrow(RangeError);
    expect(() => createConcurrencyLimiter(1.5)).toThrow(RangeError);
  });
});
