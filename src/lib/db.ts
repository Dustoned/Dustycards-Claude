import { PrismaClient } from "@/generated/prisma";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { ensureLiveDbFile, LIVE_DB_PATH } from "@/lib/db-paths";

function createClient() {
  ensureLiveDbFile();
  const adapter = new PrismaBetterSqlite3({ url: LIVE_DB_PATH });
  return new PrismaClient({ adapter } as never);
}

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };
export const db = globalForPrisma.prisma ?? createClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
