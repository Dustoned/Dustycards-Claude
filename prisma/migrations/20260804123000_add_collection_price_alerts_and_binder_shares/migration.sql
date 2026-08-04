CREATE TABLE "CollectionPriceAlert" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "target_price_eur" REAL,
    "baseline_price_eur" REAL,
    "baseline_price_at" DATETIME,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "triggered_at" DATETIME,
    "triggered_price_eur" REAL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "CollectionPriceAlert_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "CollectionPriceAlert_user_id_target_type_target_id_key"
ON "CollectionPriceAlert"("user_id", "target_type", "target_id");
CREATE INDEX "CollectionPriceAlert_enabled_updated_at_idx"
ON "CollectionPriceAlert"("enabled", "updated_at");
CREATE INDEX "CollectionPriceAlert_target_type_target_id_enabled_idx"
ON "CollectionPriceAlert"("target_type", "target_id", "enabled");

CREATE TABLE "BinderShareLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "binder_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "revoked_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "BinderShareLink_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BinderShareLink_binder_id_fkey" FOREIGN KEY ("binder_id") REFERENCES "CollectionBinder" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "BinderShareLink_token_key" ON "BinderShareLink"("token");
CREATE UNIQUE INDEX "BinderShareLink_user_id_binder_id_key" ON "BinderShareLink"("user_id", "binder_id");
CREATE INDEX "BinderShareLink_binder_id_revoked_at_idx" ON "BinderShareLink"("binder_id", "revoked_at");
CREATE INDEX "BinderShareLink_revoked_at_updated_at_idx" ON "BinderShareLink"("revoked_at", "updated_at");
