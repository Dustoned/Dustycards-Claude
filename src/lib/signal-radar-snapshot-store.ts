import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ExpansionChaseRadarData } from "@/lib/expansion-chase-radar";
import type { ExternalSignalRadarData } from "@/lib/external-signal-radar";
import type { SealedSignalRadarData } from "@/lib/sealed-signal-radar";
import { normalizeExpansionChaseRadarData } from "@/lib/expansion-chase-compat";
import {
  ALL_GAMES,
  type TradingCardGame,
  type TradingCardGameFilter,
} from "@/lib/games";

// Prior snapshots can contain confidence and breakout labels from old evidence rules.
const SNAPSHOT_VERSION = 2;
const SNAPSHOT_DIRECTORY_NAME = "signal-radar-snapshots";

interface StoredSignalRadarSnapshot {
  version: number;
  writtenAt: string;
  data: ExternalSignalRadarData;
}

interface StoredSignalRadarChaseSnapshot {
  version: number;
  writtenAt: string;
  data: ExpansionChaseRadarData | null;
}

interface StoredSealedSignalRadarSnapshot {
  version: number;
  writtenAt: string;
  data: SealedSignalRadarData;
}

export interface SignalRadarSnapshot {
  writtenAt: string;
  data: ExternalSignalRadarData;
}

export interface SignalRadarChaseSnapshot {
  writtenAt: string;
  data: ExpansionChaseRadarData | null;
}

export interface SealedSignalRadarSnapshot {
  writtenAt: string;
  data: SealedSignalRadarData;
}

export interface SignalRadarChaseSnapshotKey {
  gameFilter: TradingCardGameFilter;
  episodeId: string | null;
}

function snapshotDirectory(): string {
  return path.join(process.cwd(), "data", SNAPSHOT_DIRECTORY_NAME);
}

function snapshotPath(gameFilter: TradingCardGameFilter): string {
  return path.join(snapshotDirectory(), `${gameFilter}.json`);
}

function chaseSnapshotPath(key: SignalRadarChaseSnapshotKey): string {
  const episodeKey = key.episodeId ?? "latest";
  const digest = createHash("sha256")
    .update(`${key.gameFilter}:${episodeKey}`)
    .digest("hex")
    .slice(0, 16);
  return path.join(snapshotDirectory(), `chase-${key.gameFilter}-${digest}.json`);
}

function sealedSnapshotPath(gameFilter: TradingCardGameFilter): string {
  return path.join(snapshotDirectory(), `sealed-${gameFilter}.json`);
}

function isRadarData(value: unknown): value is ExternalSignalRadarData {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ExternalSignalRadarData>;
  return (
    typeof candidate.generatedAt === "string" &&
    Array.isArray(candidate.signals) &&
    Array.isArray(candidate.sources) &&
    typeof candidate.unmatchedCount === "number" &&
    typeof candidate.scannedDeckCount === "number"
  );
}

function isSealedRadarData(value: unknown): value is SealedSignalRadarData {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<SealedSignalRadarData>;
  return (
    typeof candidate.generatedAt === "string" &&
    Array.isArray(candidate.items) &&
    typeof candidate.trackedProducts === "number" &&
    typeof candidate.eligibleProducts === "number" &&
    typeof candidate.establishedProducts === "number" &&
    typeof candidate.buildingProducts === "number" &&
    typeof candidate.learningProducts === "number" &&
    typeof candidate.ready90dProducts === "number" &&
    (candidate.updatedAt === null || typeof candidate.updatedAt === "string")
  );
}

async function readRuntimeFile(filePath: string): Promise<string> {
  // Reading through a file handle keeps Turbopack from treating the
  // environment-configurable runtime directory as a build-time asset glob.
  const file = await open(filePath, "r");
  try {
    return await file.readFile("utf8");
  } finally {
    await file.close();
  }
}

export function scopeSignalRadarData(
  data: ExternalSignalRadarData,
  gameFilter: TradingCardGameFilter
): ExternalSignalRadarData {
  if (gameFilter === ALL_GAMES) return data;

  const sources = data.sources.filter((source) => source.game === gameFilter);
  return {
    ...data,
    signals: data.signals
      .filter((signal) => signal.game === gameFilter)
      .map((signal, index) => ({ ...signal, rank: index + 1 })),
    sources,
    scannedDeckCount: sources.reduce((total, source) => total + source.deckCount, 0),
  };
}

export async function readSignalRadarSnapshot(
  gameFilter: TradingCardGameFilter
): Promise<SignalRadarSnapshot | null> {
  try {
    const raw = await readRuntimeFile(snapshotPath(gameFilter));
    const parsed = JSON.parse(raw) as Partial<StoredSignalRadarSnapshot>;
    if (
      parsed.version !== SNAPSHOT_VERSION ||
      typeof parsed.writtenAt !== "string" ||
      !isRadarData(parsed.data)
    ) {
      return null;
    }
    return { writtenAt: parsed.writtenAt, data: parsed.data };
  } catch {
    return null;
  }
}

async function writeSnapshot(
  gameFilter: TradingCardGameFilter,
  data: ExternalSignalRadarData,
  writtenAt: string
): Promise<void> {
  const directory = snapshotDirectory();
  await mkdir(directory, { recursive: true });
  const destination = snapshotPath(gameFilter);
  const temporary = `${destination}.${process.pid}.${randomUUID()}.tmp`;
  const payload: StoredSignalRadarSnapshot = {
    version: SNAPSHOT_VERSION,
    writtenAt,
    data: scopeSignalRadarData(data, gameFilter),
  };
  await writeFile(temporary, JSON.stringify(payload), "utf8");
  await rename(temporary, destination);
}

export async function writeSignalRadarSnapshots(
  data: ExternalSignalRadarData,
  now = new Date()
): Promise<void> {
  const games = [
    ...new Set(
      data.sources
        .map((source) => source.game)
        .filter((game): game is TradingCardGame => game === "pokemon" || game === "one-piece")
    ),
  ];
  const filters: TradingCardGameFilter[] =
    games.length > 1 ? [ALL_GAMES, ...games] : games;
  const writtenAt = now.toISOString();

  await Promise.all(filters.map((gameFilter) => writeSnapshot(gameFilter, data, writtenAt)));
}

export async function readSignalRadarChaseSnapshot(
  key: SignalRadarChaseSnapshotKey
): Promise<SignalRadarChaseSnapshot | null> {
  try {
    const raw = await readRuntimeFile(chaseSnapshotPath(key));
    const parsed = JSON.parse(raw) as Partial<StoredSignalRadarChaseSnapshot>;
    const validData =
      parsed.data === null ||
      (parsed.data &&
        typeof parsed.data === "object" &&
        typeof parsed.data.generatedAt === "string" &&
        Array.isArray(parsed.data.cards));
    if (
      parsed.version !== SNAPSHOT_VERSION ||
      typeof parsed.writtenAt !== "string" ||
      !validData
    ) {
      return null;
    }
    return {
      writtenAt: parsed.writtenAt,
      data:
        parsed.data === null
          ? null
          : normalizeExpansionChaseRadarData(parsed.data as ExpansionChaseRadarData),
    };
  } catch {
    return null;
  }
}

export async function writeSignalRadarChaseSnapshot(
  key: SignalRadarChaseSnapshotKey,
  data: ExpansionChaseRadarData | null,
  now = new Date()
): Promise<void> {
  const directory = snapshotDirectory();
  await mkdir(directory, { recursive: true });
  const destination = chaseSnapshotPath(key);
  const temporary = `${destination}.${process.pid}.${randomUUID()}.tmp`;
  const payload: StoredSignalRadarChaseSnapshot = {
    version: SNAPSHOT_VERSION,
    writtenAt: now.toISOString(),
    data,
  };
  await writeFile(temporary, JSON.stringify(payload), "utf8");
  await rename(temporary, destination);
}

export async function readSealedSignalRadarSnapshot(
  gameFilter: TradingCardGameFilter
): Promise<SealedSignalRadarSnapshot | null> {
  try {
    const raw = await readRuntimeFile(sealedSnapshotPath(gameFilter));
    const parsed = JSON.parse(raw) as Partial<StoredSealedSignalRadarSnapshot>;
    if (
      parsed.version !== SNAPSHOT_VERSION ||
      typeof parsed.writtenAt !== "string" ||
      !isSealedRadarData(parsed.data)
    ) {
      return null;
    }
    return { writtenAt: parsed.writtenAt, data: parsed.data };
  } catch {
    return null;
  }
}

export async function writeSealedSignalRadarSnapshot(
  gameFilter: TradingCardGameFilter,
  data: SealedSignalRadarData,
  now = new Date()
): Promise<void> {
  const directory = snapshotDirectory();
  await mkdir(directory, { recursive: true });
  const destination = sealedSnapshotPath(gameFilter);
  const temporary = `${destination}.${process.pid}.${randomUUID()}.tmp`;
  const payload: StoredSealedSignalRadarSnapshot = {
    version: SNAPSHOT_VERSION,
    writtenAt: now.toISOString(),
    data,
  };
  await writeFile(temporary, JSON.stringify(payload), "utf8");
  await rename(temporary, destination);
}
