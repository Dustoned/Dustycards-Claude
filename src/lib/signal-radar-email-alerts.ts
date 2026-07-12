import { db } from "@/lib/db";
import type { ExternalCardSignal, ExternalSignalRadarData } from "@/lib/external-signal-radar";
import { isMailConfigured, sendHighPotentialSignalDigest } from "@/lib/mail";
import { getMailPublicOrigin } from "@/lib/public-origin";
import { parseStoredSettings } from "@/lib/user-settings";

const MIN_OPPORTUNITY_SCORE = 90;
const MIN_CONFLUENCE_SCORE = 65;
const MAX_ALERTS_PER_DIGEST = 5;
const REPEAT_COOLDOWN_MS = 30 * 24 * 60 * 60_000;
const SCORE_IMPROVEMENT_COOLDOWN_MS = 7 * 24 * 60 * 60_000;
const SCORE_IMPROVEMENT_THRESHOLD = 5;
const ALERT_STATE_PREFIX = "signal-radar-email";

export interface HighPotentialAlertCandidate {
  signal: ExternalCardSignal;
  score: number;
  confluenceScore: number | null;
  reason: string;
}

export interface SignalRadarEmailAlertResult {
  configured: boolean;
  subscribers: number;
  candidates: number;
  emailsSent: number;
  cardsSent: number;
  errors: string[];
}

type StoredAlertState = {
  sentAt?: string;
  score?: number;
};

function alertStateKey(userId: string, cardId: string): string {
  return `${ALERT_STATE_PREFIX}:${userId}:${cardId}`;
}

function parseAlertState(value: string | null | undefined): StoredAlertState | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as StoredAlertState;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function shouldSendCandidate(
  candidate: HighPotentialAlertCandidate,
  state: StoredAlertState | null,
  now: Date
): boolean {
  if (!state?.sentAt) return true;
  const sentAt = Date.parse(state.sentAt);
  if (!Number.isFinite(sentAt)) return true;
  const ageMs = now.getTime() - sentAt;
  if (ageMs >= REPEAT_COOLDOWN_MS) return true;
  const previousScore = typeof state.score === "number" ? state.score : null;
  return (
    previousScore != null &&
    candidate.score >= previousScore + SCORE_IMPROVEMENT_THRESHOLD &&
    ageMs >= SCORE_IMPROVEMENT_COOLDOWN_MS
  );
}

export function selectHighPotentialAlertCandidates(
  signals: ExternalCardSignal[]
): HighPotentialAlertCandidate[] {
  return signals
    .flatMap((signal) => {
      if (signal.confidence === "Emerging") return [];
      const score = signal.marketIntelligence?.rawOpportunityScore ?? signal.externalScore;
      const confluenceScore = signal.marketIntelligence?.confluence.score ?? null;
      const independentlyConfirmed =
        (confluenceScore ?? 0) >= MIN_CONFLUENCE_SCORE || signal.externalScore >= 90;
      if (score < MIN_OPPORTUNITY_SCORE || !independentlyConfirmed) return [];
      const reason =
        signal.marketIntelligence?.confluence.drivers[0] ??
        signal.reasons[0] ??
        signal.pressureExplanation;
      return [{ signal, score, confluenceScore, reason }];
    })
    .sort(
      (left, right) =>
        right.score - left.score ||
        (right.confluenceScore ?? 0) - (left.confluenceScore ?? 0) ||
        left.signal.rank - right.signal.rank
    );
}

function priceLabel(signal: ExternalCardSignal): string {
  if (signal.currentPrice == null) return "Price unavailable";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: signal.currency,
    maximumFractionDigits: signal.currentPrice >= 100 ? 0 : 2,
  }).format(signal.currentPrice);
}

export async function sendHighPotentialSignalAlerts(
  data: ExternalSignalRadarData,
  now = new Date()
): Promise<SignalRadarEmailAlertResult> {
  const result: SignalRadarEmailAlertResult = {
    configured: isMailConfigured(),
    subscribers: 0,
    candidates: 0,
    emailsSent: 0,
    cardsSent: 0,
    errors: [],
  };
  if (!result.configured) return result;

  const candidates = selectHighPotentialAlertCandidates(data.signals);
  result.candidates = candidates.length;
  if (candidates.length === 0) return result;

  const users = await db.user.findMany({
    where: {
      disabled: false,
      email_verified_at: { not: null },
    },
    select: { id: true, email: true, settings_json: true },
  });
  const subscribers = users.filter(
    (user) => parseStoredSettings(user.settings_json)?.signalRadarEmailAlerts === true
  );
  result.subscribers = subscribers.length;
  if (subscribers.length === 0) return result;

  const origin = getMailPublicOrigin();
  const radarUrl = new URL("/movers/signal-radar", origin).toString();

  for (const user of subscribers) {
    const keys = candidates.map((candidate) => alertStateKey(user.id, candidate.signal.cardId));
    const storedStates = await db.appSetting.findMany({
      where: { key: { in: keys } },
      select: { key: true, value: true },
    });
    const stateByKey = new Map(storedStates.map((state) => [state.key, parseAlertState(state.value)]));
    const selected = candidates
      .filter((candidate) =>
        shouldSendCandidate(
          candidate,
          stateByKey.get(alertStateKey(user.id, candidate.signal.cardId)) ?? null,
          now
        )
      )
      .slice(0, MAX_ALERTS_PER_DIGEST);
    if (selected.length === 0) continue;

    try {
      await sendHighPotentialSignalDigest({
        to: user.email,
        radarUrl,
        items: selected.map((candidate) => ({
          name: candidate.signal.name,
          setName: candidate.signal.episodeName,
          score: candidate.score,
          confluenceScore: candidate.confluenceScore,
          confidence: candidate.signal.confidence,
          currentPriceLabel: priceLabel(candidate.signal),
          reason: candidate.reason,
          url: new URL(
            `/movers/signal-radar/${encodeURIComponent(candidate.signal.cardId)}?game=${candidate.signal.game}`,
            origin
          ).toString(),
        })),
      });
      await db.$transaction(
        selected.map((candidate) =>
          db.appSetting.upsert({
            where: { key: alertStateKey(user.id, candidate.signal.cardId) },
            create: {
              key: alertStateKey(user.id, candidate.signal.cardId),
              value: JSON.stringify({ sentAt: now.toISOString(), score: candidate.score }),
            },
            update: {
              value: JSON.stringify({ sentAt: now.toISOString(), score: candidate.score }),
            },
          })
        )
      );
      result.emailsSent += 1;
      result.cardsSent += selected.length;
    } catch (error) {
      result.errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  return result;
}
