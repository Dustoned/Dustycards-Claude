CREATE TABLE "ActionCenterReceipt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "item_key" TEXT NOT NULL,
    "read_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ActionCenterReceipt_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ActionCenterReceipt_user_id_item_key_key" ON "ActionCenterReceipt"("user_id", "item_key");
CREATE INDEX "ActionCenterReceipt_user_id_read_at_idx" ON "ActionCenterReceipt"("user_id", "read_at");
CREATE INDEX "ActionCenterReceipt_created_at_idx" ON "ActionCenterReceipt"("created_at");
