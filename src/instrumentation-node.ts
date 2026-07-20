// This module is imported only by the Node.js instrumentation runtime. Keeping
// process, Prisma and SQLite references here prevents them from entering Edge
// bundles while preserving the same boot reconciliation and graceful shutdown.

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

export async function registerNodeInstrumentation() {
  registerGracefulShutdown();
  const { reconcileOrphanedSyncsOnBoot } = await import("@/lib/sync/boot-reconcile");
  await reconcileOrphanedSyncsOnBoot();
}
