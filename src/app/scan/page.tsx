import type { Metadata } from "next";
import Link from "next/link";
import { ScanLine, Search } from "lucide-react";
import CardScannerClient from "@/app/scan/CardScannerClient";
import { CARD_SCANNER_ENABLED } from "@/lib/feature-flags";

export const metadata: Metadata = {
  title: "Card Scanner | DustyCards",
  description: "Scan a trading card and match it to the DustyCards catalog.",
};

export default function CardScannerPage() {
  if (!CARD_SCANNER_ENABLED) {
    return (
      <div className="page-container mx-auto max-w-6xl px-3 py-3 text-[var(--dc-text-primary)] sm:px-6 sm:py-6 lg:px-8">
        <div className="binder-panel grid min-h-[28rem] place-items-center rounded-[var(--ui-page-header-radius)] p-6 text-center">
          <div className="max-w-md">
            <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-[22px] border border-[rgb(var(--dc-border-rgb)/0.95)] bg-[rgb(var(--dc-surface-hover-rgb)/0.56)] text-[var(--dc-text-muted)]">
              <ScanLine className="h-7 w-7" />
            </span>
            <h1 className="mt-5 text-2xl font-black">
              The Card Scanner is taking a break
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-[var(--dc-text-muted)]">
              Recognition is not reliable enough yet, so scanning is switched off
              while it gets reworked. Use search to add cards in the meantime.
            </p>
            <Link
              href="/search"
              className="mt-6 inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[var(--dc-primary-gradient)] px-5 text-sm font-black text-white"
            >
              <Search className="h-4 w-4" />
              Search cards
            </Link>
          </div>
        </div>
      </div>
    );
  }
  return <CardScannerClient />;
}
