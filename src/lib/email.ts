import nodemailer from "nodemailer";
import { prisma } from "@/lib/prisma";

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

  const from = process.env.EMAIL_FROM ?? "AI Scrum Master <noreply@localhost>";
  const host = process.env.SMTP_HOST;

  if (!host) {
    console.log("\n===== EMAIL (console) =====");
    console.log("To:", recipients.join(", "));
    console.log("Subject:", args.subject);
    const urls = [...args.html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
    if (urls.length) console.log("Links:", urls.join("\n       "));
    console.log(args.text ?? args.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
    console.log("===========================\n");
  } else {
    const transporter = nodemailer.createTransport({
      host,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: false,
      auth:
        process.env.SMTP_USER
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
          : undefined,
    });
    await transporter.sendMail({
      from,
      to: recipients.join(", "),
      subject: args.subject,
      html: args.html,
      text: args.text,
    });
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
    // Unique constraint = already sent
    return false;
  }

  return true;
}
