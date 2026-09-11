import { NextRequest, NextResponse } from "next/server";
import { authorizeDriver } from "@/lib/security/authorization";
import { clearActorCookies } from "@/lib/security/session";

export async function POST(request: NextRequest) {
  const auth = await authorizeDriver(request);
  if (!auth.ok) return auth.response;
  const response = NextResponse.json({ success: true, message: "Driver logged out" });
  clearActorCookies(response, "DRIVER");
  return response;
}
