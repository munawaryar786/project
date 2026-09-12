import { NextRequest, NextResponse } from "next/server";
import { rateLimits, withDistributedIpRateLimit } from "@/lib/rate-limit";

// Deprecated compatibility endpoint. It never accepts or verifies a phone OTP.
async function handler(_request: NextRequest) {
  return NextResponse.json({ success: false, error: "Password recovery is email-only. Request a new reset email." }, { status: 410 });
}
export const runtime = "nodejs";
export const POST = withDistributedIpRateLimit(handler, { domain: "password-reset-legacy-verify", max: rateLimits.passengerPasswordResetOtpVerify.max, windowMs: rateLimits.passengerPasswordResetOtpVerify.windowMs, message: rateLimits.passengerPasswordResetOtpVerify.message });
