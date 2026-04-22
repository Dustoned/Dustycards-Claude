import fs from "fs";
import path from "path";

export const LIVE_DB_PATH = path.resolve(process.cwd(), "dustycards.db");
export const APP_DB_SNAPSHOT_PATH = path.resolve(process.cwd(), "data", "dustycards.app.db");

export function ensureLiveDbFile() {
  if (fs.existsSync(LIVE_DB_PATH)) {
    return;
  }

  if (!fs.existsSync(APP_DB_SNAPSHOT_PATH)) {
    throw new Error(
      `DustyCards database not found. Expected ${LIVE_DB_PATH} or snapshot ${APP_DB_SNAPSHOT_PATH}.`
    );
  }

  fs.mkdirSync(path.dirname(LIVE_DB_PATH), { recursive: true });
  fs.copyFileSync(APP_DB_SNAPSHOT_PATH, LIVE_DB_PATH);
}
