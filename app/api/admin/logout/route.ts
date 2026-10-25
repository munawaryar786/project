import { NextRequest, NextResponse } from "next/server";
import { authorizeAdmin } from "@/lib/security/authorization";
import { clearActorCookies } from "@/lib/security/session";

export async function POST(request: NextRequest) {
  const auth = await authorizeAdmin(request);
  if (!auth.ok) return auth.response;
  const response = NextResponse.json({ success: true, message: "Admin logged out" });
  clearActorCookies(response, "ADMIN");
  return response;
}
