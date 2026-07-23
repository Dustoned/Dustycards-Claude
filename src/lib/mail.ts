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

function createMailTransport(config: MailConfig) {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    auth: {
      user: config.user,
      pass: config.pass,
    },
  });
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function isMailConfigured(): boolean {
  return Boolean(getMailConfig());
}

export async function sendFeedbackNotificationEmail({
  to,
  submitterEmail,
  category,
  message,
  pageUrl,
  adminUrl,
}: {
  to: string[];
  submitterEmail: string;
  category: string;
  message: string;
  pageUrl: string | null;
  adminUrl: string;
}) {
  const config = getMailConfig();
  if (!config) throw new Error("SMTP mail is not configured.");
  if (to.length === 0) return;

  const transporter = createMailTransport(config);
  const categoryLabel = category.charAt(0).toUpperCase() + category.slice(1);
  const pageLine = pageUrl ? `Page: ${pageUrl}` : "Page: not supplied";

  await transporter.sendMail({
    from: `"${config.fromName}" <${config.fromEmail}>`,
    to,
    subject: `New DustyCards feedback: ${categoryLabel}`,
    text: [
      `Feedback from ${submitterEmail}`,
      `Category: ${categoryLabel}`,
      pageLine,
      "",
      message,
      "",
      `Review feedback: ${adminUrl}`,
    ].join("\n"),
    html: `
      <div style="font-family:Arial,sans-serif;color:#111827;line-height:1.55;max-width:680px;margin:0 auto;">
        <h1 style="font-size:22px;margin:0 0 6px;">New DustyCards feedback</h1>
        <p style="margin:0 0 18px;color:#6b7280;">Submitted by ${escapeHtml(submitterEmail)}</p>
        <div style="margin:0 0 14px;padding:14px;border:1px solid #e5e7eb;border-radius:12px;background:#fafafa;">
          <div style="font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:#6b7280;">${escapeHtml(categoryLabel)}</div>
          <div style="margin-top:10px;white-space:pre-wrap;font-size:15px;color:#111827;">${escapeHtml(message)}</div>
          ${pageUrl ? `<div style="margin-top:12px;font-size:12px;color:#6b7280;">Page: ${escapeHtml(pageUrl)}</div>` : ""}
        </div>
        <a href="${escapeHtml(adminUrl)}" style="display:inline-block;padding:10px 14px;background:#6d4aff;color:#ffffff;border-radius:9px;text-decoration:none;font-weight:700;">Review in Settings</a>
      </div>`,
  });
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

  const transporter = createMailTransport(config);

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

  const transporter = createMailTransport(config);

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

export interface HighPotentialSignalEmailItem {
  name: string;
  setName: string;
  score: number;
  confluenceScore: number | null;
  confidence: string;
  currentPriceLabel: string;
  reason: string;
  url: string;
}

export async function sendHighPotentialSignalDigest({
  to,
  items,
  radarUrl,
}: {
  to: string;
  items: HighPotentialSignalEmailItem[];
  radarUrl: string;
}) {
  const config = getMailConfig();
  if (!config) throw new Error("SMTP mail is not configured.");
  if (items.length === 0) return;
  const transporter = createMailTransport(config);
  const subject =
    items.length === 1
      ? `High-potential card: ${items[0].name}`
      : `${items.length} new high-potential cards on DustyCards`;
  const textItems = items.flatMap((item) => [
    `${item.name} — ${item.setName}`,
    `Opportunity ${item.score}/100 · ${item.confidence} confidence · ${item.currentPriceLabel}`,
    item.confluenceScore == null ? item.reason : `Setup ${item.confluenceScore}/100 · ${item.reason}`,
    item.url,
    "",
  ]);
  const htmlItems = items
    .map(
      (item) => `
        <div style="margin:0 0 12px;padding:14px;border:1px solid #e5e7eb;border-radius:12px;background:#fafafa;">
          <div style="font-size:17px;font-weight:800;color:#111827;">${escapeHtml(item.name)}</div>
          <div style="margin-top:2px;font-size:13px;color:#6b7280;">${escapeHtml(item.setName)}</div>
          <div style="margin-top:10px;font-size:14px;color:#111827;"><strong>${item.score}/100 opportunity</strong> · ${escapeHtml(item.confidence)} confidence · ${escapeHtml(item.currentPriceLabel)}</div>
          <div style="margin-top:5px;font-size:13px;color:#4b5563;">${item.confluenceScore == null ? "" : `Setup ${item.confluenceScore}/100 · `}${escapeHtml(item.reason)}</div>
          <a href="${escapeHtml(item.url)}" style="display:inline-block;margin-top:12px;padding:9px 12px;background:#6d4aff;color:#ffffff;border-radius:9px;text-decoration:none;font-weight:700;">View full analysis</a>
        </div>`
    )
    .join("");

  await transporter.sendMail({
    from: `"${config.fromName}" <${config.fromEmail}>`,
    to,
    subject,
    text: [
      "DustyCards found newly qualified high-potential cards.",
      "",
      ...textItems,
      `Open Signal Radar: ${radarUrl}`,
      "",
      "You receive this because High-potential email alerts are enabled in your DustyCards settings.",
    ].join("\n"),
    html: `
      <div style="font-family:Arial,sans-serif;color:#111827;line-height:1.5;max-width:680px;margin:0 auto;">
        <h1 style="font-size:22px;margin:0 0 6px;">High-potential cards detected</h1>
        <p style="margin:0 0 18px;color:#6b7280;">These cards newly passed DustyCards' strict alert threshold.</p>
        ${htmlItems}
        <p style="margin-top:18px;"><a href="${escapeHtml(radarUrl)}" style="color:#6d4aff;font-weight:700;">Open Signal Radar</a></p>
        <p style="margin-top:18px;font-size:12px;color:#9ca3af;">You receive this because High-potential email alerts are enabled in your DustyCards settings.</p>
      </div>`,
  });
}

export interface CardPriceAlertEmailItem {
  name: string;
  setName: string;
  kind: "drop" | "target";
  currentPriceEur: number;
  baselinePriceEur: number | null;
  targetPriceEur: number | null;
  url: string;
}

function formatEuro(value: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export async function sendCardPriceAlertDigest({
  to,
  items,
}: {
  to: string;
  items: CardPriceAlertEmailItem[];
}) {
  const config = getMailConfig();
  if (!config) throw new Error("SMTP mail is not configured.");
  if (items.length === 0) return;

  const transporter = createMailTransport(config);
  const subject =
    items.length === 1
      ? `Price alert: ${items[0].name}`
      : `${items.length} cards hit your price alerts`;
  const textItems = items.flatMap((item) => {
    const rule =
      item.kind === "drop"
        ? `Dropped below the armed price${
            item.baselinePriceEur == null ? "" : ` of ${formatEuro(item.baselinePriceEur)}`
          }`
        : `Reached your target${
            item.targetPriceEur == null ? "" : ` of ${formatEuro(item.targetPriceEur)}`
          }`;
    return [
      `${item.name} - ${item.setName}`,
      `CardMarket EN / Near Mint: ${formatEuro(item.currentPriceEur)}`,
      rule,
      item.url,
      "",
    ];
  });
  const htmlItems = items
    .map((item) => {
      const rule =
        item.kind === "drop"
          ? `Dropped below the armed price${
              item.baselinePriceEur == null
                ? ""
                : ` of <strong>${escapeHtml(formatEuro(item.baselinePriceEur))}</strong>`
            }`
          : `Reached your target${
              item.targetPriceEur == null
                ? ""
                : ` of <strong>${escapeHtml(formatEuro(item.targetPriceEur))}</strong>`
            }`;
      return `
        <div style="margin:0 0 12px;padding:14px;border:1px solid #e5e7eb;border-radius:12px;background:#fafafa;">
          <div style="font-size:17px;font-weight:800;color:#111827;">${escapeHtml(item.name)}</div>
          <div style="margin-top:2px;font-size:13px;color:#6b7280;">${escapeHtml(item.setName)}</div>
          <div style="margin-top:10px;font-size:20px;font-weight:800;color:#111827;">${escapeHtml(formatEuro(item.currentPriceEur))}</div>
          <div style="margin-top:4px;font-size:13px;color:#4b5563;">CardMarket EN / Near Mint &middot; ${rule}</div>
          <a href="${escapeHtml(item.url)}" style="display:inline-block;margin-top:12px;padding:9px 12px;background:#6d4aff;color:#ffffff;border-radius:9px;text-decoration:none;font-weight:700;">View card</a>
        </div>`;
    })
    .join("");

  await transporter.sendMail({
    from: `"${config.fromName}" <${config.fromEmail}>`,
    to,
    subject,
    text: [
      "Your DustyCards card price alert was triggered.",
      "",
      ...textItems,
      "These are one-time alerts. Triggered alerts are now paused; open the card to set one again.",
    ].join("\n"),
    html: `
      <div style="font-family:Arial,sans-serif;color:#111827;line-height:1.5;max-width:680px;margin:0 auto;">
        <h1 style="font-size:22px;margin:0 0 6px;">Your price alert was triggered</h1>
        <p style="margin:0 0 18px;color:#6b7280;">Latest raw CardMarket English / Near Mint prices.</p>
        ${htmlItems}
        <p style="margin-top:18px;font-size:12px;color:#9ca3af;">These are one-time alerts. Triggered alerts are now paused; open the card to set one again.</p>
      </div>`,
  });
}
