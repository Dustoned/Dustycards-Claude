import { db } from "@/lib/db";
import { warmAllImages } from "@/lib/sync/image-warmer";

const RESULT_PREFIX = "DUSTYCARDS_IMAGE_WARM_RESULT ";

async function main() {
  if (process.env.DUSTYCARDS_IMAGE_WARM_DRY_RUN === "1") {
    console.log(`${RESULT_PREFIX}${JSON.stringify({ dryRun: true })}`);
    return;
  }

  const lastReported = new Map<string, number>();
  const result = await warmAllImages({
    onProgress: ({ phase, progress }) => {
      const previous = lastReported.get(phase) ?? -250;
      if (progress.processed !== progress.total && progress.processed - previous < 250) return;
      lastReported.set(phase, progress.processed);
      console.info(
        `[image-cache-warmer] ${phase} ${progress.processed}/${progress.total} ` +
          `hit=${progress.hits} new=${progress.downloaded} fail=${progress.failed}`
      );
    },
  });
  console.log(`${RESULT_PREFIX}${JSON.stringify(result)}`);
}

try {
  await main();
} catch (error) {
  console.error(
    "[image-cache-warmer]",
    error instanceof Error ? error.stack ?? error.message : String(error)
  );
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
