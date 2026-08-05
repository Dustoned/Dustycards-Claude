import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
