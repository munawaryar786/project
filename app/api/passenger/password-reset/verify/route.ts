import { NextRequest, NextResponse } from "next/server";
import { rateLimits, withRateLimit } from "@/lib/rate-limit";

// Deprecated compatibility endpoint. It never accepts or verifies a phone OTP.
async function handler(_request: NextRequest) {
  return NextResponse.json({ success: false, error: "Password recovery is email-only. Request a new reset email." }, { status: 410 });
}
export const POST = withRateLimit(handler, rateLimits.passengerPasswordResetOtpVerify);
