import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center">
      <h2 className="text-xl font-semibold">Page not found</h2>
      <p className="max-w-md text-sm text-black/60 dark:text-white/60">
        The page you&apos;re looking for doesn&apos;t exist.
      </p>
      <Link
        href="/"
        className="rounded-md border border-black/10 bg-white px-4 py-2 text-sm font-medium hover:bg-black/[0.04] dark:border-white/10 dark:bg-white/[0.04] dark:hover:bg-white/[0.08]"
      >
        Back to home
      </Link>
    </div>
  );
}
