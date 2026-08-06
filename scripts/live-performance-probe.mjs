const origin = process.env.DUSTYCARDS_PUBLIC_ORIGIN || "https://dustycards.myftp.org";
const paths = ["/api/health", "/login"];
const slowThresholdMs = Number(process.env.DUSTYCARDS_PROBE_SLOW_MS || 1500);
let failed = false;

for (const pathname of paths) {
  const startedAt = performance.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(new URL(pathname, origin), {
      cache: "no-store",
      redirect: "manual",
      signal: controller.signal,
      headers: { "User-Agent": "DustyCards-Live-Probe/1.0" },
    });
    const durationMs = Math.round(performance.now() - startedAt);
    const ok = response.status >= 200 && response.status < 400;
    failed ||= !ok;
    console.log(
      JSON.stringify({
        event: "live_performance_probe",
        pathname,
        status: response.status,
        durationMs,
        slow: durationMs >= slowThresholdMs,
        ok,
      })
    );
  } catch (error) {
    failed = true;
    console.error(
      JSON.stringify({
        event: "live_performance_probe",
        pathname,
        durationMs: Math.round(performance.now() - startedAt),
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      })
    );
  } finally {
    clearTimeout(timeout);
  }
}

if (failed) process.exitCode = 1;
