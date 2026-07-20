// Next.js builds this entry for every server runtime. Keep it free of Node-only
// imports so Edge compilation never follows the SQLite/fs dependency graph.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { registerNodeInstrumentation } = await import("./instrumentation-node");
    await registerNodeInstrumentation();
  }
}
