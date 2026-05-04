import { Skeleton } from "@/components/Skeleton";

export default function Loading() {
  return (
    <div className="space-y-6 p-6">
      <Skeleton className="h-8 w-44" />
      <div
        className="grid gap-4"
        style={{ gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))" }}
      >
        {Array.from({ length: 24 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="aspect-square w-full" rounded="lg" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        ))}
      </div>
    </div>
  );
}
