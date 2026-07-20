"use client";

import { useEffect, useState } from "react";
import { Heart } from "lucide-react";
import {
  dispatchWantsChanged,
  resolveWantState,
  subscribeWantsChanged,
} from "@/lib/wants-client-events";

interface CollectionCardRef {
  id: string;
  name: string;
  image_url: string | null;
  episode: {
    id: string;
    name: string;
    code: string | null;
  };
}

interface Props {
  card: CollectionCardRef;
  mode?: "icon" | "button";
  theme?: "light" | "dark";
  label?: string;
  className?: string;
  initialWanted?: boolean;
  wantItemId?: string | null;
  stopPropagation?: boolean;
  disabled?: boolean;
  disabledTitle?: string;
  onChanged?: (wantItem: { id: string; created_at: string } | null) => void;
}

function buttonClasses(mode: "icon" | "button", theme: "light" | "dark", className?: string) {
  const base =
    mode === "icon"
      ? "inline-flex h-8 w-8 items-center justify-center rounded-lg border transition-all"
      : "inline-flex items-center justify-center gap-2 rounded-2xl border px-4 py-2 text-sm font-semibold transition-all";

  const palette =
    theme === "dark"
      ? "border-violet-300/28 bg-violet-600/22 text-violet-50 hover:border-violet-200/45 hover:bg-violet-500/32"
      : "border-violet-300/24 bg-violet-600/18 text-violet-50 hover:border-violet-200/40 hover:bg-violet-500/28";

  return [base, palette, className].filter(Boolean).join(" ");
}

export default function CollectionWantButton({
  card,
  mode = "icon",
  theme = "light",
  label = "Want",
  className,
  initialWanted = false,
  wantItemId = null,
  stopPropagation = true,
  disabled = false,
  disabledTitle,
  onChanged,
}: Props) {
  const [wantState, setWantState] = useState(() =>
    resolveWantState(card.id, { wanted: initialWanted, itemId: wantItemId })
  );
  const [saving, setSaving] = useState(false);
  const { wanted, itemId } = wantState;

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setWantState(resolveWantState(card.id, { wanted: initialWanted, itemId: wantItemId }));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [card.id, initialWanted, wantItemId]);

  useEffect(() => {
    return subscribeWantsChanged(card.id, (detail) => {
      setWantState({ wanted: detail.wanted, itemId: detail.item?.id ?? null });
    });
  }, [card.id]);

  async function toggleWant(event: React.MouseEvent<HTMLButtonElement>) {
    if (stopPropagation) {
      event.stopPropagation();
    }
    if (saving) return;

    setSaving(true);
    try {
      const response = await fetch("/api/wants/cards", {
        method: wanted ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(wanted && itemId ? { itemId } : { cardId: card.id }),
      });
      const data = (await response.json()) as {
        error?: string;
        item?: { id: string; created_at: string };
      };

      if (!response.ok) {
        throw new Error(data.error ?? "Could not update wants");
      }

      if (wanted) {
        setWantState({ wanted: false, itemId: null });
        onChanged?.(null);
        dispatchWantsChanged({ cardId: card.id, wanted: false, item: null });
      } else if (data.item) {
        setWantState({ wanted: true, itemId: data.item.id });
        onChanged?.(data.item);
        dispatchWantsChanged({ cardId: card.id, wanted: true, item: data.item });
      }
    } catch {
      // Keep the existing state if the request fails.
    } finally {
      setSaving(false);
    }
  }

  const displayLabel = wanted ? "Wanted" : label;

  return (
    <button
      type="button"
      onClick={toggleWant}
      disabled={saving || disabled}
      className={buttonClasses(mode, theme, className)}
      aria-pressed={wanted}
      aria-label={
        disabled && disabledTitle
          ? disabledTitle
          : wanted
            ? `Remove ${card.name} from wants`
            : `Add ${card.name} to wants`
      }
      title={disabled && disabledTitle ? disabledTitle : wanted ? "Remove from Wants" : "Add to Wants"}
    >
      <Heart
        className={`${mode === "icon" ? "h-3.5 w-3.5" : "h-4 w-4"} ${
          wanted ? "fill-current" : ""
        }`}
      />
      {mode === "button" && <span>{saving ? "Saving..." : displayLabel}</span>}
    </button>
  );
}
