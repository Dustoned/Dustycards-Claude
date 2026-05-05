import { PrismaClient } from "@/generated/prisma";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { ensureLiveDbFile, LIVE_DB_PATH } from "@/lib/db-paths";

function createClient() {
  ensureLiveDbFile();
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
  User: ["email", "password_hash", "role", "disabled"],
  Session: ["user_id", "token_hash", "expires_at"],
  Episode: ["source_status", "source_checked_at", "source_actual_card_count"],
  Card: [
    "price_source_status",
    "price_source_checked_at",
    "native_history_synced_at",
    "native_history_status",
    "native_history_checked_at",
    "ebay_sold_graded_synced_at",
    "ebay_sold_graded_status",
    "ebay_sold_graded_checked_at",
    "tcggo_score",
    "tcggo_score_tier",
  ],
  SealedProduct: [
    "cm_avg_7d",
    "cm_avg_30d",
    "native_history_synced_at",
    "native_history_status",
    "native_history_checked_at",
  ],
  CardGradedPriceSnapshot: ["price", "fetched_at"],
  CardEbaySoldGradedPrice: ["source", "currency", "sample_size"],
  CardEbaySoldGradedPriceSnapshot: ["source", "currency", "sample_size"],
  SetPullRateProfile: ["set_code", "imported_at"],
  SetPullRateRarity: ["normalized_rarity", "specific_pull_denominator"],
  SealedPriceSnapshot: ["cm_avg_7d", "cm_avg_30d"],
  Price: ["cm_en_avg_7d", "cm_en_avg_30d"],
  CollectionBinder: ["user_id"],
  CollectionCard: ["user_id"],
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
