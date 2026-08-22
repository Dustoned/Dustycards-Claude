import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { registerHooks } from "node:module";

const projectRoot = path.resolve(import.meta.dirname, "..");
const serverOnlyEmpty = pathToFileURL(path.join(projectRoot, "node_modules", "next", "dist", "compiled", "server-only", "empty.js")).href;

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
    if (specifier === "server-only") return { shortCircuit: true, url: serverOnlyEmpty };
    if (specifier.startsWith("@/")) {
      const resolved = resolveProjectAlias(specifier);
      if (resolved) return { shortCircuit: true, url: resolved };
    }
    return nextResolve(specifier, context);
  },
});

const { db } = await import(pathToFileURL(path.join(projectRoot, "src", "lib", "db.ts")).href);
try {
  if (process.argv.includes("--check")) {
    await import(pathToFileURL(path.join(projectRoot, "src", "lib", "backups.ts")).href);
    console.log(JSON.stringify({ ok: true, mode: "import-check" }));
  } else {
    await import(pathToFileURL(path.join(projectRoot, "scripts", "security-monitor-worker.ts")).href);
  }
} finally {
  await db.$disconnect();
}
