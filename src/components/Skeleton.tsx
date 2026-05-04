import type { CSSProperties } from "react";

interface SkeletonProps {
  className?: string;
  style?: CSSProperties;
  rounded?: "sm" | "md" | "lg" | "xl" | "full";
}

const ROUNDED: Record<NonNullable<SkeletonProps["rounded"]>, string> = {
  sm: "rounded",
  md: "rounded-md",
  lg: "rounded-lg",
  xl: "rounded-xl",
  full: "rounded-full",
};

export function Skeleton({ className = "", style, rounded = "md" }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      style={style}
      className={`animate-pulse bg-black/[0.05] dark:bg-white/[0.06] ${ROUNDED[rounded]} ${className}`}
    />
  );
}

export function SkeletonText({
  lines = 3,
  className = "",
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={`h-3 ${i === lines - 1 ? "w-2/3" : "w-full"}`}
        />
      ))}
    </div>
  );
}

export function SkeletonCardGrid({ count = 12 }: { count?: number }) {
  return (
    <div
      className="grid gap-4"
      style={{ gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))" }}
    >
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="aspect-[63/88] w-full" rounded="lg" />
          <Skeleton className="h-3 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}
