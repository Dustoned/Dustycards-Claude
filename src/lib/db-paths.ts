import fs from "fs";
import path from "path";

export const LIVE_DB_PATH = path.join(process.cwd(), "dustycards.db");
export const APP_DB_SNAPSHOT_PATH = path.join(process.cwd(), "data", "dustycards.app.db");

export function getSqliteSidecarPaths(dbPath: string): string[] {
  return [`${dbPath}-wal`, `${dbPath}-shm`];
}

export function removeSqliteSidecars(dbPath: string) {
  for (const sidecarPath of getSqliteSidecarPaths(dbPath)) {
    if (fs.existsSync(/*turbopackIgnore: true*/ sidecarPath)) {
      fs.rmSync(/*turbopackIgnore: true*/ sidecarPath, { force: true });
    }
  }
}

export function ensureLiveDbFile() {
  if (fs.existsSync(/*turbopackIgnore: true*/ LIVE_DB_PATH)) {
    return;
  }

  if (!fs.existsSync(/*turbopackIgnore: true*/ APP_DB_SNAPSHOT_PATH)) {
    throw new Error(
      `DustyCards database not found. Expected ${LIVE_DB_PATH} or snapshot ${APP_DB_SNAPSHOT_PATH}.`
    );
  }

  fs.mkdirSync(/*turbopackIgnore: true*/ path.dirname(LIVE_DB_PATH), { recursive: true });
  removeSqliteSidecars(LIVE_DB_PATH);
  fs.copyFileSync(
    /*turbopackIgnore: true*/ APP_DB_SNAPSHOT_PATH,
    /*turbopackIgnore: true*/ LIVE_DB_PATH
  );
}
