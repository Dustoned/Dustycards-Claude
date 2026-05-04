/**
 * Shared sort helpers for card_number columns. Cards without a card_number
 * sort last; numeric portions sort numerically (so #9 comes before #10).
 */
export const CARD_NUMBER_FALLBACK = "999999";

export const cardNumberCollator = new Intl.Collator("en", {
  numeric: true,
  sensitivity: "base",
});
