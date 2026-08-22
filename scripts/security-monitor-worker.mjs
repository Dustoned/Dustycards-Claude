import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { registerHooks } from "node:module";

const projectRoot = path.resolve(import.meta.dirname, "..");
const serverOnlyEmpty = pathToFileURL(path.join(projectRoot, "node_modules", "next", "dist", "compiled", "server-only", "empty.js")).href;
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") return { shortCircuit: true, url: serverOnlyEmpty };
    if (specifier.startsWith("@/")) {
      const target = path.join(projectRoot, "src", specifier.slice(2));
      const resolved = [`${target}.ts`, `${target}.tsx`, path.join(target, "index.ts")].find(fs.existsSync);
      if (resolved) return { shortCircuit: true, url: pathToFileURL(resolved).href };
    }
    return nextResolve(specifier, context);
  },
});

try {
  await import(pathToFileURL(path.join(projectRoot, "scripts", "security-monitor-worker.ts")).href);
} finally {
  const { db } = await import(pathToFileURL(path.join(projectRoot, "src", "lib", "db.ts")).href);
  await db.$disconnect();
}
