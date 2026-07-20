import { Skeleton } from "@/components/Skeleton";

function KpiSkeleton() {
  return (
    <div className="card-detail-kpi min-h-24">
      <Skeleton className="h-2.5 w-20" rounded="full" />
      <Skeleton className="mt-3 h-6 w-24" rounded="lg" />
      <Skeleton className="mt-2 h-3 w-28" rounded="full" />
    </div>
  );
}

export default function SignalRadarDetailLoading() {
  return (
    <div
      className="card-detail-experience"
      data-card-detail-shell
      data-card-detail-mode="radar"
      data-detail-loading
      role="status"
      aria-label="Loading card analysis"
    >
      <div className="card-detail-ambient" aria-hidden="true" />
      <div className="card-detail-query-container">
        <div className="card-detail-scroll-viewport">
          <div className="card-detail-layout" data-card-detail-canvas>
            <header className="card-detail-toolbar">
              <Skeleton className="h-11 w-44" rounded="full" />
              <div className="card-detail-actions hidden gap-2 sm:flex">
                <Skeleton className="h-11 w-28" rounded="lg" />
                <Skeleton className="h-11 w-24" rounded="lg" />
              </div>
            </header>

            <div className="card-detail-media" data-card-detail-region="media">
              <div className="card-detail-media-frame flex items-center justify-center p-4">
                <Skeleton className="aspect-[63/88] w-full max-w-[24rem]" rounded="lg" />
              </div>
              <div className="card-detail-media-actions grid grid-cols-2 gap-2">
                <Skeleton className="h-11 w-full" rounded="lg" />
                <Skeleton className="h-11 w-full" rounded="lg" />
              </div>
            </div>

            <section className="card-detail-identity" data-card-detail-region="identity">
              <div className="flex items-center justify-between gap-4">
                <Skeleton className="h-3 w-28" rounded="full" />
                <Skeleton className="h-7 w-24" rounded="full" />
              </div>
              <Skeleton className="mt-5 h-11 w-4/5" rounded="lg" />
              <Skeleton className="mt-3 h-4 w-2/5" rounded="full" />
              <div className="mt-7 flex items-end justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <Skeleton className="h-3 w-24" rounded="full" />
                  <Skeleton className="mt-3 h-10 w-44" rounded="lg" />
                  <Skeleton className="mt-2 h-3 w-32" rounded="full" />
                </div>
                <Skeleton className="h-11 w-36" rounded="lg" />
              </div>
              <div className="card-detail-kpis mt-5">
                {Array.from({ length: 4 }, (_, index) => (
                  <KpiSkeleton key={index} />
                ))}
              </div>
            </section>

            <section className="card-detail-chart" data-card-detail-region="chart">
              <div className="card-detail-surface h-full min-h-72">
                <div className="flex items-center justify-between gap-4">
                  <Skeleton className="h-4 w-28" rounded="full" />
                  <Skeleton className="h-10 w-24" rounded="lg" />
                </div>
                <Skeleton className="mt-8 h-48 w-full" rounded="lg" />
              </div>
            </section>

            <nav className="card-detail-tabs-shell" aria-hidden="true">
              <div className="card-detail-tabs">
                {Array.from({ length: 6 }, (_, index) => (
                  <Skeleton key={index} className="h-11 min-w-32 flex-1" rounded="lg" />
                ))}
              </div>
            </nav>

            <section className="card-detail-panel" data-card-detail-region="panel">
              <div className="card-detail-section-grid" data-columns="2">
                <Skeleton className="h-64 w-full" rounded="lg" />
                <Skeleton className="h-64 w-full" rounded="lg" />
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
