import Link from "next/link";

export default function HomePage() {
  return (
    <div className="page-container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-32 flex flex-col items-center text-center">
      <h1 className="text-6xl font-bold text-gray-900 dark:text-white tracking-tight mb-4">
        DustyCards
      </h1>
      <p className="text-gray-500 dark:text-gray-400 text-xl mb-10 max-w-md leading-relaxed">
        Pokemon TCG card database with live CardMarket prices.
      </p>
      <Link
        href="/expansions"
        className="glass px-8 py-3 rounded-2xl text-gray-900 dark:text-white font-semibold shadow-lg shadow-black/10 hover:shadow-xl hover:shadow-black/15 hover:scale-[1.02] transition-all active:scale-[0.98]"
      >
        Browse Expansions
      </Link>
    </div>
  );
}
