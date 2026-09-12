import {
  extractArticleRows,
  extractArticlePrice,
} from "@/lib/sync/sealed-cardmarket-base-price-job";

export type SealedMarketOffer = {
  articleId: string;
  priceEur: number;
  seller: string;
  sellerUrl: string;
  country: string | null;
  isEu: boolean;
  professional: boolean;
};
export type SealedMarketComparison = {
  label: "Market" | "EU Market";
  savedPriceEur: number | null;
  offer: SealedMarketOffer | null;
};
const EU_COUNTRIES = new Set([
  "austria",
  "belgium",
  "bulgaria",
  "croatia",
  "cyprus",
  "czech republic",
  "czechia",
  "denmark",
  "estonia",
  "finland",
  "france",
  "germany",
  "greece",
  "hungary",
  "ireland",
  "italy",
  "latvia",
  "lithuania",
  "luxembourg",
  "malta",
  "netherlands",
  "poland",
  "portugal",
  "romania",
  "slovakia",
  "slovenia",
  "spain",
  "sweden",
]);
const CARDMARKET_SELLER_COUNTRIES = new Set([
  ...EU_COUNTRIES,
  "iceland",
  "liechtenstein",
  "norway",
  "switzerland",
  "united kingdom",
]);
function text(value: string) {
  return value
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .trim();
}

function extractSellerCountry(row: string): string | null {
  const explicitCountry = text(
    row.match(
      /(?:aria-label|title|data-(?:bs-)?original-title)=["']Item location:\s*([^"']+)["']/i,
    )?.[1] ?? "",
  );
  if (explicitCountry) return explicitCountry;

  const sellerSectionEnd = row.search(
    /class=["'][^"']*product-attributes[^"']*["']/i,
  );
  const sellerSection =
    sellerSectionEnd >= 0 ? row.slice(0, sellerSectionEnd) : row;

  for (const tagMatch of sellerSection.matchAll(/<span\b[^>]*>/gi)) {
    const tag = tagMatch[0];
    const classes = tag.match(/\bclass=["']([^"']+)["']/i)?.[1] ?? "";
    if (!/(?:^|\s)icon(?:\s|$)/i.test(classes)) continue;

    const rawCountry = tag.match(
      /(?:aria-label|title|data-(?:bs-)?original-title)=["']([^"']+)["']/i,
    )?.[1];
    if (!rawCountry) continue;

    const country = text(rawCountry)
      .replace(/^Item location:\s*/i, "")
      .trim();
    if (CARDMARKET_SELLER_COUNTRIES.has(country.toLowerCase())) return country;
  }

  return null;
}

export function parseSealedMarketOffers(html: string): SealedMarketOffer[] {
  const offers: SealedMarketOffer[] = [];
  for (const row of extractArticleRows(html)) {
    // Read the actual offer language; a requested URL filter alone is not enough.
    const attributes =
      row.match(
        /class=["'][^"']*product-attributes[^"']*["'][^>]*>([\s\S]*?)(?=<div\b|$)/i,
      )?.[1] ?? "";
    if (
      !/(?:aria-label|data-(?:bs-)?original-title)=["']English["']/i.test(
        attributes,
      )
    )
      continue;
    const priceEur = extractArticlePrice(row);
    const sellerMatch = row.match(
      /<a\b[^>]*href=["']([^"']*\/Users\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/i,
    );
    if (priceEur == null || !sellerMatch) continue;
    let sellerUrl: URL;
    try {
      sellerUrl = new URL(sellerMatch[1], "https://www.cardmarket.com");
    } catch {
      continue;
    }
    if (
      sellerUrl.protocol !== "https:" ||
      sellerUrl.hostname !== "www.cardmarket.com" ||
      !/^\/en\/(Pokemon|OnePiece)\/Users\/[^/]+$/.test(sellerUrl.pathname)
    )
      continue;
    const seller = text(sellerMatch[2]);
    if (!seller) continue;
    const country = extractSellerCountry(row);
    if (!country) continue;
    offers.push({
      articleId: row.match(/id=["'](articleRow[^"']+)["']/i)?.[1] ?? "",
      priceEur,
      seller,
      sellerUrl: sellerUrl.toString(),
      country,
      isEu: EU_COUNTRIES.has(country.toLowerCase()),
      professional: /fonticon-users-professional/.test(row),
    });
  }
  return offers.sort(
    (a, b) => a.priceEur - b.priceEur || a.articleId.localeCompare(b.articleId),
  );
}
