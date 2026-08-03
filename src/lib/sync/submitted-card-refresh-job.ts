import { db } from "@/lib/db";
import { refreshAdminCardSubmission } from "@/lib/card-submissions";

const JOB_TYPE_PREFIX = "submitted-card-refresh:";
const JOB_KIND = "submitted-card-refresh";
const JOB_HEARTBEAT_INTERVAL_MS = 15_000;

type SubmittedCardRefreshStatus = "idle" | "queued" | "running" | "success" | "failed";

interface SubmittedCardRefreshDetails {
  version: 1;
  kind: typeof JOB_KIND;
  cardId: string;
  submissionId: string;
  error: string | null;
}

export interface SubmittedCardRefreshJobSnapshot {
  status: SubmittedCardRefreshStatus;
  running: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
}

const activeJobs = new Map<string, Promise<void>>();

function getJobType(cardId: string): string {
  return `${JOB_TYPE_PREFIX}${cardId}`;
}

function encodeDetails(
  cardId: string,
  submissionId: string,
  error: string | null = null
): string {
  return JSON.stringify({
    version: 1,
    kind: JOB_KIND,
    cardId,
    submissionId,
    error,
  } satisfies SubmittedCardRefreshDetails);
}

function decodeDetails(value: string | null): SubmittedCardRefreshDetails | null {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value) as Partial<SubmittedCardRefreshDetails>;
    if (
      parsed.version !== 1 ||
      parsed.kind !== JOB_KIND ||
      typeof parsed.cardId !== "string" ||
      typeof parsed.submissionId !== "string"
    ) {
      return null;
    }

    return {
      version: 1,
      kind: JOB_KIND,
      cardId: parsed.cardId,
      submissionId: parsed.submissionId,
      error: typeof parsed.error === "string" ? parsed.error : null,
    };
  } catch {
    return null;
  }
}

function toSnapshot(
  job: Awaited<ReturnType<typeof db.syncJob.findUnique>>
): SubmittedCardRefreshJobSnapshot {
  if (!job) {
    return {
      status: "idle",
      running: false,
      startedAt: null,
      finishedAt: null,
      error: null,
    };
  }

  const details = decodeDetails(job.details_json);
  const status = (
    ["queued", "running", "success", "failed"].includes(job.status)
      ? job.status
      : "failed"
  ) as Exclude<SubmittedCardRefreshStatus, "idle">;

  return {
    status,
    running: status === "queued" || status === "running",
    startedAt: job.started_at?.toISOString() ?? null,
    finishedAt: job.finished_at?.toISOString() ?? null,
    error: status === "failed" ? details?.error ?? "Submitted-card refresh failed." : null,
  };
}

async function runJob(
  jobId: string,
  cardId: string,
  submissionId: string
): Promise<void> {
  const startedAt = new Date();
  await db.syncJob.update({
    where: { id: jobId },
    data: {
      status: "running",
      details_json: encodeDetails(cardId, submissionId),
      started_at: startedAt,
      finished_at: null,
      heartbeat_at: startedAt,
    },
  });

  const heartbeat = setInterval(() => {
    void db.syncJob
      .update({ where: { id: jobId }, data: { heartbeat_at: new Date() } })
      .catch(() => {});
  }, JOB_HEARTBEAT_INTERVAL_MS);
  heartbeat.unref?.();

  try {
    await refreshAdminCardSubmission(submissionId);
    const finishedAt = new Date();
    await db.syncJob.update({
      where: { id: jobId },
      data: {
        status: "success",
        details_json: encodeDetails(cardId, submissionId),
        finished_at: finishedAt,
        heartbeat_at: finishedAt,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const finishedAt = new Date();
    await Promise.all([
      db.syncJob.update({
        where: { id: jobId },
        data: {
          status: "failed",
          details_json: encodeDetails(cardId, submissionId, message),
          finished_at: finishedAt,
          heartbeat_at: finishedAt,
        },
      }),
      db.cardSubmission
        .update({
          where: { id: submissionId },
          data: {
            warnings_json: JSON.stringify([`Manual refresh failed: ${message}`]),
            last_scraped_at: finishedAt,
          },
        })
        .catch(() => null),
    ]);
  } finally {
    clearInterval(heartbeat);
  }
}

function launchJob(jobId: string, cardId: string, submissionId: string): void {
  const jobType = getJobType(cardId);
  if (activeJobs.has(jobType)) return;

  const job = runJob(jobId, cardId, submissionId)
    .catch(async (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      const finishedAt = new Date();
      await db.syncJob
        .update({
          where: { id: jobId },
          data: {
            status: "failed",
            details_json: encodeDetails(cardId, submissionId, message),
            finished_at: finishedAt,
            heartbeat_at: finishedAt,
          },
        })
        .catch(() => {});
    })
    .finally(() => {
      activeJobs.delete(jobType);
    });

  activeJobs.set(jobType, job);
}

export async function startSubmittedCardRefreshJob(
  cardId: string,
  submissionId: string
): Promise<SubmittedCardRefreshJobSnapshot> {
  const type = getJobType(cardId);
  const active = activeJobs.get(type);
  if (active) {
    return toSnapshot(await db.syncJob.findUnique({ where: { type } }));
  }

  const now = new Date();
  const job = await db.syncJob.upsert({
    where: { type },
    create: {
      type,
      status: "queued",
      details_json: encodeDetails(cardId, submissionId),
      started_at: now,
      heartbeat_at: now,
    },
    update: {
      status: "queued",
      details_json: encodeDetails(cardId, submissionId),
      started_at: now,
      finished_at: null,
      heartbeat_at: now,
    },
  });

  launchJob(job.id, cardId, submissionId);
  return {
    status: "queued",
    running: true,
    startedAt: now.toISOString(),
    finishedAt: null,
    error: null,
  };
}

export async function getSubmittedCardRefreshJobSnapshot(
  cardId: string
): Promise<SubmittedCardRefreshJobSnapshot> {
  const type = getJobType(cardId);
  const job = await db.syncJob.findUnique({ where: { type } });
  if (!job) return toSnapshot(null);

  const details = decodeDetails(job.details_json);
  if (
    (job.status === "queued" || job.status === "running") &&
    !activeJobs.has(type) &&
    details
  ) {
    // A deploy can interrupt an in-flight provider request. Polling the durable
    // job resumes that exact submitted card instead of leaving the UI stuck.
    launchJob(job.id, details.cardId, details.submissionId);
  }

  return toSnapshot(job);
}
