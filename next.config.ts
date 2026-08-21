import type { NextConfig } from "next";

const releaseBuild = process.env.NEXT_PUBLIC_APP_BUILD || process.env.APP_BUILD;
const safeReleaseBuild = releaseBuild?.replace(/[^a-zA-Z0-9._-]/g, "-");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Production builds into a release-specific directory so the running app
  // never reads a half-written Next.js manifest during an automatic deploy.
  // APP_BUILD is already provided by the existing production service, so this
  // also takes effect on the very first automatic deploy of this change.
  distDir: process.env.DUSTYCARDS_NEXT_DIST_DIR
    || (safeReleaseBuild ? `.next-releases/${safeReleaseBuild}` : ".next"),
  // Next uses this id on assets, RSC navigations and Server Actions. If a
  // browser still has the previous release open, a mismatch now becomes one
  // safe full navigation instead of a hanging soft navigation or a missing
  // Server Action/client-reference manifest error.
  deploymentId: safeReleaseBuild,
  allowedDevOrigins: ["127.0.0.1"],
  serverExternalPackages: ["sharp"],
  experimental: {
    // The production VPS has two CPUs. A single build worker plus the deploy
    // cgroup limit leaves capacity for the currently running app instead of
    // letting Turbopack discover dozens of host workers and pin both cores.
    cpus: 1,
  },
  outputFileTracingExcludes: {
    "*": [
      "**/data/image-cache/**/*",
      "**/.codex-screenshots/**/*",
      "**/.firecrawl/**/*",
      "**/screenshots-ui/**/*",
      "**/test-results/**/*",
      "**/playwright-report/**/*",
      "**/docs/**/*",
      "**/backups/**/*",
      "**/dustycards-db-backups/**/*",
      "**/dustycards.db",
      "**/dustycards.db-*",
      "**/*.db-wal",
      "**/*.db-shm",
    ],
  },
  onDemandEntries: {
    maxInactiveAge: 30 * 60 * 1000,
    pagesBufferLength: 16,
  },
  async headers() {
    return [
      {
        source: "/dustycards-sw.js",
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
          {
            key: "Service-Worker-Allowed",
            value: "/",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
