import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authorizeAdmin } from "@/lib/security/authorization";
import { boundedText, requireReason, retryAdminDispatch } from "@/lib/admin-operations";

const Schema = z.object({
  bookingId: z.string().regex(/^[a-f0-9]{24}$/i),
  reason: z.string().trim().min(3).max(500),
  requestId: z.string().trim().min(8).max(120),
}).strict();

export async function POST(request: NextRequest) {
  const auth = await authorizeAdmin(request);
  if (!auth.ok) return auth.response;
  const parsed = Schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !requireReason(parsed.data?.reason) || !boundedText(parsed.data?.requestId, 120)) {
    return NextResponse.json({ success: false, error: "A bounded operational reason and request id are required", code: "AUDIT_REASON_REQUIRED" }, { status: 400 });
  }
  const result = await retryAdminDispatch(parsed.data, auth.actor.id);
  if (!result.ok) {
    const status = ["BOOKING_NOT_FOUND"].includes(result.code) ? 404 : 409;
    return NextResponse.json({ success: false, error: "Dispatch retry was not allowed", code: result.code }, { status });
  }
  return NextResponse.json({ success: true, ...result });
}
