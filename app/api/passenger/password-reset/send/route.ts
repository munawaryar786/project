import { NextRequest, NextResponse } from "next/server";
import { rateLimits, withDistributedIpRateLimit } from "@/lib/rate-limit";

// Deprecated compatibility endpoint. Passenger recovery is email-only in Phase 3J.
async function handler(_request: NextRequest) {
  return NextResponse.json({ success: true, message: "If an account exists, password reset instructions will be sent by email." });
}
export const runtime = "nodejs";
export const POST = withDistributedIpRateLimit(handler, { domain: "password-reset-legacy-send", max: rateLimits.passengerPasswordResetOtpSend.max, windowMs: rateLimits.passengerPasswordResetOtpSend.windowMs, message: rateLimits.passengerPasswordResetOtpSend.message });
