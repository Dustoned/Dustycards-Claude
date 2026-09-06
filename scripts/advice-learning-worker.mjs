import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { registerHooks } from "node:module";

// Use the same database/runtime configuration as the production scheduler.
process.env.NODE_ENV ||= "production";

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

const { runAdviceLearningBatch } = await import(pathToFileURL(path.join(projectRoot, "src/lib/advice-learning-store.ts")).href);
const { db } = await import(pathToFileURL(path.join(projectRoot, "src/lib/db.ts")).href);
try {
  if (process.argv.includes("--check")) console.log(JSON.stringify({ok:true,mode:"import-check"}));
  else {
    const drain=process.argv.includes("--drain");
    let result;
    do {
      result=await runAdviceLearningBatch(new Date(),20);
      console.log(JSON.stringify({at:new Date().toISOString(),...result}));
      if(result.busy) await new Promise(resolve=>setTimeout(resolve,2000));
    } while(drain && !result.finished);
  }
} catch(error) {
  console.error("[advice-learning-worker]",error instanceof Error?error.message:String(error));
  process.exitCode=1;
} finally { await db.$disconnect(); }
