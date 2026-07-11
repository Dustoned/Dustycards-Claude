ALTER TABLE "SealedProduct" ADD COLUMN "release_date" DATETIME;
ALTER TABLE "SealedProduct" ADD COLUMN "release_date_source" TEXT;
ALTER TABLE "SealedProduct" ADD COLUMN "release_date_source_url" TEXT;
ALTER TABLE "SealedProduct" ADD COLUMN "release_date_confidence" REAL;
ALTER TABLE "SealedProduct" ADD COLUMN "release_date_checked_at" DATETIME;

CREATE INDEX "SealedProduct_release_date_idx" ON "SealedProduct"("release_date");
