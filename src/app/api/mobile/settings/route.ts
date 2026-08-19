import { NextResponse } from "next/server";
import { requireMobileFeature, mobileErrorResponse } from "@/lib/mobile-api";
import { settingsPublicViewFull, resolveMailConfig } from "@/lib/company-config";
import { applyCompanyAppSettings } from "@/lib/company-settings-apply";
import { hasFeature } from "@/lib/permissions";
import { sendEmail } from "@/lib/email";

function migrateHint(error: unknown) {
  const msg = error instanceof Error ? error.message : String(error);
  if (/column|does not exist|Unknown arg|P2022/i.test(msg)) {
    return "Settings database columns are missing. Run prisma migrate deploy on the server, then retry.";
  }
  return null;
}

export async function GET(req: Request) {
  try {
    const payload = await requireMobileFeature(req, "settings");
    const settings = await settingsPublicViewFull(payload.companyId);
    if (!settings) return NextResponse.json({ error: "Company not found." }, { status: 404 });
    const canEdit = await hasFeature(payload.companyId, payload.role, "edit_settings");
    const mail = await resolveMailConfig(payload.companyId);
    return NextResponse.json({
      settings,
      canEdit,
      mailProviderActive: mail.provider,
    });
  } catch (error) {
    const hint = migrateHint(error);
    if (hint) return NextResponse.json({ error: hint }, { status: 503 });
    return mobileErrorResponse(error);
  }
}

export async function PATCH(req: Request) {
  try {
    const payload = await requireMobileFeature(req, "settings");
    const canEdit = await hasFeature(payload.companyId, payload.role, "edit_settings");
    if (!canEdit) {
      return NextResponse.json(
        { error: "You do not have permission to do that. Ask a Company Admin to update Feature access." },
        { status: 403 },
      );
    }
    const body = (await req.json()) as Record<string, unknown>;
    if (body.action === "test-email") {
      const to = String(body.testTo ?? payload.email ?? "").trim();
      if (!to) return NextResponse.json({ error: "Enter a recipient email." }, { status: 400 });
      await sendEmail({
        companyId: payload.companyId,
        type: "settings_test",
        dedupeKey: `settings-test-${payload.companyId}-${Date.now()}`,
        to: [to],
        subject: "AI Scrum Master — test email",
        html: "<p>This is a test message from mobile Settings.</p>",
        text: "This is a test message from mobile Settings.",
        skipDedupe: true,
      });
      return NextResponse.json({ message: "Test email sent (or logged to console if mail is unset)." });
    }

    await applyCompanyAppSettings(payload.companyId, body);
    const settings = await settingsPublicViewFull(payload.companyId);
    return NextResponse.json({
      settings,
      message: "Settings saved.",
    });
  } catch (error) {
    const hint = migrateHint(error);
    if (hint) return NextResponse.json({ error: hint }, { status: 503 });
    return mobileErrorResponse(error);
  }
}
