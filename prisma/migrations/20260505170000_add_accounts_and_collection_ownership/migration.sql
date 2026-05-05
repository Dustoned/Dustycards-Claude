CREATE TABLE "User" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "email" TEXT NOT NULL,
  "password_hash" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'user',
  "disabled" BOOLEAN NOT NULL DEFAULT false,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "Session" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "user_id" TEXT NOT NULL,
  "token_hash" TEXT NOT NULL,
  "expires_at" DATETIME NOT NULL,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Session_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

ALTER TABLE "CollectionBinder" ADD COLUMN "user_id" TEXT REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CollectionCard" ADD COLUMN "user_id" TEXT REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CollectionSealed" ADD COLUMN "user_id" TEXT REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE INDEX "User_role_idx" ON "User"("role");
CREATE INDEX "User_disabled_idx" ON "User"("disabled");

CREATE UNIQUE INDEX "Session_token_hash_key" ON "Session"("token_hash");
CREATE INDEX "Session_user_id_idx" ON "Session"("user_id");
CREATE INDEX "Session_expires_at_idx" ON "Session"("expires_at");

CREATE INDEX "CollectionBinder_user_id_idx" ON "CollectionBinder"("user_id");
CREATE INDEX "CollectionCard_user_id_idx" ON "CollectionCard"("user_id");
CREATE INDEX "CollectionSealed_user_id_idx" ON "CollectionSealed"("user_id");
