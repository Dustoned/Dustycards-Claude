import { Loader2 } from "lucide-react";

export function CardLoadingOverlay() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/35 backdrop-blur-[1px] rounded-[inherit]"
    >
      <Loader2 className="h-8 w-8 animate-spin text-white drop-shadow" />
    </div>
  );
}
