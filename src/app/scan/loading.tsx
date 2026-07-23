export default function CardScannerLoading() {
  return (
    <div className="page-container binder-bottom-safe mx-auto max-w-6xl px-3 py-3 sm:px-6 sm:py-6 lg:px-8">
      <div className="binder-panel animate-pulse rounded-[var(--ui-page-header-radius)] p-4 sm:p-6">
        <div className="h-3 w-28 rounded-full bg-[rgb(var(--dc-primary-rgb)/0.16)]" />
        <div className="mt-4 h-9 w-56 rounded-xl bg-[rgb(var(--dc-surface-hover-rgb)/0.76)]" />
        <div className="mt-3 h-4 w-full max-w-xl rounded-full bg-[rgb(var(--dc-surface-hover-rgb)/0.55)]" />
        <div className="mt-6 aspect-[4/3] max-h-[38rem] rounded-[24px] bg-[rgb(var(--dc-surface-primary-rgb)/0.74)]" />
      </div>
    </div>
  );
}
