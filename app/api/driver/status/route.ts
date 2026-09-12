import { NextRequest, NextResponse } from "next/server";
import { authorizeDriver } from "@/lib/security/authorization";

export async function PATCH(request: NextRequest) {
  const auth = await authorizeDriver(request);
  if (!auth.ok) return auth.response;
  return NextResponse.json({
    error: "Use explicit driver booking commands",
    code: "EXPLICIT_COMMAND_REQUIRED",
    commands: ["/api/driver/bookings/:id/enroute", "/api/driver/bookings/:id/arrived", "/api/driver/bookings/:id/start", "/api/driver/bookings/:id/complete"],
  }, { status: 405 });
}
