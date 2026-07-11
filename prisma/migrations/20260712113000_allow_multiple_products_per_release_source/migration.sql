DROP INDEX "SealedReleaseWatch_source_url_key";
CREATE UNIQUE INDEX "SealedReleaseWatch_source_url_name_key" ON "SealedReleaseWatch"("source_url", "name");
