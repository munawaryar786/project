import { NextRequest, NextResponse } from "next/server";
import { rateLimits, withRateLimit } from "@/lib/rate-limit";

// Deprecated compatibility endpoint. Passenger recovery is email-only in Phase 3J.
async function handler(_request: NextRequest) {
  return NextResponse.json({ success: true, message: "If an account exists, password reset instructions will be sent by email." });
}
export const POST = withRateLimit(handler, rateLimits.passengerPasswordResetOtpSend);
