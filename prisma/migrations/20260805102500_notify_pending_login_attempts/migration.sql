ALTER TABLE "User" ADD COLUMN "approval_requested_at" DATETIME;

CREATE INDEX "User_disabled_approval_requested_at_idx"
ON "User"("disabled", "approval_requested_at");
