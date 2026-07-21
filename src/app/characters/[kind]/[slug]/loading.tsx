export default function CharacterCardsLoading() {
  return (
    <main className="page-container mx-auto w-full max-w-7xl animate-pulse px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <div className="binder-panel grid min-h-52 gap-3 rounded-[var(--ui-page-header-radius)] p-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(22rem,0.9fr)]">
        <div className="rounded-[var(--ui-page-header-radius)] border border-white/8 bg-white/[0.035]" />
        <div className="grid grid-cols-2 gap-2">
          {Array.from({ length: 4 }, (_, index) => (
            <div
              key={index}
              className="min-h-24 rounded-[var(--ui-page-header-radius)] border border-white/8 bg-white/[0.035]"
            />
          ))}
        </div>
      </div>
    </main>
  );
}
