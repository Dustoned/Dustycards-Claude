import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { registerHooks } from "node:module";

const projectRoot = path.resolve(import.meta.dirname, "..");

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
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
      if (resolved) return { shortCircuit: true, url: pathToFileURL(resolved).href };
    }
    return nextResolve(specifier, context);
  },
});

await import(pathToFileURL(path.join(projectRoot, "scripts", "sync-promo-origins.ts")).href);
