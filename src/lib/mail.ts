import nodemailer from "nodemailer";

type MailConfig = {
  host: string;
  port: number;
  user: string;
  pass: string;
  fromEmail: string;
  fromName: string;
};

function getMailConfig(): MailConfig | null {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT ?? "587");
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const fromEmail = process.env.MAIL_FROM_EMAIL;
  const fromName = process.env.MAIL_FROM_NAME ?? "DustyCards";

  if (!host || !Number.isFinite(port) || !user || !pass || !fromEmail) {
    return null;
  }

  return { host, port, user, pass, fromEmail, fromName };
}

export function isMailConfigured(): boolean {
  return Boolean(getMailConfig());
}

export async function sendPasswordResetEmail({
  resetUrl,
  to,
}: {
  resetUrl: string;
  to: string;
}) {
  const config = getMailConfig();
  if (!config) {
    throw new Error("SMTP mail is not configured.");
  }

  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    auth: {
      user: config.user,
      pass: config.pass,
    },
  });

  await transporter.sendMail({
    from: `"${config.fromName}" <${config.fromEmail}>`,
    to,
    subject: "Reset your DustyCards password",
    text: [
      "You requested a password reset for DustyCards.",
      "",
      "Open this link to choose a new password:",
      resetUrl,
      "",
      "This link expires in 30 minutes. If you did not request this, you can ignore this email.",
    ].join("\n"),
    html: `
      <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.5;">
        <h1 style="font-size: 20px; margin: 0 0 12px;">Reset your DustyCards password</h1>
        <p>You requested a password reset for DustyCards.</p>
        <p>
          <a href="${resetUrl}" style="display:inline-block; padding:10px 14px; background:#111827; color:#ffffff; border-radius:8px; text-decoration:none; font-weight:700;">
            Choose a new password
          </a>
        </p>
        <p style="font-size: 14px; color: #6b7280;">This link expires in 30 minutes. If you did not request this, you can ignore this email.</p>
      </div>
    `,
  });
}

export async function sendEmailVerificationEmail({
  to,
  verifyUrl,
}: {
  to: string;
  verifyUrl: string;
}) {
  const config = getMailConfig();
  if (!config) {
    throw new Error("SMTP mail is not configured.");
  }

  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    auth: {
      user: config.user,
      pass: config.pass,
    },
  });

  await transporter.sendMail({
    from: `"${config.fromName}" <${config.fromEmail}>`,
    to,
    subject: "Verify your DustyCards email",
    text: [
      "Welcome to DustyCards.",
      "",
      "Open this link to verify your email address:",
      verifyUrl,
      "",
      "This link expires in 24 hours. If you did not create this account, you can ignore this email.",
    ].join("\n"),
    html: `
      <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.5;">
        <h1 style="font-size: 20px; margin: 0 0 12px;">Verify your DustyCards email</h1>
        <p>Welcome to DustyCards. Verify your email address to finish creating your account.</p>
        <p>
          <a href="${verifyUrl}" style="display:inline-block; padding:10px 14px; background:#111827; color:#ffffff; border-radius:8px; text-decoration:none; font-weight:700;">
            Verify email
          </a>
        </p>
        <p style="font-size: 14px; color: #6b7280;">This link expires in 24 hours. If you did not create this account, you can ignore this email.</p>
      </div>
    `,
  });
}
