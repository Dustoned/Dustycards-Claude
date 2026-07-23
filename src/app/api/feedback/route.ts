import { NextResponse } from "next/server";
import { malformedJsonBodyResponse, readJsonBody } from "@/lib/api-json";
import { authErrorResponse, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { FeedbackValidationError, normalizeFeedbackInput } from "@/lib/feedback";
import {
  isMailConfigured,
  sendFeedbackNotificationEmail,
} from "@/lib/mail";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await readJsonBody<Record<string, unknown>>(request);
    const origin = new URL(request.url).origin;
    const input = normalizeFeedbackInput(body, origin);

    const feedback = await db.feedback.create({
      data: {
        user_id: user.id,
        category: input.category,
        message: input.message,
        page_url: input.pageUrl,
      },
      select: {
        id: true,
        created_at: true,
      },
    });

    let notificationSent = false;
    if (isMailConfigured()) {
      const admins = await db.user.findMany({
        where: { role: "admin", disabled: false },
        select: { email: true },
      });
      const recipients = Array.from(
        new Set(
          [
            ...admins.map((admin) => admin.email),
            ...(process.env.FEEDBACK_NOTIFICATION_EMAIL ?? "")
              .split(",")
              .map((email) => email.trim().toLowerCase())
              .filter(Boolean),
          ].filter(Boolean)
        )
      );

      if (recipients.length > 0) {
        try {
          await sendFeedbackNotificationEmail({
            to: recipients,
            submitterEmail: user.email,
            category: input.category,
            message: input.message,
            pageUrl: input.pageUrl,
            adminUrl: `${origin}/settings?section=feedback`,
          });
          notificationSent = true;
        } catch (error) {
          console.error(
            "[feedback] notification email failed:",
            error instanceof Error ? error.message : String(error)
          );
        }
      }
    }

    return NextResponse.json({
      ok: true,
      result: {
        id: feedback.id,
        createdAt: feedback.created_at.toISOString(),
        notificationSent,
      },
    });
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;
    const malformedResponse = malformedJsonBodyResponse(error);
    if (malformedResponse) return malformedResponse;
    if (error instanceof FeedbackValidationError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }
    console.error("[feedback] submission failed:", error);
    return NextResponse.json(
      { ok: false, error: "Feedback could not be sent. Please try again." },
      { status: 500 }
    );
  }
}
