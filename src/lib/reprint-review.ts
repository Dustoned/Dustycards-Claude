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
 * Treat every already-confirmed reprint as one equivalence group, then return
 * at most one visual comparison between two different groups. An exclusion
 * between two groups suppresses every redundant cross-comparison too.
 */
export function collapseReprintReviewCandidates<T>(input: {
  candidates: ReprintReviewCandidate<T>[];
  confirmedPairs: ReprintReviewPair[];
  decisions: ReprintReviewDecision[];
  limit?: number;
}): T[] {
  const parent = new Map<string, string>();

  function find(cardId: string): string {
    const current = parent.get(cardId);
    if (!current) {
      parent.set(cardId, cardId);
      return cardId;
    }
    if (current === cardId) return cardId;
    const root = find(current);
    parent.set(cardId, root);
    return root;
  }

  function union(left: string, right: string) {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot === rightRoot) return;
    const [root, child] = orderedPair(leftRoot, rightRoot);
    parent.set(child, root);
  }

  for (const relation of input.confirmedPairs) {
    union(relation.sourceCardId, relation.targetCardId);
  }
  for (const decision of input.decisions) {
    if (decision.decision === "include") {
      union(decision.sourceCardId, decision.targetCardId);
    }
  }

  const excludedGroupPairs = new Set<string>();
  for (const decision of input.decisions) {
    if (decision.decision !== "exclude") continue;
    const sourceRoot = find(decision.sourceCardId);
    const targetRoot = find(decision.targetCardId);
    if (sourceRoot !== targetRoot) {
      excludedGroupPairs.add(pairKey(sourceRoot, targetRoot));
    }
  }

  const seenGroupPairs = new Set<string>();
  const items: T[] = [];
  const limit = Math.max(1, Math.floor(input.limit ?? 100));
  for (const candidate of input.candidates) {
    const sourceRoot = find(candidate.sourceCardId);
    const targetRoot = find(candidate.targetCardId);
    if (sourceRoot === targetRoot) continue;

    const key = pairKey(sourceRoot, targetRoot);
    if (excludedGroupPairs.has(key) || seenGroupPairs.has(key)) continue;
    seenGroupPairs.add(key);
    items.push(candidate.value);
    if (items.length >= limit) break;
  }
  return items;
}
