function Pulse({ className }: { className: string }) {
  return (
    <span
      aria-hidden="true"
      className={`block rounded-full bg-[rgb(var(--dc-text-muted-rgb)/0.16)] motion-safe:animate-pulse ${className}`}
    />
  );
}

export default function HomePageLoading() {
  return (
    <div
      className="page-container binder-bottom-safe mx-auto max-w-7xl px-3 py-3 sm:px-6 sm:py-5 lg:px-8"
      role="status"
      aria-label="Loading your collection overview"
      aria-live="polite"
    >
      <div className="space-y-2.5 sm:space-y-3">
        <div className="flex min-w-0 items-end justify-between gap-3 py-0.5">
          <div className="min-w-0 flex-1">
            <Pulse className="h-7 w-44 sm:h-8 sm:w-56" />
            <Pulse className="mt-2 h-3 w-36 sm:w-48" />
          </div>
          <Pulse className="h-10 w-36 shrink-0 max-sm:hidden" />
        </div>

        <section className="grid min-w-0 gap-2.5 sm:gap-3 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <div className="binder-panel min-h-[13rem] rounded-[var(--ui-page-header-radius)] p-3 sm:min-h-[16rem] sm:p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <Pulse className="h-2.5 w-24" />
                <Pulse className="mt-2 h-7 w-36" />
              </div>
              <Pulse className="h-8 w-20" />
            </div>
            <span
              aria-hidden="true"
              className="mt-5 block h-28 rounded-2xl bg-[linear-gradient(165deg,transparent_35%,rgb(var(--dc-primary-rgb)/0.13)_36%,rgb(var(--dc-primary-rgb)/0.06)_70%)] motion-safe:animate-pulse sm:h-36"
            />
          </div>

          <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
            {Array.from({ length: 6 }, (_, index) => (
              <div
                key={index}
                aria-hidden="true"
                className="min-h-[4.8rem] rounded-[var(--ui-header-stat-radius)] border border-[rgb(var(--dc-border-rgb)/0.82)] bg-[rgb(var(--dc-surface-primary-rgb)/0.55)] p-2.5"
              >
                <Pulse className="h-2 w-16" />
                <Pulse className="mt-2 h-5 w-20" />
                <Pulse className="mt-2 h-2 w-24 max-w-full" />
              </div>
            ))}
          </div>
        </section>

        <div className="home-insight-panels" aria-hidden="true">
          <span className="binder-panel block h-28 rounded-[var(--ui-page-header-radius)] motion-safe:animate-pulse" />
          <span className="binder-panel block h-28 rounded-[var(--ui-page-header-radius)] motion-safe:animate-pulse" />
        </div>
      </div>
      <span className="sr-only">Your collection totals and market insights are loading.</span>
    </div>
  );
}
