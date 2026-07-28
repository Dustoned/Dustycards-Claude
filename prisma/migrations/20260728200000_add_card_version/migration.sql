-- TCGGo lists variant printings (Pokemon Center stamp, Oversized, ...) as
-- separate cards distinguished only by a version label. Store it so duplicate
-- card numbers such as "SVP 209" can be told apart in the app.
ALTER TABLE "Card" ADD COLUMN "version" TEXT;
