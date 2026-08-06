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
  const [opportunities, setOpportunities] = useState<SocialTradeOpportunity[]>([]);

  useEffect(() => {
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
  }, [endpoint]);

  return <TradeOpportunitiesPanel opportunities={opportunities} game={game} />;
}
