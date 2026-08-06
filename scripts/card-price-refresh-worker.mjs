import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { registerHooks } from "node:module";

const projectRoot = path.resolve(import.meta.dirname, "..");
const serverOnlyEmpty = pathToFileURL(
  path.join(projectRoot, "node_modules", "next", "dist", "compiled", "server-only", "empty.js")
).href;

function resolveProjectAlias(specifier) {
  const target = path.join(projectRoot, "src", specifier.slice(2));
  const candidates = [
    `${target}.ts`,
    `${target}.tsx`,
    `${target}.js`,
    path.join(target, "index.ts"),
    path.join(target, "index.tsx"),
    path.join(target, "index.js"),
  ];
  const resolved = candidates.find((candidate) => fs.existsSync(candidate));
  return resolved ? pathToFileURL(resolved).href : null;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
      return { shortCircuit: true, url: serverOnlyEmpty };
    }
    if (specifier.startsWith("next/") && !path.extname(specifier)) {
      const nextEntry = path.join(projectRoot, "node_modules", `${specifier}.js`);
      if (fs.existsSync(nextEntry)) {
        return { shortCircuit: true, url: pathToFileURL(nextEntry).href };
      }
    }
    if (specifier.startsWith("@/")) {
      const resolved = resolveProjectAlias(specifier);
      if (resolved) return { shortCircuit: true, url: resolved };
    }
    return nextResolve(specifier, context);
  },
});

const [{ runExternalAutoPriceRefreshWorker }, { db }] = await Promise.all([
  import(
    pathToFileURL(path.join(projectRoot, "src", "lib", "sync", "auto-price-refresh-job.ts")).href
  ),
  import(pathToFileURL(path.join(projectRoot, "src", "lib", "db.ts")).href),
]);

if (process.argv.includes("--check")) {
  console.log(JSON.stringify({ ok: true, mode: "import-check" }));
} else {
  try {
    const result = await runExternalAutoPriceRefreshWorker();
    console.log(JSON.stringify({ ok: result.status !== "failed", ...result }));
    if (result.status === "failed") process.exitCode = 1;
  } catch (error) {
    console.error(
      "[card-price-refresh-worker]",
      error instanceof Error ? error.message : String(error)
    );
    process.exitCode = 1;
  } finally {
    await db.$disconnect().catch(() => undefined);
  }
}
