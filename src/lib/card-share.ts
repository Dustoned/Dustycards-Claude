import { formatCurrency, type CurrencyCode } from "@/lib/format";

export function buildCardShareCopy({
  name,
  price,
  currency,
  url,
}: {
  name: string;
  price: number | null | undefined;
  currency: CurrencyCode;
  url: string;
}) {
  const priceCopy = price == null ? "on DustyCards" : `for ${formatCurrency(price, currency)} on DustyCards`;
  const text = `Check out this ${name} ${priceCopy}.`;

  return {
    title: `${name} on DustyCards`,
    text,
    clipboardText: `${text}\n${url}`,
  };
}
