import { Skeleton } from "@/components/Skeleton";

export default function Loading() {
  return (
    <div className="space-y-8 p-6">
      <div className="rounded-2xl border border-black/8 p-6 dark:border-white/8">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)]">
          <div className="space-y-3">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-10 w-72" />
            <Skeleton className="h-4 w-full" />
            <div className="flex gap-2 pt-3">
              <Skeleton className="h-9 w-32" rounded="full" />
              <Skeleton className="h-9 w-32" rounded="full" />
            </div>
          </div>
          <div className="space-y-3">
            <Skeleton className="h-12 w-44" />
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-44 w-full" rounded="lg" />
          </div>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" rounded="lg" />
        ))}
      </div>
    </div>
  );
}
