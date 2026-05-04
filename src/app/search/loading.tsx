import { Skeleton, SkeletonCardGrid } from "@/components/Skeleton";

export default function Loading() {
  return (
    <div className="space-y-6 p-6">
      <Skeleton className="h-12 w-full max-w-2xl" rounded="full" />
      <Skeleton className="h-4 w-44" />
      <SkeletonCardGrid count={12} />
    </div>
  );
}
