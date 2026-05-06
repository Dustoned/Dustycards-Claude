ALTER TABLE "User" ADD COLUMN "email_verified_at" DATETIME;

UPDATE "User"
SET "email_verified_at" = CURRENT_TIMESTAMP
WHERE "email_verified_at" IS NULL;

CREATE TABLE "EmailVerificationToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" DATETIME NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmailVerificationToken_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "EmailVerificationToken_token_hash_key" ON "EmailVerificationToken"("token_hash");
CREATE INDEX "EmailVerificationToken_user_id_idx" ON "EmailVerificationToken"("user_id");
CREATE INDEX "EmailVerificationToken_expires_at_idx" ON "EmailVerificationToken"("expires_at");
CREATE INDEX "User_email_verified_at_idx" ON "User"("email_verified_at");
