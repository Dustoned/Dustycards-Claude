CREATE TABLE "SocialConnection" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "requester_id" TEXT NOT NULL,
  "addressee_id" TEXT NOT NULL,
  "user_a_id" TEXT NOT NULL,
  "user_b_id" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "accepted_at" DATETIME,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SocialConnection_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SocialConnection_addressee_id_fkey" FOREIGN KEY ("addressee_id") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SocialConnection_user_a_id_fkey" FOREIGN KEY ("user_a_id") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SocialConnection_user_b_id_fkey" FOREIGN KEY ("user_b_id") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SocialConnection_status_check" CHECK ("status" IN ('pending', 'accepted'))
);

CREATE UNIQUE INDEX "SocialConnection_user_a_id_user_b_id_key" ON "SocialConnection"("user_a_id", "user_b_id");
CREATE INDEX "SocialConnection_requester_id_status_idx" ON "SocialConnection"("requester_id", "status");
CREATE INDEX "SocialConnection_addressee_id_status_idx" ON "SocialConnection"("addressee_id", "status");
CREATE INDEX "SocialConnection_user_a_id_status_idx" ON "SocialConnection"("user_a_id", "status");
CREATE INDEX "SocialConnection_user_b_id_status_idx" ON "SocialConnection"("user_b_id", "status");
CREATE INDEX "SocialConnection_status_updated_at_idx" ON "SocialConnection"("status", "updated_at");
