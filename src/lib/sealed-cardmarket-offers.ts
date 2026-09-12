import { extractArticleRows, extractArticlePrice } from "@/lib/sync/sealed-cardmarket-base-price-job";

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
  "austria", "belgium", "bulgaria", "croatia", "cyprus", "czech republic", "czechia",
  "denmark", "estonia", "finland", "france", "germany", "greece", "hungary", "ireland",
  "italy", "latvia", "lithuania", "luxembourg", "malta", "netherlands", "poland",
  "portugal", "romania", "slovakia", "slovenia", "spain", "sweden",
]);
function text(value: string) {
  return value.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').trim();
}
export function parseSealedMarketOffers(html: string): SealedMarketOffer[] {
  const offers: SealedMarketOffer[] = [];
  for (const row of extractArticleRows(html)) {
    // Verify the actual offer language; a requested URL filter alone is not evidence.
    const attributes = row.match(/class=["'][^"']*product-attributes[^"']*["'][^>]*>([\s\S]*?)(?=<div\b|$)/i)?.[1] ?? "";
    if (!/(?:aria-label|data-(?:bs-)?original-title)=["']English["']/i.test(attributes)) continue;
    const priceEur = extractArticlePrice(row);
    const sellerMatch = row.match(/<a\b[^>]*href=["']([^"']*\/Users\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
    if (priceEur == null || !sellerMatch) continue;
    let sellerUrl: URL;
    try { sellerUrl = new URL(sellerMatch[1], "https://www.cardmarket.com"); } catch { continue; }
    if (sellerUrl.protocol !== "https:" || sellerUrl.hostname !== "www.cardmarket.com" || !/^\/en\/(Pokemon|OnePiece)\/Users\/[^/]+$/.test(sellerUrl.pathname)) continue;
    const seller = text(sellerMatch[2]);
    if (!seller) continue;
    const country = text(row.match(/(?:aria-label|data-(?:bs-)?original-title)=["']Item location:\s*([^"']+)["']/i)?.[1] ?? "") || null;
    offers.push({ articleId: row.match(/id=["'](articleRow[^"']+)["']/i)?.[1] ?? "", priceEur,
      seller, sellerUrl: sellerUrl.toString(), country, isEu: country != null && EU_COUNTRIES.has(country.toLowerCase()),
      professional: /fonticon-users-professional/.test(row),
    });
  }
  return offers.sort((a, b) => a.priceEur - b.priceEur || a.articleId.localeCompare(b.articleId));
}
