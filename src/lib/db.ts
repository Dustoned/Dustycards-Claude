import BetterSqlite3 from "better-sqlite3";
import { PrismaClient } from "@/generated/prisma";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { ensureLiveDbFile, LIVE_DB_PATH } from "@/lib/db-paths";

// SQLite defaults to the rollback journal ("delete"), where any writer blocks
// all readers. With a background price-refresh job writing thousands of rows in
// batches, that made page loads stall for up to busy_timeout (5s) during a
// refresh. WAL lets readers and writers run concurrently. journal_mode=WAL
// persists in the database file header, so flipping it once on the file is
// enough for every later Prisma connection; we set it on each boot so freshly
// provisioned databases (copied from the snapshot) get it too.
function enableWalMode() {
  try {
    const handle = new BetterSqlite3(LIVE_DB_PATH);
    try {
      handle.pragma("journal_mode = WAL");
      handle.pragma("synchronous = NORMAL");
      handle.pragma("busy_timeout = 5000");
    } finally {
      handle.close();
    }
  } catch (error) {
    console.warn(
      "[db] could not enable WAL mode:",
      error instanceof Error ? error.message : String(error)
    );
  }
}

function createClient() {
  ensureLiveDbFile();
  enableWalMode();
  const adapter = new PrismaBetterSqlite3({ url: LIVE_DB_PATH });
  return new PrismaClient({ adapter } as never);
}

type RuntimeDataModelField = { name: string };
type RuntimeDataModelModel = { fields?: RuntimeDataModelField[] };
type PrismaClientWithRuntimeModel = PrismaClient & {
  _runtimeDataModel?: {
    models?: Record<string, RuntimeDataModelModel | undefined>;
  };
};

const REQUIRED_RUNTIME_FIELDS = {
  User: ["email", "password_hash", "role", "disabled", "settings_json", "email_verified_at"],
  SocialConnection: [
    "requester_id",
    "addressee_id",
    "user_a_id",
    "user_b_id",
    "status",
    "accepted_at",
    "full_access_status",
    "full_access_requester_id",
    "full_access_requested_at",
    "full_access_accepted_at",
  ],
  Session: ["user_id", "token_hash", "expires_at"],
  PasswordResetToken: ["user_id", "token_hash", "expires_at", "used_at"],
  EmailVerificationToken: ["user_id", "token_hash", "expires_at"],
  Episode: ["game", "source_status", "source_checked_at", "source_actual_card_count", "is_user_submitted"],
  AppSetting: ["key", "value"],
  Card: [
    "game",
    "price_source_status",
    "price_source_checked_at",
    "native_history_synced_at",
    "native_history_status",
    "native_history_checked_at",
    "ebay_sold_graded_synced_at",
    "ebay_sold_graded_status",
    "ebay_sold_graded_checked_at",
    "is_user_submitted",
    "submitted_by_user_id",
    "tcggo_score",
    "tcggo_score_tier",
  ],
  SealedProduct: [
    "game",
    "cm_avg_7d",
    "cm_avg_30d",
    "native_history_synced_at",
    "native_history_status",
    "native_history_checked_at",
  ],
  CardGradedPriceSnapshot: ["price", "fetched_at"],
  CardEbaySoldGradedPrice: ["source", "currency", "sample_size"],
  CardEbaySoldGradedPriceSnapshot: ["source", "currency", "sample_size"],
  EbayListingCardOverride: ["user_id", "marketplace_id", "item_id", "card_id", "status"],
  SetPullRateProfile: ["set_code", "imported_at", "source_url", "booster_pack_ev_usd"],
  SetPullRateRarity: ["normalized_rarity", "specific_pull_denominator", "ev_per_pack_usd"],
  SealedPriceSnapshot: ["cm_avg_7d", "cm_avg_30d"],
  Price: ["cm_en_avg_7d", "cm_en_avg_30d", "cm_jp_lowest_nm", "changed_at"],
  CardSubmission: [
    "normalized_key",
    "credits_used",
    "official_card_id",
    "migrated_at",
    "input_condition",
    "detected_condition",
  ],
  CollectionBinder: ["user_id"],
  CollectionCard: ["user_id", "for_sale", "sale_price", "sold_at"],
  CollectionWant: ["user_id", "source", "source_episode_id", "dismissed_at"],
  CollectionSealed: ["user_id"],
  SyncLog: ["details_json"],
  SyncJob: ["details_json", "heartbeat_at"],
} as const;

function hasRuntimeField(
  client: PrismaClientWithRuntimeModel,
  modelName: keyof typeof REQUIRED_RUNTIME_FIELDS,
  fieldName: string
): boolean {
  const model = client._runtimeDataModel?.models?.[modelName];
  return model?.fields?.some((field) => field.name === fieldName) ?? false;
}

function isClientSchemaCompatible(client: PrismaClient): boolean {
  const runtimeClient = client as PrismaClientWithRuntimeModel;

  return Object.entries(REQUIRED_RUNTIME_FIELDS).every(([modelName, fields]) =>
    fields.every((fieldName) =>
      hasRuntimeField(
        runtimeClient,
        modelName as keyof typeof REQUIRED_RUNTIME_FIELDS,
        fieldName
      )
    )
  );
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
const cachedPrisma = globalForPrisma.prisma;

if (cachedPrisma && !isClientSchemaCompatible(cachedPrisma)) {
  void cachedPrisma.$disconnect().catch(() => undefined);
  globalForPrisma.prisma = undefined;
}

export const db = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
