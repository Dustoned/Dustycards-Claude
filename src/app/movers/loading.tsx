import { Skeleton, SkeletonCardGrid } from "@/components/Skeleton";

export default function Loading() {
  return (
    <div className="space-y-6 p-6">
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-4 w-72" />
      <div className="flex gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-20" rounded="full" />
        ))}
      </div>
      <SkeletonCardGrid count={12} />
    </div>
  );
}
