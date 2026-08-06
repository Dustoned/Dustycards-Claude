"use client";

import dynamic from "next/dynamic";

const DealsBrowser = dynamic(() => import("@/app/deals/DealsBrowser"), {
  ssr: false,
  loading: () => <DealsShell />,
});

function DealsShell() {
  return (
    <div className="page-container binder-bottom-safe mx-auto max-w-7xl px-3 py-3 sm:px-6 sm:py-5 lg:px-8">
      <div className="flex w-full flex-col gap-3 sm:gap-5">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="min-w-0 text-[length:var(--ui-page-header-title-size)] font-bold leading-tight tracking-tight text-white">
            eBay Deals
          </h1>
          <p className="text-[length:var(--ui-page-header-description-size)] font-medium text-white/52">
            Search eBay for raw, graded, or sealed offers and compare them with DustyCards prices.
          </p>
        </div>

        <div className="binder-panel min-h-[66px] animate-pulse rounded-2xl border border-white/8 bg-white/[0.025]" />
      </div>
    </div>
  );
}

export default function DealsBrowserLoader() {
  return <DealsBrowser />;
}
