ALTER TABLE "SocialConnection" ADD COLUMN "full_access_status" TEXT NOT NULL DEFAULT 'none';
ALTER TABLE "SocialConnection" ADD COLUMN "full_access_requester_id" TEXT;
ALTER TABLE "SocialConnection" ADD COLUMN "full_access_requested_at" DATETIME;
ALTER TABLE "SocialConnection" ADD COLUMN "full_access_accepted_at" DATETIME;

CREATE INDEX "SocialConnection_full_access_status_updated_at_idx" ON "SocialConnection"("full_access_status", "updated_at");
CREATE INDEX "SocialConnection_full_access_requester_id_idx" ON "SocialConnection"("full_access_requester_id");
