import { Skeleton, SkeletonCardGrid } from "@/components/Skeleton";

export default function Loading() {
  return (
    <div className="space-y-8 p-6">
      <header className="space-y-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-64" />
        <div className="flex gap-2">
          <Skeleton className="h-6 w-24" rounded="full" />
          <Skeleton className="h-6 w-24" rounded="full" />
          <Skeleton className="h-6 w-24" rounded="full" />
        </div>
      </header>
      <SkeletonCardGrid count={18} />
    </div>
  );
}
