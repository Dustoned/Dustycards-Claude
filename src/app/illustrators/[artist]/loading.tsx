import { Skeleton, SkeletonCardGrid } from "@/components/Skeleton";

export default function Loading() {
  return (
    <div className="space-y-6 p-6">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-4 w-72" />
      <SkeletonCardGrid count={18} />
    </div>
  );
}
