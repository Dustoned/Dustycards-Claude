import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Writable } from "node:stream";
import { pathToFileURL } from "node:url";

const ENCRYPTED_MAGIC = Buffer.from("DUSTYCARDS-WINDOWS-OFFSITE-V1\n", "utf8");
const AUTH_TAG_BYTES = 16;
const RETAIN_DAILY_BACKUPS = 7;
const BACKUP_NAME_PATTERN = /^dustycards-daily-\d{4}-\d{2}-\d{2}-\d{6}\.db$/;

function parseArguments(args) {
  const options = { host: "", output: "" };
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === "--host") options.host = args[index += 1] ?? "";
    else if (value === "--output") options.output = args[index += 1] ?? "";
    else throw new Error(`Unknown argument: ${value}`);
  }
  if (!options.host.trim()) throw new Error("--host is required");
  if (!options.output.trim()) throw new Error("--output is required");
  return options;
}

export function parseBackupMetadata(value) {
  const parsed = JSON.parse(value);
  if (
    !parsed ||
    !BACKUP_NAME_PATTERN.test(parsed.name) ||
    !Number.isSafeInteger(parsed.sizeBytes) ||
    parsed.sizeBytes <= 0 ||
    !/^[a-f0-9]{64}$/.test(parsed.sha256)
  ) {
    throw new Error("Production returned invalid backup metadata");
  }
  return parsed;
}

function runSshCapture(host, remoteCommand) {
  return new Promise((resolve, reject) => {
    const child = spawn("ssh", [
      "-o", "BatchMode=yes",
      "-o", "StrictHostKeyChecking=yes",
      host,
      remoteCommand,
    ], { windowsHide: true });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`SSH metadata request failed (${code}): ${Buffer.concat(stderr).toString("utf8").trim()}`));
        return;
      }
      resolve(Buffer.concat(stdout).toString("utf8").trim());
    });
  });
}

async function streamProductionBackup(host, targetPath) {
  const child = spawn("ssh", [
    "-o", "BatchMode=yes",
    "-o", "StrictHostKeyChecking=yes",
    host,
    "sudo /usr/local/sbin/dustycards-apply-release --stream-latest-daily-backup",
  ], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  const hash = createHash("sha256");
  let sizeBytes = 0;
  const stderr = [];
  child.stderr.on("data", (chunk) => stderr.push(chunk));
  child.stdout.on("data", (chunk) => {
    sizeBytes += chunk.length;
    hash.update(chunk);
  });
  const completed = new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`SSH backup stream failed (${code}): ${Buffer.concat(stderr).toString("utf8").trim()}`));
        return;
      }
      resolve();
    });
  });
  await Promise.all([pipeline(child.stdout, createWriteStream(targetPath, { mode: 0o600 })), completed]);
  return { sizeBytes, sha256: hash.digest("hex") };
}

async function sha256File(filePath) {
  const hash = createHash("sha256");
  await pipeline(
    createReadStream(filePath),
    new Writable({
      write(chunk, _encoding, callback) {
        hash.update(chunk);
        callback();
      },
    })
  );
  return hash.digest("hex");
}

export async function encryptAndVerifyLocalBackup(sourcePath, targetPath, key) {
  if (!Buffer.isBuffer(key) || key.length !== 32) throw new Error("Backup key must contain 32 bytes");
  const partialPath = `${targetPath}.partial`;
  const iv = randomBytes(12);
  try {
    await fs.rm(partialPath, { force: true });
    await fs.writeFile(partialPath, Buffer.concat([ENCRYPTED_MAGIC, iv]), { mode: 0o600 });
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    await pipeline(
      createReadStream(sourcePath),
      cipher,
      createWriteStream(partialPath, { flags: "a", mode: 0o600 })
    );
    await fs.appendFile(partialPath, cipher.getAuthTag());

    const encryptedStat = await fs.stat(partialPath);
    const contentStart = ENCRYPTED_MAGIC.length + iv.length;
    const contentEnd = encryptedStat.size - AUTH_TAG_BYTES - 1;
    if (contentEnd < contentStart) throw new Error("Encrypted backup is incomplete");
    const handle = await fs.open(partialPath, "r");
    const header = Buffer.alloc(ENCRYPTED_MAGIC.length + iv.length);
    const tag = Buffer.alloc(AUTH_TAG_BYTES);
    try {
      await handle.read(header, 0, header.length, 0);
      await handle.read(tag, 0, tag.length, encryptedStat.size - AUTH_TAG_BYTES);
    } finally {
      await handle.close();
    }
    if (!header.subarray(0, ENCRYPTED_MAGIC.length).equals(ENCRYPTED_MAGIC)) {
      throw new Error("Encrypted backup header is invalid");
    }

    const verifiedHash = createHash("sha256");
    const decipher = createDecipheriv("aes-256-gcm", key, header.subarray(ENCRYPTED_MAGIC.length));
    decipher.setAuthTag(tag);
    await pipeline(
      createReadStream(partialPath, { start: contentStart, end: contentEnd }),
      decipher,
      new Writable({
        write(chunk, _encoding, callback) {
          verifiedHash.update(chunk);
          callback();
        },
      })
    );
    const [sourceHash, decryptedHash] = await Promise.all([
      sha256File(sourcePath),
      Promise.resolve(verifiedHash.digest("hex")),
    ]);
    if (sourceHash !== decryptedHash) throw new Error("Encrypted backup verification failed");
    await fs.rename(partialPath, targetPath);
    return { sourceHash, sizeBytes: encryptedStat.size };
  } catch (error) {
    await fs.rm(partialPath, { force: true });
    throw error;
  }
}

export async function pruneLocalOffsiteBackups(outputDir, keep = RETAIN_DAILY_BACKUPS) {
  const entries = await fs.readdir(outputDir, { withFileTypes: true });
  const encrypted = entries
    .filter((entry) => entry.isFile() && /^dustycards-daily-\d{4}-\d{2}-\d{2}-\d{6}\.db\.enc$/.test(entry.name))
    .map((entry) => entry.name)
    .sort((left, right) => right.localeCompare(left));
  const stale = encrypted.slice(keep);
  await Promise.all(stale.flatMap((name) => [
    fs.rm(path.join(outputDir, name), { force: true }),
    fs.rm(path.join(outputDir, `${name}.json`), { force: true }),
  ]));
  return stale;
}

async function loadOrCreateBackupKey(outputDir) {
  const keyPath = path.join(outputDir, ".dustycards-offsite.key");
  try {
    const key = await fs.readFile(keyPath);
    if (key.length !== 32) throw new Error("Existing local backup key has an invalid length");
    return key;
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    const key = randomBytes(32);
    await fs.writeFile(keyPath, key, { mode: 0o600, flag: "wx" });
    return key;
  }
}

export async function pullProductionBackup({ host, output }) {
  const outputDir = path.resolve(output);
  await fs.mkdir(outputDir, { recursive: true });
  const metadata = parseBackupMetadata(await runSshCapture(
    host,
    "sudo /usr/local/sbin/dustycards-apply-release --latest-daily-backup-metadata"
  ));
  const encryptedPath = path.join(outputDir, `${metadata.name}.enc`);
  const manifestPath = `${encryptedPath}.json`;
  try {
    const existingManifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
    const existingStat = await fs.stat(encryptedPath);
    if (existingManifest.sourceSha256 === metadata.sha256 && existingStat.size > 0) {
      return { skipped: true, metadata, encryptedPath };
    }
  } catch {
    // Missing or invalid local output is downloaded and rebuilt below.
  }

  const plainTemp = path.join(outputDir, `.${metadata.name}.${process.pid}.partial`);
  await fs.rm(plainTemp, { force: true });
  try {
    const streamed = await streamProductionBackup(host, plainTemp);
    if (streamed.sizeBytes !== metadata.sizeBytes || streamed.sha256 !== metadata.sha256) {
      throw new Error("Downloaded backup does not match production metadata");
    }
    const key = await loadOrCreateBackupKey(outputDir);
    const encrypted = await encryptAndVerifyLocalBackup(plainTemp, encryptedPath, key);
    await fs.writeFile(manifestPath, `${JSON.stringify({
      name: metadata.name,
      sourceSizeBytes: metadata.sizeBytes,
      sourceSha256: metadata.sha256,
      encryptedSizeBytes: encrypted.sizeBytes,
      pulledAt: new Date().toISOString(),
    }, null, 2)}\n`, { mode: 0o600 });
    await pruneLocalOffsiteBackups(outputDir);
    return { skipped: false, metadata, encryptedPath };
  } finally {
    await fs.rm(plainTemp, { force: true });
  }
}

async function main() {
  const result = await pullProductionBackup(parseArguments(process.argv.slice(2)));
  console.log(JSON.stringify({ ok: true, ...result }));
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => {
    console.error("[pull-production-backup]", error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
