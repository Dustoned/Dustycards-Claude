import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const force = process.argv.includes("--force");
const devDir = path.join(root, ".next", "dev");
const lockPath = path.join(devDir, "lock");
const targets = [
  path.join(devDir, "cache", "turbopack"),
  path.join(devDir, "cache", "fetch-cache"),
];

async function exists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

if ((await exists(lockPath)) && !force) {
  console.error(
    "Refusing to clean .next/dev cache while a dev lock exists. Stop the dev server first, or rerun with --force for a known-stale lock."
  );
  process.exit(1);
}

for (const target of targets) {
  await fs.rm(target, { recursive: true, force: true });
  console.log(`Removed ${path.relative(root, target)}`);
}
