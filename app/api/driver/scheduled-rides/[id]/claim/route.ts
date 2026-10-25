import { NextRequest, NextResponse } from "next/server";
import { authorizeDriver } from "@/lib/security/authorization";
import { claimScheduledRide, SCHEDULED_ERROR_CODES } from "@/lib/scheduled-marketplace";
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeDriver(request); if (!auth.ok) return auth.response;
  const { id } = await params;
  if (!/^[a-f0-9]{24}$/i.test(id)) return NextResponse.json({ error: "Invalid booking id", code: "INVALID_REQUEST" }, { status: 400 });
  const result = await claimScheduledRide(id, auth.actor.id);
  if (!result.ok) { const status = result.code === SCHEDULED_ERROR_CODES.SCHEDULED_RIDE_NOT_FOUND ? 404 : result.code === SCHEDULED_ERROR_CODES.ROUTE_FEASIBILITY_UNAVAILABLE ? 503 : 409; return NextResponse.json({ error: result.code.replaceAll("_", " "), code: result.code }, { status }); }
  return NextResponse.json({ success: true, alreadyClaimed: result.alreadyClaimed, bookingId: id });
}