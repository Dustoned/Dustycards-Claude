import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { getSqliteSidecarPaths, removeSqliteSidecars } from "./db-paths";

const tempDirs: string[] = [];

function makeTempDbPath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dustycards-db-paths-"));
  tempDirs.push(dir);
  return path.join(dir, "dustycards.db");
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("getSqliteSidecarPaths", () => {
  it("returns WAL and SHM paths for a sqlite database path", () => {
    expect(getSqliteSidecarPaths("/tmp/dustycards.db")).toEqual([
      "/tmp/dustycards.db-wal",
      "/tmp/dustycards.db-shm",
    ]);
  });
});

describe("removeSqliteSidecars", () => {
  it("removes stale sidecar files without requiring the main database file", () => {
    const dbPath = makeTempDbPath();
    const [walPath, shmPath] = getSqliteSidecarPaths(dbPath);
    fs.writeFileSync(walPath, "old wal");
    fs.writeFileSync(shmPath, "old shm");

    removeSqliteSidecars(dbPath);

    expect(fs.existsSync(walPath)).toBe(false);
    expect(fs.existsSync(shmPath)).toBe(false);
  });
});
