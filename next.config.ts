import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  serverExternalPackages: ["sharp"],
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
