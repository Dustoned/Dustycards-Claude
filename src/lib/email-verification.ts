import { generateSessionToken, hashSessionToken } from "@/lib/auth-crypto";
import { db } from "@/lib/db";
import { sendEmailVerificationEmail } from "@/lib/mail";

const EMAIL_VERIFICATION_TOKEN_TTL_MS = 1000 * 60 * 60 * 24;

export async function sendVerificationEmailForUser({
  baseUrl,
  email,
  userId,
}: {
  baseUrl: string;
  email: string;
  userId: string;
}) {
  const token = generateSessionToken();
  const verifyUrl = new URL("/api/auth/verify-email", baseUrl);
  verifyUrl.searchParams.set("token", token);

  await db.emailVerificationToken.deleteMany({ where: { user_id: userId } });
  await db.emailVerificationToken.create({
    data: {
      user_id: userId,
      token_hash: hashSessionToken(token),
      expires_at: new Date(Date.now() + EMAIL_VERIFICATION_TOKEN_TTL_MS),
    },
  });

  await sendEmailVerificationEmail({
    to: email,
    verifyUrl: verifyUrl.toString(),
  });
}
