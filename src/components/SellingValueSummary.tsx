"use client";

import { useEffect, useMemo, useState } from "react";
import VendorBuyEstimate from "@/components/VendorBuyEstimate";
import MobileSummaryDisclosure from "@/components/MobileSummaryDisclosure";
import { useSettings } from "@/components/SettingsProvider";
import { formatCollectionCurrency } from "@/lib/collection";
import { formatCurrency } from "@/lib/format";
import type { CollectionCardViewItem } from "@/types/collection-view";

export const SELLING_PRICE_SOURCE_EVENT = "dustycards:selling-price-source";

export default function SellingValueSummary({ items, investment, pricedCards, soldNet, soldCount, soldTotal, soldFees, soldPnl }: {
  items: CollectionCardViewItem[]; investment: number; pricedCards: number; soldNet: number;
  soldCount: number; soldTotal: number; soldFees: number; soldPnl: number;
}) {
  const { settings } = useSettings();
  const [source, setSource] = useState(settings.primaryPriceSource);
  useEffect(() => {
    const onChange = (event: Event) => {
      const next = (event as CustomEvent<"cm_en" | "tcp">).detail;
      if (next === "cm_en" || next === "tcp") setSource(next);
    };
    window.addEventListener(SELLING_PRICE_SOURCE_EVENT, onChange);
    return () => window.removeEventListener(SELLING_PRICE_SOURCE_EVENT, onChange);
  }, []);
  const estimatedValue = useMemo(() => Number(items.reduce((total, item) => {
    const value = source === "tcp" ? item.tcp_value_eur : item.cm_value ?? item.current_value;
    return total + (value ?? 0);
  }, 0).toFixed(2)), [items, source]);
  const sourceValue = useMemo(() => source === "tcp"
    ? Number(items.reduce((total, item) => total + (item.tcp_value ?? 0), 0).toFixed(2))
    : estimatedValue,
  [estimatedValue, items, source]);
  return (
    <MobileSummaryDisclosure title="Sales overview" summary={`${items.length} cards · ${formatCollectionCurrency(estimatedValue)} estimated · ${formatCollectionCurrency(soldNet)} net sold`}>
    <section className="binder-subpanel grid grid-cols-2 gap-3 rounded-[var(--ui-page-header-radius)] p-3 xl:grid-cols-4">
      <div className="min-w-0">
        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/35">Estimated Sale Value · {source === "tcp" ? "TCGPlayer" : "CardMarket"}</p>
        <p className="mt-1 text-xl font-black tabular-nums text-white">
          {source === "tcp"
            ? `${formatCurrency(sourceValue, "USD")} = ${formatCollectionCurrency(estimatedValue)}`
            : formatCollectionCurrency(estimatedValue)}
        </p>
        <VendorBuyEstimate
          estimatedValue={estimatedValue}
          sourceValue={source === "tcp" ? sourceValue : null}
          sourceCurrency={source === "tcp" ? "USD" : null}
        />
      </div>
      <div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/35">Active Cards</p><p className="mt-1 text-xl font-black tabular-nums text-white">{items.length.toLocaleString("en-US")}</p></div>
      <div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/35">Priced / Paid</p><p className="mt-1 text-xl font-black tabular-nums text-white">{pricedCards.toLocaleString("en-US")} / {formatCollectionCurrency(investment)}</p></div>
      <div className="min-w-0">
        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/35">Net Sold</p>
        <p className="mt-1 text-xl font-black tabular-nums text-white">{formatCollectionCurrency(soldNet)}</p>
        <p className="mt-0.5 truncate text-[11px] font-semibold tabular-nums text-white/42">{soldCount.toLocaleString("en-US")} sold · gross {formatCollectionCurrency(soldTotal)} · fees {formatCollectionCurrency(soldFees)} · P&amp;L <span className={soldPnl >= 0 ? "text-emerald-300" : "text-rose-300"}>{soldPnl > 0 ? "+" : soldPnl < 0 ? "-" : ""}{formatCollectionCurrency(Math.abs(soldPnl))}</span></p>
      </div>
    </section>
    </MobileSummaryDisclosure>
  );
}
