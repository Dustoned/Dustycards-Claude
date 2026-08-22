import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  encryptAndVerifyLocalBackup,
  parseBackupMetadata,
  pruneLocalOffsiteBackups,
} from "./pull-production-backup.mjs";

describe("production backup pull helpers", () => {
  it("accepts only fixed daily backup metadata", () => {
    expect(parseBackupMetadata(JSON.stringify({
      name: "dustycards-daily-2026-08-23-022000.db",
      sizeBytes: 123,
      sha256: "a".repeat(64),
    }))).toMatchObject({ sizeBytes: 123 });
    expect(() => parseBackupMetadata(JSON.stringify({
      name: "../../dustycards.db",
      sizeBytes: 123,
      sha256: "a".repeat(64),
    }))).toThrow(/invalid backup metadata/i);
  });

  it("encrypts and authenticates a local backup before publishing it", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "dustycards-offsite-"));
    const source = path.join(directory, "source.db");
    const target = path.join(directory, "source.db.enc");
    await writeFile(source, Buffer.from("sqlite-backup-test".repeat(2_000)));

    const result = await encryptAndVerifyLocalBackup(source, target, Buffer.alloc(32, 7));

    expect(result.sizeBytes).toBeGreaterThan(0);
    expect((await readFile(target)).includes(Buffer.from("sqlite-backup-test"))).toBe(false);
  });

  it("keeps the newest seven encrypted nightlies and their manifests", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "dustycards-retention-"));
    for (let day = 1; day <= 9; day += 1) {
      const name = `dustycards-daily-2026-08-${String(day).padStart(2, "0")}-022000.db.enc`;
      await writeFile(path.join(directory, name), "encrypted");
      await writeFile(path.join(directory, `${name}.json`), "{}");
    }

    const stale = await pruneLocalOffsiteBackups(directory);

    expect(stale).toEqual([
      "dustycards-daily-2026-08-02-022000.db.enc",
      "dustycards-daily-2026-08-01-022000.db.enc",
    ]);
    await expect(readFile(path.join(directory, "dustycards-daily-2026-08-09-022000.db.enc"))).resolves.toBeTruthy();
  });
});
