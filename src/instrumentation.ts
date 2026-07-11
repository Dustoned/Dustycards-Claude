// Next.js instrumentation hook; runs once when the server process starts.
// Clears orphaned sync state and disconnects SQLite cleanly on shutdown.
export const runtime = "nodejs";

let shutdownHandlerRegistered = false;

function registerGracefulShutdown() {
  if (shutdownHandlerRegistered) return;
  shutdownHandlerRegistered = true;

  const shutdown = async (signal: NodeJS.Signals) => {
    console.info(`[shutdown] received ${signal}; disconnecting database`);
    const timeout = setTimeout(() => process.exit(0), 3000);
    timeout.unref();

    try {
      const { db } = await import("@/lib/db");
      await db.$disconnect();
    } catch (error) {
      console.warn(
        "[shutdown] database disconnect failed:",
        error instanceof Error ? error.message : String(error)
      );
    } finally {
      process.exit(0);
    }
  };

  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  registerGracefulShutdown();
  const { reconcileOrphanedSyncsOnBoot } = await import("@/lib/sync/boot-reconcile");
  await reconcileOrphanedSyncsOnBoot();
}
