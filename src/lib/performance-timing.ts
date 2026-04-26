type TimingFields = Record<string, string | number | boolean | null | undefined>;

const ENABLED_VALUES = new Set(["1", "true", "yes", "on"]);

function isTimingEnabled(): boolean {
  const value = process.env.DUSTYCARDS_TIMING?.trim().toLowerCase();
  return value ? ENABLED_VALUES.has(value) : false;
}

function formatFields(fields?: TimingFields): string {
  if (!fields) return "";

  const entries = Object.entries(fields)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${value ?? "null"}`);

  return entries.length > 0 ? ` ${entries.join(" ")}` : "";
}

export function startPerformanceTimer(label: string, fields?: TimingFields) {
  const enabled = isTimingEnabled();
  const startedAt = enabled ? Date.now() : 0;

  return {
    finish(extraFields?: TimingFields) {
      if (!enabled) return;

      const durationMs = Date.now() - startedAt;
      console.info(
        `[dustycards:timing] ${label} ${durationMs}ms${formatFields({
          ...fields,
          ...extraFields,
        })}`
      );
    },
  };
}

export async function timeAsync<T>(
  label: string,
  work: () => Promise<T>,
  fields?: TimingFields
): Promise<T> {
  const timer = startPerformanceTimer(label, fields);

  try {
    return await work();
  } finally {
    timer.finish();
  }
}
