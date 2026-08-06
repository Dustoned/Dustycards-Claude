export type ReprintReviewPair = {
  sourceCardId: string;
  targetCardId: string;
};

export type ReprintReviewDecision = ReprintReviewPair & {
  decision: "include" | "exclude" | string;
};

export type ReprintReviewCandidate<T> = ReprintReviewPair & {
  value: T;
};

function orderedPair(left: string, right: string): readonly [string, string] {
  return left < right ? [left, right] : [right, left];
}

function pairKey(left: string, right: string): string {
  return orderedPair(left, right).join("\u0000");
}

/**
 * A manual decision belongs only to the exact unordered pair that was shown.
 * Confirmed groups do not propagate it, while forward and reversed directions
 * collapse into the same review so A → B can never return as B → A.
 */
export function collapseReprintReviewCandidates<T>(input: {
  candidates: ReprintReviewCandidate<T>[];
  confirmedPairs: ReprintReviewPair[];
  decisions: ReprintReviewDecision[];
  limit?: number;
}): T[] {
  const reviewedPairs = new Set<string>();
  for (const decision of input.decisions) {
    reviewedPairs.add(pairKey(decision.sourceCardId, decision.targetCardId));
  }

  const seenPairs = new Set<string>();
  const items: T[] = [];
  const limit = Math.max(1, Math.floor(input.limit ?? 100));
  for (const candidate of input.candidates) {
    const key = pairKey(candidate.sourceCardId, candidate.targetCardId);
    if (reviewedPairs.has(key) || seenPairs.has(key)) continue;
    seenPairs.add(key);
    items.push(candidate.value);
    if (items.length >= limit) break;
  }
  return items;
}
