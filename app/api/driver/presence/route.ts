import { NextRequest, NextResponse } from "next/server";
import { authorizeDriver } from "@/lib/security/authorization";
import { getDriverPresence } from "@/lib/driver-operations";

export async function GET(request: NextRequest) {
  const auth = await authorizeDriver(request);
  if (!auth.ok) return auth.response;
  const maxAgeParam = new URL(request.url).searchParams.get("maxLocationAgeMs");
  const maxAge = maxAgeParam ? Number(maxAgeParam) : undefined;
  if (maxAgeParam !== null && (!maxAgeParam.trim() || !Number.isFinite(maxAge) || Number(maxAge) < 0)) {
    return NextResponse.json({ error: "Invalid maximum location age", code: "INVALID_REQUEST" }, { status: 400 });
  }
  const presence = await getDriverPresence(auth.actor.id, Number.isFinite(maxAge) ? maxAge : undefined);
  return presence
    ? NextResponse.json({ success: true, presence })
    : NextResponse.json({ error: "Driver not found", code: "DRIVER_NOT_FOUND" }, { status: 404 });
}
