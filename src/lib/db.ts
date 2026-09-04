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
  const adapter = new PrismaBetterSqlite3({
    url: LIVE_DB_PATH,
    timeout: 5_000,
  });
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
  User: ["email", "password_hash", "role", "disabled", "settings_json", "email_verified_at", "mfa_secret_encrypted", "mfa_recovery_codes_json", "mfa_enabled_at"],
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
  Session: ["user_id", "token_hash", "expires_at", "last_seen_at", "mfa_verified_at"],
  RateLimitBucket: ["key", "hits_json", "expires_at"],
  SecurityEvent: ["event_type", "severity", "ip_hash", "metadata_json", "created_at"],
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
    "market_score",
    "market_score_updated_at",
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
  CardEbayDemandListing: [
    "card_id",
    "marketplace_id",
    "mode",
    "item_id",
    "last_seen_at",
    "removed_at",
  ],
  CardEbayDemandSnapshot: [
    "card_id",
    "marketplace_id",
    "mode",
    "snapshot_date",
    "observed_count",
    "clean_count",
  ],
  EbayListingCardOverride: ["user_id", "marketplace_id", "item_id", "card_id", "status"],
  MarktplaatsScanRun: [
    "status",
    "source",
    "reference_exported_at",
    "started_at",
    "finished_at",
    "listings_checked",
    "deals_found",
  ],
  MarktplaatsCollectionInspection: ["external_id", "scan_run_id", "report_json", "observed_at", "removed_at"],
  MarktplaatsDeal: [
    "external_id",
    "scan_run_id",
    "kind",
    "listing_url",
    "listing_price_eur",
    "shipping_eur",
    "market_value_eur",
    "discount_percent",
    "match_confidence",
    "description_checked",
    "description_summary",
    "offer_contents",
    "removed_at",
  ],
  CardPriceAlert: [
    "user_id",
    "card_id",
    "kind",
    "target_price_eur",
    "baseline_price_eur",
    "baseline_price_at",
    "enabled",
    "triggered_at",
    "triggered_price_eur",
  ],
  CardPrintingEvidence: [
    "card_id",
    "image_url",
    "identity_json",
    "artwork_hash_full",
    "artwork_hash_illustration",
    "source_status",
    "source_checked_at",
    "match_status",
    "match_version",
    "matched_at",
  ],
  CardPrintingRelation: [
    "source_card_id",
    "target_card_id",
    "match_type",
    "match_method",
    "image_similarity",
    "model_version",
    "matched_at",
  ],
  CollectionPriceAlert: [
    "user_id",
    "target_type",
    "target_id",
    "kind",
    "target_price_eur",
    "baseline_price_eur",
    "baseline_price_at",
    "enabled",
    "triggered_at",
    "triggered_price_eur",
  ],
  NewReleaseChasePriceWatch: [
    "card_id",
    "episode_id",
    "candidate_rank",
    "status",
    "last_success_at",
    "next_attempt_at",
  ],
  SetPullRateProfile: ["set_code", "imported_at", "source_url", "booster_pack_ev_usd"],
  SetPullRateRarity: ["normalized_rarity", "specific_pull_denominator", "ev_per_pack_usd"],
  SealedPriceSnapshot: ["cm_avg_7d", "cm_avg_30d"],
  SetLifecycleObservation: [
    "episode_id",
    "status",
    "oop_probability",
    "confidence",
    "observation_bucket",
    "model_version",
  ],
  Price: [
    "cm_en_avg_7d",
    "cm_en_avg_30d",
    "cm_jp_lowest_nm",
    "changed_at",
    "source",
    "source_provider",
    "source_url",
  ],
  CardSubmission: [
    "normalized_key",
    "credits_used",
    "official_card_id",
    "migrated_at",
    "input_condition",
    "detected_condition",
  ],
  CardPromoOrigin: [
    "card_id",
    "product_id",
    "origin_name",
    "normalized_name",
    "origin_type",
    "source_name",
    "source_url",
    "confidence",
  ],
  Feedback: ["user_id", "category", "message", "page_url", "status"],
  CardPrintingOverride: ["user_id", "source_card_id", "target_card_id", "decision"],
  CollectionBinder: ["user_id"],
  BinderShareLink: ["user_id", "binder_id", "token", "revoked_at"],
  CollectionCard: [
    "user_id",
    "for_sale",
    "sale_price",
    "sold_at",
    "origin_sealed_product_id",
    "purchase_price_source",
    "opening_session_id",
    "sale_fee_eur",
    "sale_platform",
  ],
  CollectionWant: ["user_id", "source", "source_episode_id", "dismissed_at"],
  CollectionSealed: ["user_id"],
  SealedOpeningSession: [
    "user_id",
    "collection_sealed_id",
    "sealed_product_id",
    "packs_opened",
    "status",
  ],
  SyncLog: ["details_json"],
  SyncJob: ["details_json", "heartbeat_at"],
  FirecrawlCreditLedger: ["period_key", "idempotency_key", "estimated_credits", "credits_used"],
  ScrapeDoCreditLedger: ["period_key", "day_key", "idempotency_key", "estimated_credits", "credits_used"],
  ExternalSignalRun: ["kind", "status", "generated_at", "credits_used"],
  ExternalSignalObservation: [
    "run_id",
    "card_id",
    "external_score",
    "competitive_score",
    "catalyst_score",
    "hype_score",
    "risk_score",
    "hit_rate_2x_90",
    "model_version",
    "reference_price",
    "is_episode_entry",
    "observed_at",
  ],
  ExternalSignalOutcome: [
    "entry_observation_id",
    "horizon_days",
    "status",
    "coverage_ratio",
    "max_multiplier",
    "absolute_change_eur",
    "meaningful_move",
    "meaningful_direction_hit",
  ],
  ExternalSignalPriceObservation: [
    "card_id",
    "reference_source",
    "reference_price",
    "observed_day",
    "provenance",
  ],
  ExternalCatalystSource: ["canonical_url", "url_hash", "scrape_status", "last_seen_at"],
  ExternalCardCatalyst: ["source_id", "entity_key", "catalyst_type", "direction"],
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

let runtimeConfiguration: Promise<void> | null = null;

/**
 * Applies connection-local SQLite settings to Prisma's long-lived production
 * connection. WAL itself is persistent, while cache, mmap, timeout and temp
 * storage must be configured on the actual adapter connection on every boot.
 */
export function configureDatabaseConnection(): Promise<void> {
  if (runtimeConfiguration) return runtimeConfiguration;

  runtimeConfiguration = (async () => {
    await db.$executeRawUnsafe("PRAGMA busy_timeout = 5000");
    await db.$executeRawUnsafe("PRAGMA synchronous = NORMAL");
    await db.$executeRawUnsafe("PRAGMA cache_size = -65536");
    await db.$executeRawUnsafe("PRAGMA mmap_size = 134217728");
    await db.$executeRawUnsafe("PRAGMA temp_store = MEMORY");
  })().catch((error) => {
    runtimeConfiguration = null;
    throw error;
  });

  return runtimeConfiguration;
}

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
