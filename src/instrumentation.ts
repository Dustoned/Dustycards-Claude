import type { Instrumentation } from "next";

// Next.js builds this entry for every server runtime. Keep it free of Node-only
// imports so Edge compilation never follows the SQLite/fs dependency graph.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { registerNodeInstrumentation } = await import("./instrumentation-node");
    await registerNodeInstrumentation();
  }
}

export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context
) => {
  const message = error instanceof Error ? error.message : String(error);
  const digest =
    typeof error === "object" && error !== null && "digest" in error
      ? String(error.digest)
      : null;
  console.error(
    JSON.stringify({
      event: "request_error",
      message,
      digest,
      method: request.method,
      path: request.path,
      routePath: context.routePath,
      routeType: context.routeType,
      renderSource: context.renderSource,
    })
  );
};
