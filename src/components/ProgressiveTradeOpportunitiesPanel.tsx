"use client";

import { useEffect, useState } from "react";
import TradeOpportunitiesPanel from "@/components/TradeOpportunitiesPanel";
import type { TradingCardGameFilter } from "@/lib/games";
import type { SocialTradeOpportunity } from "@/lib/social";

export default function ProgressiveTradeOpportunitiesPanel({
  endpoint,
  game,
}: {
  endpoint: string;
  game: TradingCardGameFilter;
}) {
  const [requested, setRequested] = useState(false);
  const [hasOpened, setHasOpened] = useState(false);
  const [opportunities, setOpportunities] = useState<SocialTradeOpportunity[] | null>(null);

  useEffect(() => {
    if (!requested) return;

    const controller = new AbortController();

    void fetch(endpoint, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return [];
        const payload = (await response.json()) as {
          opportunities?: SocialTradeOpportunity[];
        };
        return Array.isArray(payload.opportunities) ? payload.opportunities : [];
      })
      .then((nextOpportunities) => {
        if (!controller.signal.aborted) setOpportunities(nextOpportunities);
      })
      .catch(() => {
        // The manual trade comparison remains fully usable if suggestions fail.
      });

    return () => controller.abort();
  }, [endpoint, requested]);

  return (
    <details
      className="binder-panel rounded-2xl p-3 sm:p-4"
      onToggle={(event) => {
        if (event.currentTarget.open) setHasOpened(true);
      }}
    >
      <summary className="min-h-11 cursor-pointer content-center text-sm font-semibold text-[var(--dc-text-primary)] marker:text-[var(--dc-primary-soft)]">
        Compare cards &amp; find trades
      </summary>
      {hasOpened ? <div className="pt-3"><TradeOpportunitiesPanel
      opportunities={opportunities ?? []}
      game={game}
      friendsPending={requested && opportunities == null}
      onFriendsOpen={() => setRequested(true)}
      /></div> : null}
    </details>
  );
}
