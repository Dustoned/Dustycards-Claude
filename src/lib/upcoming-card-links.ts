import type { UpcomingLibraryReference, UpcomingSingleItem } from "@/lib/upcoming-releases";

export function resolveUpcomingLibraryReferenceKind(input: {
  storedMethod: UpcomingLibraryReference["kind"] | null | undefined;
  hasUniqueNumberMatch: boolean;
}): UpcomingLibraryReference["kind"] {
  return input.storedMethod ?? (input.hasUniqueNumberMatch ? "set-number" : "name");
}

export function isExactUpcomingLibraryReference(
  reference: UpcomingLibraryReference | null | undefined
): boolean {
  return reference != null && reference.kind !== "name";
}

export function getUpcomingCardHref(
  item: Pick<UpcomingSingleItem, "episodeId" | "cardId" | "libraryReference">
): string | null {
  if (item.episodeId && item.cardId) {
    return `/expansions/${item.episodeId}?card=${item.cardId}`;
  }
  return item.libraryReference?.href ?? null;
}
