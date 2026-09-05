CREATE TABLE "Passkey" (
 "id" TEXT NOT NULL PRIMARY KEY, "user_id" TEXT NOT NULL, "public_key" TEXT NOT NULL,
 "counter" BIGINT NOT NULL DEFAULT 0, "name" TEXT NOT NULL, "transports_json" TEXT NOT NULL,
 "backed_up" BOOLEAN NOT NULL DEFAULT false, "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "last_used_at" DATETIME,
 CONSTRAINT "Passkey_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "Passkey_user_id_idx" ON "Passkey"("user_id");
ALTER TABLE "Session" ADD COLUMN "passkey_id" TEXT REFERENCES "Passkey"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE TABLE "PasskeyChallenge" (
 "id" TEXT NOT NULL PRIMARY KEY, "challenge" TEXT NOT NULL, "purpose" TEXT NOT NULL,
 "user_id" TEXT, "session_hash" TEXT, "security_stamp" TEXT, "expires_at" DATETIME NOT NULL
);
CREATE INDEX "PasskeyChallenge_expires_at_idx" ON "PasskeyChallenge"("expires_at");
