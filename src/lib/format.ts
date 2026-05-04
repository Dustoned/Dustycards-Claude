export type CurrencyCode = "EUR" | "USD";

const FORMATTERS: Record<CurrencyCode, Intl.NumberFormat> = {
  EUR: new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }),
  USD: new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }),
};

export function formatCurrency(
  value: number | null | undefined,
  currency: CurrencyCode = "EUR"
): string {
  if (value == null) return "--";
  return FORMATTERS[currency].format(value);
}
