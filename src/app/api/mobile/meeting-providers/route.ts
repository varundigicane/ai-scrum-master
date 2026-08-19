import { NextResponse } from "next/server";
import { requireMobileFeature, mobileErrorResponse } from "@/lib/mobile-api";
import { getMeetingProvidersStatus } from "@/lib/meeting-providers";

export async function GET(req: Request) {
  try {
    const payload = await requireMobileFeature(req, "meeting_notes");
    return NextResponse.json(await getMeetingProvidersStatus(payload.companyId));
  } catch (error) {
    return mobileErrorResponse(error);
  }
}
