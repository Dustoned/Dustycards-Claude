ALTER TABLE "MarktplaatsDeal" ADD COLUMN "description_checked" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "MarktplaatsDeal" ADD COLUMN "description_summary" TEXT;
ALTER TABLE "MarktplaatsDeal" ADD COLUMN "offer_contents" TEXT;
