import type { Prisma } from "@/generated/prisma";
import { db } from "@/lib/db";
import {
  getCollectionCardMarketValue,
  getCollectionMatchedGradedPrice,
} from "@/lib/collection";
import {
  HIDDEN_EXPANSION_CODES,
  HIDDEN_EXPANSION_IDS,
  HIDDEN_EXPANSION_NAMES,
  REDUNDANT_SUBSET_PATTERNS,
} from "@/lib/episodes";
import type { EpisodePriceHistorySnapshot } from "@/lib/price-history";
import type { CollectionCardViewItem } from "@/types/collection-view";

export type CardCategoryGroup =
  | "Featured"
  | "Modern Hits"
  | "Rarities"
  | "Mechanics"
  | "Vintage";

export type CardCategoryTone = "slate" | "emerald" | "amber" | "sky" | "rose" | "violet" | "blue";

export interface CardCategoryDefinition {
  slug: string;
  title: string;
  shortTitle: string;
  description: string;
  group: CardCategoryGroup;
  icon: string;
  tone: CardCategoryTone;
  where: Prisma.CardWhereInput;
}

export interface CardCategorySummary extends CardCategoryDefinition {
  count: number;
}

export interface CardCategoryPageData {
  category: CardCategoryDefinition;
  items: CollectionCardViewItem[];
  priceSnapshots: EpisodePriceHistorySnapshot[];
  totalCards: number;
  ownedCards: number;
  wantedCards: number;
  pricedCards: number;
  setCount: number;
  estimatedValue: number | null;
}

const CATEGORY_GROUP_ORDER: CardCategoryGroup[] = [
  "Featured",
  "Modern Hits",
  "Rarities",
  "Mechanics",
  "Vintage",
];

const CATEGORY_GROUP_RANK = new Map(
  CATEGORY_GROUP_ORDER.map((group, index) => [group, index])
);

const PRICE_SELECT = {
  cm_en_lowest_nm: true,
  cm_de_lowest_nm: true,
  cm_fr_lowest_nm: true,
  cm_es_lowest_nm: true,
  cm_it_lowest_nm: true,
  tcp_market: true,
} satisfies Prisma.PriceSelect;

const CATEGORY_CARD_SELECT = {
  id: true,
  name: true,
  image_url: true,
  card_number: true,
  rarity: true,
  supertype: true,
  prices: {
    orderBy: { fetched_at: "desc" },
    take: 1,
    select: PRICE_SELECT,
  },
  gradedPrices: {
    orderBy: [{ price: "desc" }, { label: "asc" }],
    select: {
      label: true,
      price: true,
    },
  },
  episode: {
    select: {
      id: true,
      name: true,
      code: true,
      release_date: true,
    },
  },
} satisfies Prisma.CardSelect;

type CategoryCardRecord = Prisma.CardGetPayload<{ select: typeof CATEGORY_CARD_SELECT }>;

type OwnedCategoryRecord = {
  id: string;
  binder_id: string | null;
  purchase_price: number | null;
  condition: string | null;
  language: string | null;
  notes: string | null;
  grading_company: string | null;
  grading_grade: string | null;
  tags: Array<{ label: string }>;
  card_id: string;
};

type WantCategoryRecord = {
  id: string;
  card_id: string;
};

const SQLITE_SAFE_CHUNK_SIZE = 250;

function chunkValues<T>(values: T[], size = SQLITE_SAFE_CHUNK_SIZE): T[][] {
  const chunks: T[][] = [];

  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }

  return chunks;
}

function placeholdersFor(values: unknown[]): string {
  return values.map(() => "?").join(", ");
}

function rarityIn(values: string[]): Prisma.CardWhereInput {
  return { rarity: { in: values } };
}

function nameContains(value: string): Prisma.CardWhereInput {
  return { name: { contains: value } };
}

function cardsInEpisodeCode(code: string, cardNumbers: string[]): Prisma.CardWhereInput {
  return {
    AND: [
      { episode: { code } },
      { card_number: { in: cardNumbers } },
    ],
  };
}

const RAINBOW_LABELED_ALT_ART_WHERE: Prisma.CardWhereInput = {
  OR: [
    cardsInEpisodeCode("BST", ["168", "170"]),
    cardsInEpisodeCode("CRE", ["201", "203", "205"]),
    cardsInEpisodeCode("EVS", ["205", "209", "212", "215", "218", "220"]),
    cardsInEpisodeCode("FST", ["266", "269", "270", "271"]),
  ],
};

const SECRET_RARE_RARITIES = ["Rare Secret", "Secret Rare", "SECRET RARE"];

const SWORD_SHIELD_GOLD_SECRET_RARE_EPISODE_CODES = [
  "SSH",
  "RCL",
  "DAA",
  "CPA",
  "VIV",
  "SHF",
  "BST",
  "CRE",
  "EVS",
  "FST",
  "BRS",
  "ASR",
  "PGO",
  "LOR",
  "SIT",
];

const FORCE_SECRET_RARE_WHERE: Prisma.CardWhereInput = {
  OR: [
    cardsInEpisodeCode("CPA", ["79"]),
    cardsInEpisodeCode("MT", ["124"]),
    { name: { contains: "Alph Lithograph" } },
    { name: { contains: "Here Comes Team Rocket!" } },
  ],
};

// The source uses Rare Secret for both classic secret rares and gold-treatment cards.
const GOLD_SECRET_RARE_WHERE: Prisma.CardWhereInput = {
  AND: [
    rarityIn(SECRET_RARE_RARITIES),
    { NOT: FORCE_SECRET_RARE_WHERE },
    {
      OR: [
        { supertype: { in: ["Trainer", "Energy"] } },
        { episode: { code: { in: SWORD_SHIELD_GOLD_SECRET_RARE_EPISODE_CODES } } },
        cardsInEpisodeCode("LTR", ["114", "115"]),
        cardsInEpisodeCode("CRZ", ["GG67", "GG68", "GG69", "GG70"]),
        cardsInEpisodeCode("HIF", ["SV91", "SV92", "SV93", "SV94"]),
        cardsInEpisodeCode("UPR", ["172", "173"]),
        cardsInEpisodeCode("DRM", ["78"]),
      ],
    },
  ],
};

function buildVisibleEpisodeWhere(): Prisma.EpisodeWhereInput {
  const hiddenConditions: Prisma.EpisodeWhereInput[] = [];

  if (HIDDEN_EXPANSION_IDS.length > 0) {
    hiddenConditions.push({ id: { in: [...HIDDEN_EXPANSION_IDS] } });
  }

  if (HIDDEN_EXPANSION_CODES.length > 0) {
    hiddenConditions.push({
      OR: HIDDEN_EXPANSION_CODES.map((code) => ({ code: { contains: code } })),
    });
  }

  if (HIDDEN_EXPANSION_NAMES.length > 0) {
    hiddenConditions.push({
      OR: HIDDEN_EXPANSION_NAMES.map((name) => ({ name: { contains: name } })),
    });
  }

  if (REDUNDANT_SUBSET_PATTERNS.length > 0) {
    hiddenConditions.push({
      OR: REDUNDANT_SUBSET_PATTERNS.map((name) => ({ name: { contains: name } })),
    });
  }

  return hiddenConditions.length === 1
    ? { NOT: hiddenConditions[0] }
    : { NOT: hiddenConditions };
}

const VISIBLE_EPISODE_WHERE = buildVisibleEpisodeWhere();

function withVisibleCards(where: Prisma.CardWhereInput): Prisma.CardWhereInput {
  return {
    AND: [
      where,
      {
        episode: VISIBLE_EPISODE_WHERE,
      },
    ],
  };
}

export const CARD_CATEGORIES: ReadonlyArray<CardCategoryDefinition> = [
  {
    slug: "special-illustration-rare",
    title: "Special Illustration Rare",
    shortTitle: "SIR / SAR",
    description:
      "Modern chase cards with the full illustration treatment, including Special Art Rare imports.",
    group: "Featured",
    icon: "sparkles",
    tone: "violet",
    where: rarityIn(["Special Illustration Rare", "Special Art Rare"]),
  },
  {
    slug: "trainer-full-art",
    title: "Trainer Full Art",
    shortTitle: "Trainer FA",
    description:
      "Full-art trainer cards and newer trainer illustration hits, sorted beautifully in one list.",
    group: "Featured",
    icon: "user-round",
    tone: "rose",
    where: {
      AND: [
        { supertype: "Trainer" },
        rarityIn([
          "Rare Ultra",
          "Ultra Rare",
          "Illustration Rare",
          "Special Illustration Rare",
        ]),
      ],
    },
  },
  {
    slug: "tag-team-gx",
    title: "Tag Team GX",
    shortTitle: "Tag Team",
    description:
      "Sun & Moon era GX cards where two or more Pokemon share the same card.",
    group: "Featured",
    icon: "users-round",
    tone: "amber",
    where: {
      AND: [
        { supertype: "Pokémon" },
        nameContains("&"),
        { name: { contains: "-GX" } },
      ],
    },
  },
  {
    slug: "team-rockets-pokemon",
    title: "Team Rocket's Pokemon",
    shortTitle: "Team Rocket",
    description:
      "Cards carrying the Team Rocket owner name, from nostalgic classics to new chase cards.",
    group: "Featured",
    icon: "shield",
    tone: "slate",
    where: nameContains("Rocket's"),
  },
  {
    slug: "illustration-rare",
    title: "Illustration Rare",
    shortTitle: "IR / AR",
    description:
      "Art Rare and Illustration Rare cards with scenic full-card artwork.",
    group: "Modern Hits",
    icon: "image",
    tone: "sky",
    where: rarityIn(["Illustration Rare", "Art Rare"]),
  },
  {
    slug: "pokemon-ex",
    title: "Pokemon ex",
    shortTitle: "ex",
    description:
      "Pokemon ex cards across eras, including modern Scarlet & Violet era ex chase cards.",
    group: "Modern Hits",
    icon: "badge",
    tone: "blue",
    where: {
      AND: [
        { supertype: "Pokémon" },
        {
          OR: [
            { name: { contains: " ex" } },
            { name: { contains: "-EX" } },
            { rarity: "Rare Holo EX" },
          ],
        },
      ],
    },
  },
  {
    slug: "pokemon-gx",
    title: "Pokemon GX",
    shortTitle: "GX",
    description: "GX cards from the Sun & Moon era, including promos and rainbow variants.",
    group: "Modern Hits",
    icon: "badge",
    tone: "emerald",
    where: {
      AND: [
        { supertype: "Pokémon" },
        {
          OR: [
            { name: { contains: "-GX" } },
            { rarity: "Rare Holo GX" },
            { rarity: "Rare Shiny GX" },
          ],
        },
      ],
    },
  },
  {
    slug: "pokemon-v",
    title: "Pokemon V",
    shortTitle: "V",
    description: "Sword & Shield era Pokemon V cards without mixing in VMAX or VSTAR.",
    group: "Modern Hits",
    icon: "zap",
    tone: "amber",
    where: {
      AND: [
        { supertype: "Pokémon" },
        { name: { endsWith: " V" } },
      ],
    },
  },
  {
    slug: "pokemon-vmax",
    title: "Pokemon VMAX",
    shortTitle: "VMAX",
    description: "Oversized VMAX evolutions and alternate arts from Sword & Shield.",
    group: "Modern Hits",
    icon: "chevrons-up",
    tone: "violet",
    where: {
      AND: [
        { supertype: "Pokémon" },
        { name: { contains: "VMAX" } },
      ],
    },
  },
  {
    slug: "pokemon-vstar",
    title: "Pokemon VSTAR",
    shortTitle: "VSTAR",
    description: "VSTAR Pokemon cards, including regular, promo and secret versions.",
    group: "Modern Hits",
    icon: "star",
    tone: "sky",
    where: {
      AND: [
        { supertype: "Pokémon" },
        { name: { contains: "VSTAR" } },
      ],
    },
  },
  {
    slug: "ace-spec",
    title: "ACE SPEC",
    shortTitle: "ACE SPEC",
    description: "Powerful ACE SPEC Trainer cards from Black & White and Scarlet & Violet.",
    group: "Rarities",
    icon: "badge-check",
    tone: "rose",
    where: rarityIn(["ACE SPEC Rare", "Rare ACE"]),
  },
  {
    slug: "shiny-pokemon",
    title: "Shiny Pokemon",
    shortTitle: "Shiny",
    description: "Shiny Vault, Paldean Fates and older shiny rarity cards in one place.",
    group: "Rarities",
    icon: "sparkle",
    tone: "emerald",
    where: rarityIn(["Rare Shiny", "Rare Shiny GX", "Shiny Rare", "Shiny Ultra Rare"]),
  },
  {
    slug: "radiant-pokemon",
    title: "Radiant Pokemon",
    shortTitle: "Radiant",
    description: "Radiant Rare Pokemon from Sword & Shield special sets.",
    group: "Rarities",
    icon: "sun",
    tone: "amber",
    where: {
      OR: [
        { rarity: "Radiant Rare" },
        { name: { startsWith: "Radiant " } },
      ],
    },
  },
  {
    slug: "rainbow-rare",
    title: "Rainbow Rare",
    shortTitle: "Rainbow",
    description:
      "True rainbow textured secret rares from Sun & Moon and Sword & Shield.",
    group: "Rarities",
    icon: "rainbow",
    tone: "sky",
    where: {
      AND: [
        rarityIn(["Rare Rainbow"]),
        { NOT: RAINBOW_LABELED_ALT_ART_WHERE },
      ],
    },
  },
  {
    slug: "secret-alternate-arts",
    title: "Secret Alternate Arts",
    shortTitle: "Secret Alt",
    description:
      "Normal-art secret VMAX chase cards that the source labels inside the Rainbow Rare bucket.",
    group: "Rarities",
    icon: "image",
    tone: "violet",
    where: {
      AND: [
        rarityIn(["Rare Rainbow"]),
        RAINBOW_LABELED_ALT_ART_WHERE,
      ],
    },
  },
  {
    slug: "gold-cards",
    title: "Gold Cards",
    shortTitle: "Gold",
    description:
      "Hyper Rares and gold-treatment Secret Rares, kept separate from classic Secret Rares.",
    group: "Rarities",
    icon: "gem",
    tone: "amber",
    where: {
      OR: [
        rarityIn(["Hyper Rare", "Mega Hyper Rare"]),
        GOLD_SECRET_RARE_WHERE,
      ],
    },
  },
  {
    slug: "gold-secret-rare",
    title: "Secret Rare",
    shortTitle: "Secret",
    description:
      "Secret-numbered chase cards with gold-treatment cards filtered into Gold Cards.",
    group: "Rarities",
    icon: "sparkles",
    tone: "amber",
    where: {
      AND: [
        rarityIn(SECRET_RARE_RARITIES),
        { NOT: GOLD_SECRET_RARE_WHERE },
      ],
    },
  },
  {
    slug: "trainer-gallery",
    title: "Trainer Gallery",
    shortTitle: "TG",
    description: "Trainer Gallery Rare Holo cards from Sword & Shield era sets.",
    group: "Mechanics",
    icon: "gallery-horizontal",
    tone: "violet",
    where: rarityIn(["Trainer Gallery Rare Holo"]),
  },
  {
    slug: "promo-cards",
    title: "Promo Cards",
    shortTitle: "Promos",
    description: "Black Star promos and other promotional cards from across the catalog.",
    group: "Mechanics",
    icon: "ticket",
    tone: "blue",
    where: rarityIn(["Promo"]),
  },
  {
    slug: "amazing-rare",
    title: "Amazing Rare",
    shortTitle: "Amazing",
    description: "The small but loud Amazing Rare run from the Sword & Shield era.",
    group: "Mechanics",
    icon: "asterisk",
    tone: "rose",
    where: rarityIn(["Amazing Rare"]),
  },
  {
    slug: "classic-collection",
    title: "Classic Collection",
    shortTitle: "Classic",
    description: "Celebrations Classic Collection reprints grouped together.",
    group: "Vintage",
    icon: "archive",
    tone: "slate",
    where: rarityIn(["Classic Collection"]),
  },
  {
    slug: "pokemon-star",
    title: "Pokemon Star",
    shortTitle: "Star",
    description: "Rare Holo Star cards, one of the classic grail categories.",
    group: "Vintage",
    icon: "star",
    tone: "amber",
    where: rarityIn(["Rare Holo Star"]),
  },
  {
    slug: "legend-cards",
    title: "LEGEND Cards",
    shortTitle: "LEGEND",
    description: "Two-piece LEGEND cards from the HeartGold & SoulSilver era.",
    group: "Vintage",
    icon: "columns-2",
    tone: "violet",
    where: rarityIn(["LEGEND"]),
  },
  {
    slug: "lv-x",
    title: "LV.X",
    shortTitle: "LV.X",
    description: "Diamond & Pearl and Platinum era LV.X Pokemon cards.",
    group: "Vintage",
    icon: "arrow-up-right",
    tone: "sky",
    where: {
      OR: [
        rarityIn(["Rare Holo LV.X"]),
        { name: { contains: "LV.X" } },
      ],
    },
  },
  {
    slug: "prime-cards",
    title: "Prime Cards",
    shortTitle: "Prime",
    description: "HeartGold & SoulSilver era Prime cards with close-up artwork.",
    group: "Vintage",
    icon: "circle-dot",
    tone: "emerald",
    where: rarityIn(["Rare Prime"]),
  },
  {
    slug: "break-cards",
    title: "BREAK Cards",
    shortTitle: "BREAK",
    description: "XY era horizontal BREAK evolution cards.",
    group: "Vintage",
    icon: "split",
    tone: "rose",
    where: rarityIn(["Rare BREAK"]),
  },
  {
    slug: "prism-star",
    title: "Prism Star",
    shortTitle: "Prism",
    description: "Sun & Moon Prism Star cards, including Pokemon, Trainers and Energy.",
    group: "Vintage",
    icon: "diamond",
    tone: "blue",
    where: rarityIn(["Rare Prism Star"]),
  },
];

export function getCategoryGroups(): CardCategoryGroup[] {
  return CATEGORY_GROUP_ORDER;
}

export function getCardCategory(slug: string): CardCategoryDefinition | null {
  return CARD_CATEGORIES.find((category) => category.slug === slug) ?? null;
}

export function sortCategorySummaries<T extends { group: CardCategoryGroup; title: string }>(
  categories: T[]
): T[] {
  return [...categories].sort((a, b) => {
    const groupDiff =
      (CATEGORY_GROUP_RANK.get(a.group) ?? 999) - (CATEGORY_GROUP_RANK.get(b.group) ?? 999);
    if (groupDiff !== 0) return groupDiff;
    return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
  });
}

export async function getCardCategorySummaries(): Promise<CardCategorySummary[]> {
  const counts = await Promise.all(
    CARD_CATEGORIES.map((category) =>
      db.card.count({
        where: withVisibleCards(category.where),
      })
    )
  );

  return sortCategorySummaries(
    CARD_CATEGORIES.map((category, index) => ({
      ...category,
      count: counts[index] ?? 0,
    })).filter((category) => category.count > 0)
  );
}

function buildOwnedMap(records: OwnedCategoryRecord[], cardsById: Map<string, CategoryCardRecord>) {
  const ownedByCardId = new Map<
    string,
    {
      count: number;
      purchasePrice: number;
      condition: string | null;
      language: string | null;
      notes: string | null;
      tags: string[];
      gradingCompany: string | null;
      gradingGrade: string | null;
      itemIds: string[];
      binderId: string | null;
      currentValue: number;
      cmValue: number;
      tcpValue: number;
    }
  >();

  for (const item of records) {
    const card = cardsById.get(item.card_id);
    const itemCurrentValue =
      getCollectionCardMarketValue(card, {
        gradingCompany: item.grading_company,
        gradingGrade: item.grading_grade,
      }) ?? 0;
    const itemCmValue = getCollectionCardMarketValue(card) ?? 0;
    const itemTcpValue = card?.prices[0]?.tcp_market ?? 0;
    const existing = ownedByCardId.get(item.card_id);

    if (existing) {
      existing.count += 1;
      existing.purchasePrice += item.purchase_price ?? 0;
      existing.itemIds.push(item.id);
      existing.currentValue += itemCurrentValue;
      existing.cmValue += itemCmValue;
      existing.tcpValue += itemTcpValue;
      continue;
    }

    ownedByCardId.set(item.card_id, {
      count: 1,
      purchasePrice: item.purchase_price ?? 0,
      condition: item.condition,
      language: item.language,
      notes: item.notes,
      tags: item.tags.map((tag) => tag.label),
      gradingCompany: item.grading_company,
      gradingGrade: item.grading_grade,
      itemIds: [item.id],
      binderId: item.binder_id,
      currentValue: itemCurrentValue,
      cmValue: itemCmValue,
      tcpValue: itemTcpValue,
    });
  }

  return ownedByCardId;
}

function buildCategoryItem(
  card: CategoryCardRecord,
  owned: ReturnType<typeof buildOwnedMap> extends Map<string, infer T> ? T | undefined : never,
  wantItemId: string | null
): CollectionCardViewItem {
  const ownedCurrentValue = owned ? Number(owned.currentValue.toFixed(2)) : null;
  const cmValue = owned ? Number(owned.cmValue.toFixed(2)) : getCollectionCardMarketValue(card);
  const tcpValue = owned
    ? Number(owned.tcpValue.toFixed(2))
    : card.prices[0]?.tcp_market ?? null;
  const matchedGradedPrice = owned
    ? getCollectionMatchedGradedPrice(card, {
        gradingCompany: owned.gradingCompany,
        gradingGrade: owned.gradingGrade,
      })
    : null;

  return {
    collection_item_id: owned?.itemIds.length === 1 ? owned.itemIds[0] : null,
    collection_item_ids: owned?.itemIds ?? [],
    want_item_id: wantItemId,
    binder_id: owned?.binderId ?? null,
    card_id: card.id,
    name: card.name,
    image_url: card.image_url,
    card_number: card.card_number,
    rarity: card.rarity,
    supertype: card.supertype,
    episode_id: card.episode.id,
    episode_name: card.episode.name,
    episode_code: card.episode.code,
    cm_value: cmValue,
    tcp_value: tcpValue,
    current_value: ownedCurrentValue ?? cmValue,
    current_value_label: matchedGradedPrice?.label ?? null,
    purchase_price: owned ? Number(owned.purchasePrice.toFixed(2)) : null,
    cost_basis_value: owned ? Number(owned.purchasePrice.toFixed(2)) : null,
    cost_basis_label: "Paid",
    cost_basis_source: "direct",
    condition: owned?.condition ?? null,
    language: owned?.language ?? null,
    notes: owned?.notes ?? null,
    tags: owned?.tags ?? [],
    grading_company: owned?.gradingCompany ?? null,
    grading_grade: owned?.gradingGrade ?? null,
    owned: Boolean(owned),
    owned_count: owned?.count ?? 0,
  };
}

async function getOwnedCategoryRecords(
  cardIds: string[],
  userId: string
): Promise<OwnedCategoryRecord[]> {
  const pages = await Promise.all(
    chunkValues(cardIds).map((chunk) =>
      db.collectionCard.findMany({
        where: {
          user_id: userId,
          card_id: { in: chunk },
        },
        select: {
          id: true,
          binder_id: true,
          purchase_price: true,
          condition: true,
          language: true,
          notes: true,
          grading_company: true,
          grading_grade: true,
          card_id: true,
          tags: {
            select: {
              label: true,
            },
          },
        },
      })
    )
  );

  return pages.flat();
}

async function getWantCategoryRecords(
  cardIds: string[],
  userId: string
): Promise<WantCategoryRecord[]> {
  const pages = await Promise.all(
    chunkValues(cardIds).map((chunk) =>
      db.collectionWant.findMany({
        where: {
          user_id: userId,
          card_id: { in: chunk },
        },
        select: {
          id: true,
          card_id: true,
        },
      })
    )
  );

  return pages.flat();
}

async function getCategoryCards(where: Prisma.CardWhereInput): Promise<CategoryCardRecord[]> {
  const cards: CategoryCardRecord[] = [];
  let skip = 0;

  while (true) {
    const page = await db.card.findMany({
      where,
      select: CATEGORY_CARD_SELECT,
      orderBy: [
        { episode: { release_date: "desc" } },
        { card_number: "asc" },
        { name: "asc" },
        { id: "asc" },
      ],
      skip,
      take: SQLITE_SAFE_CHUNK_SIZE,
    });

    cards.push(...page);

    if (page.length < SQLITE_SAFE_CHUNK_SIZE) {
      break;
    }

    skip += SQLITE_SAFE_CHUNK_SIZE;
  }

  return cards;
}

async function getCategoryPriceSnapshots(
  cardIds: string[]
): Promise<EpisodePriceHistorySnapshot[]> {
  if (cardIds.length === 0) return [];

  const rows = await Promise.all(
    chunkValues(cardIds).map((chunk) =>
      db.$queryRawUnsafe<EpisodePriceHistorySnapshot[]>(
        `SELECT
          card_id,
          fetched_at,
          cm_en_lowest_nm,
          cm_de_lowest_nm,
          cm_fr_lowest_nm,
          cm_es_lowest_nm,
          cm_it_lowest_nm
        FROM (
          SELECT
            p.card_id,
            p.fetched_at,
            p.cm_en_lowest_nm,
            p.cm_de_lowest_nm,
            p.cm_fr_lowest_nm,
            p.cm_es_lowest_nm,
            p.cm_it_lowest_nm,
            ROW_NUMBER() OVER (
              PARTITION BY p.card_id, DATE(p.fetched_at)
              ORDER BY p.fetched_at DESC, p.id DESC
            ) AS row_num
          FROM "Price" p
          WHERE p.card_id IN (${placeholdersFor(chunk)})
        )
        WHERE row_num = 1
        ORDER BY fetched_at ASC, card_id ASC`,
        ...chunk
      )
    )
  );

  return rows
    .flat()
    .map((row) => ({
      ...row,
      fetched_at:
        row.fetched_at instanceof Date ? row.fetched_at.toISOString() : row.fetched_at,
    }))
    .sort((a, b) => {
      const dateDiff = new Date(a.fetched_at).getTime() - new Date(b.fetched_at).getTime();
      if (dateDiff !== 0) return dateDiff;
      return a.card_id.localeCompare(b.card_id);
    });
}

export async function getCardCategoryPageData(
  slug: string,
  userId: string
): Promise<CardCategoryPageData | null> {
  const category = getCardCategory(slug);
  if (!category) return null;

  const cards = await getCategoryCards(withVisibleCards(category.where));

  const cardIds = cards.map((card) => card.id);
  const [ownedRecords, wantRecords, priceSnapshots] =
    cardIds.length > 0
      ? await Promise.all([
          getOwnedCategoryRecords(cardIds, userId),
          getWantCategoryRecords(cardIds, userId),
          getCategoryPriceSnapshots(cardIds),
        ])
      : [[], [], []];

  const cardsById = new Map(cards.map((card) => [card.id, card]));
  const ownedByCardId = buildOwnedMap(ownedRecords, cardsById);
  const wantByCardId = new Map(wantRecords.map((want) => [want.card_id, want.id]));
  const items = cards.map((card) =>
    buildCategoryItem(card, ownedByCardId.get(card.id), wantByCardId.get(card.id) ?? null)
  );
  const pricedItems = items.filter((item) => item.current_value != null);
  const estimatedValue = pricedItems.length
    ? Number(pricedItems.reduce((total, item) => total + (item.current_value ?? 0), 0).toFixed(2))
    : null;

  return {
    category,
    items,
    priceSnapshots,
    totalCards: items.length,
    ownedCards: items.filter((item) => item.owned).length,
    wantedCards: items.filter((item) => item.want_item_id && !item.owned).length,
    pricedCards: pricedItems.length,
    setCount: new Set(items.map((item) => item.episode_id)).size,
    estimatedValue,
  };
}
