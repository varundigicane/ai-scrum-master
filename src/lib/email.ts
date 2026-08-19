import nodemailer from "nodemailer";
import { SignJWT, importPKCS8 } from "jose";
import { prisma } from "@/lib/prisma";
import { resolveMailConfig, type ResolvedMailConfig } from "@/lib/company-config";

type SendEmailArgs = {
  companyId: string;
  type: string;
  dedupeKey: string;
  to: string[];
  subject: string;
  html: string;
  text?: string;
  entityType?: string;
  entityId?: string;
  skipDedupe?: boolean;
};

function toBase64Url(input: string | Buffer) {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function buildRawMessage(opts: {
  from: string;
  to: string[];
  subject: string;
  html: string;
  text?: string;
}) {
  const boundary = `asm_${Date.now()}`;
  const headers = [
    `From: ${opts.from}`,
    `To: ${opts.to.join(", ")}`,
    `Subject: ${opts.subject}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ].join("\r\n");

  const textPart = opts.text ?? opts.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const body = [
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "",
    textPart,
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "",
    opts.html,
    `--${boundary}--`,
  ].join("\r\n");

  return `${headers}\r\n\r\n${body}`;
}

async function gmailAccessTokenSa(cfg: ResolvedMailConfig): Promise<string | null> {
  if (!cfg.gmailClientEmail || !cfg.gmailPrivateKey || !cfg.gmailUserEmail) return null;
  try {
    const key = await importPKCS8(cfg.gmailPrivateKey, "RS256");
    const now = Math.floor(Date.now() / 1000);
    const jwt = await new SignJWT({
      scope: "https://www.googleapis.com/auth/gmail.send",
      sub: cfg.gmailUserEmail,
    })
      .setProtectedHeader({ alg: "RS256", typ: "JWT" })
      .setIssuer(cfg.gmailClientEmail)
      .setAudience("https://oauth2.googleapis.com/token")
      .setIssuedAt(now)
      .setExpirationTime(now + 3600)
      .sign(key);

    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwt,
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { access_token?: string };
    return data.access_token ?? null;
  } catch {
    return null;
  }
}

async function gmailAccessTokenOauth(cfg: ResolvedMailConfig): Promise<string | null> {
  if (!cfg.gmailClientId || !cfg.gmailClientSecret || !cfg.gmailRefreshToken) return null;
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: cfg.gmailClientId,
        client_secret: cfg.gmailClientSecret,
        refresh_token: cfg.gmailRefreshToken,
        grant_type: "refresh_token",
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { access_token?: string };
    return data.access_token ?? null;
  } catch {
    return null;
  }
}

async function sendViaGmail(cfg: ResolvedMailConfig, args: SendEmailArgs, recipients: string[]) {
  const token =
    (await gmailAccessTokenSa(cfg)) || (await gmailAccessTokenOauth(cfg));
  if (!token) {
    throw new Error("Gmail authentication failed. Check Mail settings or env credentials.");
  }

  const userId = encodeURIComponent(cfg.gmailUserEmail || "me");
  const raw = toBase64Url(
    buildRawMessage({
      from: cfg.from,
      to: recipients,
      subject: args.subject,
      html: args.html,
      text: args.text,
    }),
  );

  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/${userId}/messages/send`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Gmail API send failed (${res.status}). ${errText.slice(0, 200)}`);
  }
}

async function sendViaSmtp(cfg: ResolvedMailConfig, args: SendEmailArgs, recipients: string[]) {
  if (!cfg.smtpHost) throw new Error("SMTP host is not configured.");
  const transporter = nodemailer.createTransport({
    host: cfg.smtpHost,
    port: cfg.smtpPort ?? 587,
    secure: false,
    auth: cfg.smtpUser ? { user: cfg.smtpUser, pass: cfg.smtpPass } : undefined,
  });
  await transporter.sendMail({
    from: cfg.from,
    to: recipients.join(", "),
    subject: args.subject,
    html: args.html,
    text: args.text,
  });
}

function logConsole(args: SendEmailArgs, recipients: string[]) {
  console.log("\n===== EMAIL (console) =====");
  console.log("To:", recipients.join(", "));
  console.log("Subject:", args.subject);
  const urls = [...args.html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
  if (urls.length) console.log("Links:", urls.join("\n       "));
  console.log(args.text ?? args.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
  console.log("===========================\n");
}

export async function sendEmail(args: SendEmailArgs): Promise<boolean> {
  const recipients = [...new Set(args.to.filter(Boolean))];
  if (recipients.length === 0) return false;

  if (!args.skipDedupe) {
    const existing = await prisma.notificationLog.findUnique({
      where: {
        companyId_dedupeKey: {
          companyId: args.companyId,
          dedupeKey: args.dedupeKey,
        },
      },
    });
    if (existing) return false;
  }

  const cfg = await resolveMailConfig(args.companyId);

  try {
    if (cfg.provider === "gmail") {
      await sendViaGmail(cfg, args, recipients);
    } else if (cfg.provider === "smtp") {
      await sendViaSmtp(cfg, args, recipients);
    } else {
      logConsole(args, recipients);
    }
  } catch (error) {
    console.error("sendEmail failed:", error);
    // Soft-fail: still log to console so magic links are not lost on Railway
    logConsole(args, recipients);
  }

  try {
    await prisma.notificationLog.create({
      data: {
        companyId: args.companyId,
        type: args.type,
        dedupeKey: args.dedupeKey,
        recipients: recipients.join(","),
        subject: args.subject,
        body: args.text ?? args.html,
        entityType: args.entityType,
        entityId: args.entityId,
      },
    });
  } catch {
    return false;
  }

  return true;
}
