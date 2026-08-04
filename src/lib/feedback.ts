export const FEEDBACK_CATEGORIES = ["general", "bug", "idea", "data", "reprint"] as const;
export const FEEDBACK_STATUSES = ["new", "reviewed", "resolved"] as const;

export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

export class FeedbackValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FeedbackValidationError";
  }
}

export function isFeedbackStatus(value: unknown): value is FeedbackStatus {
  return typeof value === "string" && FEEDBACK_STATUSES.includes(value as FeedbackStatus);
}

export function normalizeFeedbackInput(
  body: Record<string, unknown>,
  requestOrigin: string
): {
  category: FeedbackCategory;
  message: string;
  pageUrl: string | null;
} {
  const category = FEEDBACK_CATEGORIES.includes(body.category as FeedbackCategory)
    ? (body.category as FeedbackCategory)
    : "general";
  const message = typeof body.message === "string" ? body.message.trim() : "";

  if (message.length < 8) {
    throw new FeedbackValidationError("Please add a little more detail.");
  }
  if (message.length > 4_000) {
    throw new FeedbackValidationError("Feedback cannot be longer than 4,000 characters.");
  }

  let pageUrl: string | null = null;
  if (typeof body.pageUrl === "string" && body.pageUrl.trim()) {
    try {
      const parsed = new URL(body.pageUrl, requestOrigin);
      if (parsed.origin === requestOrigin) {
        pageUrl = `${parsed.pathname}${parsed.search}`.slice(0, 1_000);
      }
    } catch {
      pageUrl = null;
    }
  }

  return { category, message, pageUrl };
}
