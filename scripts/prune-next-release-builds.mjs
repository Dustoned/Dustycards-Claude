import { access, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";

const releaseRoot = path.resolve(process.cwd(), ".next-releases");
const keepArgument = process.argv.find((argument) => argument.startsWith("--keep="));
const requestedKeepCount = keepArgument ? Number(keepArgument.slice("--keep=".length)) : 3;
if (!Number.isInteger(requestedKeepCount) || requestedKeepCount < 0 || requestedKeepCount > 10) {
  throw new Error("--keep must be an integer between 0 and 10");
}

async function main() {
  let entries;
  try {
    entries = await readdir(releaseRoot, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return;
    throw error;
  }

  const releases = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink())
      .map(async (entry) => {
        const absolutePath = path.join(releaseRoot, entry.name);
        const details = await stat(absolutePath);
        let complete = true;
        try {
          await access(path.join(absolutePath, "BUILD_ID"));
        } catch {
          complete = false;
        }
        return { absolutePath, complete, modifiedAt: details.mtimeMs };
      })
  );

  const completedReleases = releases
    .filter((release) => release.complete)
    .sort((left, right) => right.modifiedAt - left.modifiedAt);
  const staleReleases = [
    ...releases.filter((release) => !release.complete),
    ...completedReleases.slice(requestedKeepCount),
  ];

  // BUILD_ID is written only after a successful Next build. Removing abandoned
  // partial directories first and retaining three complete releases ensures a
  // failed attempt can never displace the version the live process still uses.
  for (const release of staleReleases) {
    const relative = path.relative(releaseRoot, release.absolutePath);
    if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error(`Refusing to remove unexpected Next.js release path: ${release.absolutePath}`);
    }
    await rm(release.absolutePath, { recursive: true, force: true });
  }
}

await main();
