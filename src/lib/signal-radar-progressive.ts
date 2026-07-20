import type { CardQuickActionMap } from "@/lib/card-quick-actions";
import type { ExpansionChaseRadarData } from "@/lib/expansion-chase-radar";
import type { ExternalCardSignal } from "@/lib/external-signal-radar";

export const INITIAL_SIGNAL_RADAR_CARD_COUNT = 12;

export interface SignalRadarProgressivePayload {
  signals: ExternalCardSignal[];
  cardQuickActions: CardQuickActionMap;
  newReleaseChases: ExpansionChaseRadarData | null;
}

export function selectInitialSignalRadarCards(
  signals: readonly ExternalCardSignal[],
  excludedCardIds: ReadonlySet<string>,
  limit = INITIAL_SIGNAL_RADAR_CARD_COUNT
): ExternalCardSignal[] {
  const generalSignals = signals.filter((signal) => !excludedCardIds.has(signal.cardId));
  if (generalSignals.length > 0 || signals.length === 0) {
    return generalSignals.slice(0, limit);
  }

  // Keep one lightweight chase signal so the existing duplicate-empty-state
  // logic can still explain that every radar card is already shown above.
  return signals.slice(0, 1);
}
