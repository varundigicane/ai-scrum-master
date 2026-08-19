import { NextResponse } from "next/server";
import { requireMobileFeature, mobileErrorResponse } from "@/lib/mobile-api";
import { getMeetingProvidersStatus } from "@/lib/meeting-providers";

export async function GET(req: Request) {
  try {
    await requireMobileFeature(req, "meeting_notes");
    return NextResponse.json(getMeetingProvidersStatus());
  } catch (error) {
    return mobileErrorResponse(error);
  }
}
