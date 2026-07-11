ALTER TABLE "Price" ADD COLUMN "changed_at" DATETIME;

UPDATE "Price"
SET "changed_at" = "fetched_at"
WHERE "changed_at" IS NULL;
