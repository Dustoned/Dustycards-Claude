import { Skeleton } from "@/components/Skeleton";

export default function Loading() {
  return (
    <div className="space-y-6 p-6">
      <Skeleton className="h-8 w-40" />
      <div
        className="grid gap-4"
        style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}
      >
        {Array.from({ length: 24 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="aspect-[16/9] w-full" rounded="lg" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        ))}
      </div>
    </div>
  );
}
