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
    path.join(target, "index.js"),
  ];
  const resolved = candidates.find((candidate) => fs.existsSync(candidate));
  return resolved ? pathToFileURL(resolved).href : null;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
      return { shortCircuit: true, url: "data:text/javascript,export%20default%20undefined" };
    }
    if (specifier.startsWith("@/")) {
      const resolved = resolveProjectAlias(specifier);
      if (resolved) return { shortCircuit: true, url: resolved };
    }
    return nextResolve(specifier, context);
  },
});

const inputIndex = process.argv.indexOf("--in");
const inputPath = path.resolve(
  inputIndex >= 0 && process.argv[inputIndex + 1]
    ? process.argv[inputIndex + 1]
    : path.join(projectRoot, "data", "marktplaats", "report-latest.json")
);

if (!fs.existsSync(inputPath)) {
  throw new Error(`Marktplaats report not found: ${inputPath}`);
}

const report = JSON.parse(fs.readFileSync(inputPath, "utf8"));
const { importMarktplaatsReport } = await import(
  pathToFileURL(path.join(projectRoot, "src", "lib", "marktplaats-deals-store.ts")).href
);

try {
  const result = await importMarktplaatsReport(report);
  console.log(JSON.stringify({ ok: true, input: inputPath, ...result }));
} catch (error) {
  console.error("[marktplaats-report-import]", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
