export interface ConcurrencyLimiter {
  run<T>(task: () => Promise<T> | T): Promise<T>;
  readonly activeCount: number;
  readonly pendingCount: number;
}

/**
 * Keeps expensive in-process work within a fixed concurrency budget. A slot is
 * handed directly to the oldest waiter, so a newly arriving task cannot jump
 * the queue between release and resume.
 */
export function createConcurrencyLimiter(maxConcurrency: number): ConcurrencyLimiter {
  if (!Number.isInteger(maxConcurrency) || maxConcurrency < 1) {
    throw new RangeError("maxConcurrency must be a positive integer");
  }

  let activeCount = 0;
  const waiters: Array<() => void> = [];

  async function acquire() {
    if (activeCount < maxConcurrency) {
      activeCount += 1;
      return;
    }

    // The released slot remains counted as active while it is handed to this
    // waiter. This prevents a fresh caller from stealing it in the same tick.
    await new Promise<void>((resolve) => waiters.push(resolve));
  }

  function release() {
    const next = waiters.shift();
    if (next) {
      next();
      return;
    }
    activeCount = Math.max(0, activeCount - 1);
  }

  return {
    async run<T>(task: () => Promise<T> | T): Promise<T> {
      await acquire();
      try {
        return await task();
      } finally {
        release();
      }
    },
    get activeCount() {
      return activeCount;
    },
    get pendingCount() {
      return waiters.length;
    },
  };
}
