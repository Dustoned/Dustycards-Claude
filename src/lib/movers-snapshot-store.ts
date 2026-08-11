import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CollectionMoversData, MoversItemScope, MoversScope } from "@/lib/movers";
import type { PriceSource } from "@/lib/user-settings";
import type { TradingCardGameFilter } from "@/lib/games";

const SNAPSHOT_VERSION = 2;
const SNAPSHOT_DIRECTORY_NAME = "movers-snapshots";
export const SHARED_MOVERS_SNAPSHOT_USER_ID = "__shared-market__";

export interface MoversSnapshotKey {
  userId: string;
  game: TradingCardGameFilter;
  source: PriceSource;
  scope: Exclude<MoversScope, "sealed">;
  itemScope: MoversItemScope;
}

interface StoredMoversSnapshot {
  version: number;
  writtenAt: string;
  data: CollectionMoversData;
}

export interface MoversSnapshot {
  writtenAt: string;
  data: CollectionMoversData;
}

function snapshotDirectory(): string {
  return path.join(process.cwd(), "data", SNAPSHOT_DIRECTORY_NAME);
}

function snapshotPath(key: MoversSnapshotKey): string {
  const digest = createHash("sha256")
    .update(`${key.userId}:${key.game}:${key.source}:${key.scope}:${key.itemScope}`)
    .digest("hex")
    .slice(0, 24);
  return path.join(snapshotDirectory(), `${digest}.json`);
}

async function readRuntimeFile(filePath: string): Promise<string> {
  const file = await open(filePath, "r");
  try {
    return await file.readFile("utf8");
  } finally {
    await file.close();
  }
}

function isMoversData(value: unknown): value is CollectionMoversData {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<CollectionMoversData>;
  return (
    typeof candidate.scope === "string" &&
    typeof candidate.preferredSource === "string" &&
    typeof candidate.trackedCards === "number" &&
    typeof candidate.eligibleCards === "number" &&
    Array.isArray(candidate.movers)
  );
}

export async function readMoversSnapshot(
  key: MoversSnapshotKey
): Promise<MoversSnapshot | null> {
  try {
    const raw = await readRuntimeFile(snapshotPath(key));
    const parsed = JSON.parse(raw) as Partial<StoredMoversSnapshot>;
    if (
      parsed.version !== SNAPSHOT_VERSION ||
      typeof parsed.writtenAt !== "string" ||
      !isMoversData(parsed.data)
    ) {
      return null;
    }
    return { writtenAt: parsed.writtenAt, data: parsed.data };
  } catch {
    return null;
  }
}

export async function writeMoversSnapshot(
  key: MoversSnapshotKey,
  data: CollectionMoversData,
  now = new Date()
): Promise<void> {
  const directory = snapshotDirectory();
  await mkdir(directory, { recursive: true });
  const destination = snapshotPath(key);
  const temporary = `${destination}.${process.pid}.${randomUUID()}.tmp`;
  const payload: StoredMoversSnapshot = {
    version: SNAPSHOT_VERSION,
    writtenAt: now.toISOString(),
    data,
  };
  await writeFile(temporary, JSON.stringify(payload), "utf8");
  await rename(temporary, destination);
}
