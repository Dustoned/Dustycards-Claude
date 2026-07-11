import Link from "next/link";
import { Search, type LucideIcon } from "lucide-react";

export default function EmptyState({
  actionHref = "/search",
  actionLabel = "Find cards",
  description,
  icon: Icon = Search,
  title,
}: {
  actionHref?: string | null;
  actionLabel?: string;
  description: string;
  icon?: LucideIcon;
  title: string;
}) {
  return (
    <div className="binder-panel rounded-2xl px-5 py-7 text-center sm:rounded-3xl sm:px-8 sm:py-9">
      <span className="mx-auto inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-violet-300/18 bg-violet-500/[0.1] text-violet-100">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <p className="mt-3 font-semibold text-white/88">{title}</p>
      <p className="mx-auto mt-1 max-w-xl text-sm leading-6 text-white/52">{description}</p>
      {actionHref ? (
        <Link
          href={actionHref}
          prefetch={false}
          className="mt-4 inline-flex min-h-11 items-center justify-center rounded-xl border border-violet-300/22 bg-violet-500/[0.14] px-4 py-2.5 text-sm font-semibold text-violet-50 transition hover:border-violet-300/35 hover:bg-violet-500/[0.2]"
        >
          {actionLabel}
        </Link>
      ) : null}
    </div>
  );
}
