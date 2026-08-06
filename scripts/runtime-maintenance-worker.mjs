import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { registerHooks } from "node:module";

const projectRoot = path.resolve(import.meta.dirname, "..");

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
    if (specifier.startsWith("@/")) {
      const resolved = resolveProjectAlias(specifier);
      if (resolved) return { shortCircuit: true, url: resolved };
    }
    return nextResolve(specifier, context);
  },
});

await import(
  pathToFileURL(path.join(projectRoot, "scripts", "runtime-maintenance-worker.ts")).href
);
