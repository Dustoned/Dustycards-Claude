PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_Session" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "user_id" TEXT NOT NULL,
  "token_hash" TEXT NOT NULL,
  "expires_at" DATETIME NOT NULL,
  "last_seen_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Session_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "User" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "new_Session" (
  "id", "user_id", "token_hash", "expires_at", "last_seen_at", "created_at"
)
SELECT
  "id", "user_id", "token_hash", "expires_at", "created_at", "created_at"
FROM "Session";

DROP TABLE "Session";
ALTER TABLE "new_Session" RENAME TO "Session";

CREATE UNIQUE INDEX "Session_token_hash_key" ON "Session"("token_hash");
CREATE INDEX "Session_user_id_idx" ON "Session"("user_id");
CREATE INDEX "Session_expires_at_idx" ON "Session"("expires_at");
CREATE INDEX "Session_last_seen_at_idx" ON "Session"("last_seen_at");
CREATE INDEX "Session_user_id_last_seen_at_idx" ON "Session"("user_id", "last_seen_at");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
