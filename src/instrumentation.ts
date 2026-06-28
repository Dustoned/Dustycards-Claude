// Next.js instrumentation hook — runs once when the server process starts.
// Used to clear orphaned "running" sync records left by a previous process so a
// restart/deploy never wedges the background price refresh.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { reconcileOrphanedSyncsOnBoot } = await import("@/lib/sync/boot-reconcile");
  await reconcileOrphanedSyncsOnBoot();
}
