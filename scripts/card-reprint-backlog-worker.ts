import { writeFile, unlink } from "node:fs/promises";
import sharp from "sharp";
import { db } from "@/lib/db";
import {
  CARD_REPRINT_EXTERNAL_WORKER_HEARTBEAT_PATH,
  getCardReprintBacklogProgress,
  runCardReprintBacklogBatch,
} from "@/lib/sync/card-reprint-job";

const JOB_TYPE = "card-reprint-backlog";
const ACTIVE_USER_WINDOW_MS = 3 * 60_000;
const ACTIVE_USER_RECHECK_MS = 30_000;
const BETWEEN_FAMILIES_MS = 1_500;
const statusOnly = process.argv.includes("--status");
let stopRequested = false;

sharp.concurrency(1);
sharp.cache({ memory: 32, files: 0, items: 32 });

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function activeUserCount(now = new Date()): Promise<number> {
  const rows = await db.$queryRawUnsafe<Array<{ count: bigint | number }>>(
    `
    SELECT count(DISTINCT user_id) AS count
    FROM "Session"
    WHERE expires_at > ?
      AND coalesce(last_seen_at, created_at) >= ?
    `,
    now.toISOString(),
    new Date(now.getTime() - ACTIVE_USER_WINDOW_MS).toISOString()
  );
  return Number(rows[0]?.count ?? 0);
}

async function heartbeat(details: Record<string, unknown>, status = "running") {
  const now = new Date();
  await writeFile(CARD_REPRINT_EXTERNAL_WORKER_HEARTBEAT_PATH, now.toISOString(), "utf8");
  await db.syncJob.upsert({
    where: { type: JOB_TYPE },
    create: {
      type: JOB_TYPE,
      status,
      started_at: now,
      heartbeat_at: now,
      details_json: JSON.stringify(details),
    },
    update: {
      status,
      heartbeat_at: now,
      finished_at: status === "running" ? null : now,
      details_json: JSON.stringify(details),
    },
  });
}

async function main() {
  const initial = await getCardReprintBacklogProgress();
  if (statusOnly) {
    console.log(JSON.stringify(initial));
    return;
  }

  let groupsProcessed = 0;
  let cardsProcessed = 0;
  let relationsWritten = 0;
  await heartbeat({ ...initial, groupsProcessed, cardsProcessed, relationsWritten });

  while (!stopRequested) {
    const activeUsers = await activeUserCount();
    if (activeUsers > 0) {
      const progress = await getCardReprintBacklogProgress();
      await heartbeat({
        ...progress,
        groupsProcessed,
        cardsProcessed,
        relationsWritten,
        pausedForActiveUsers: activeUsers,
      });
      await wait(ACTIVE_USER_RECHECK_MS);
      continue;
    }

    const result = await runCardReprintBacklogBatch(new Date(), 1);
    groupsProcessed += result.groupsProcessed;
    cardsProcessed += result.cardsProcessed;
    relationsWritten += result.relationsWritten;
    const progress = await getCardReprintBacklogProgress();
    await heartbeat({
      ...progress,
      groupsProcessed,
      cardsProcessed,
      relationsWritten,
      pausedForActiveUsers: 0,
    });
    console.log(JSON.stringify({ ...progress, ...result, groupsProcessed, cardsProcessed }));

    if (result.groupsProcessed === 0 || progress.pendingFamilies === 0) break;
    await wait(BETWEEN_FAMILIES_MS);
  }

  const finalProgress = await getCardReprintBacklogProgress();
  await heartbeat({
    ...finalProgress,
    groupsProcessed,
    cardsProcessed,
    relationsWritten,
    stopped: stopRequested,
  }, stopRequested ? "paused" : "success");
}

process.on("SIGTERM", () => { stopRequested = true; });
process.on("SIGINT", () => { stopRequested = true; });

try {
  await main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  await heartbeat({ error: message }, "failed").catch(() => undefined);
  console.error(`[card-reprint-worker] ${message}`);
  process.exitCode = 1;
} finally {
  await unlink(CARD_REPRINT_EXTERNAL_WORKER_HEARTBEAT_PATH).catch(() => undefined);
  await db.$disconnect();
}
