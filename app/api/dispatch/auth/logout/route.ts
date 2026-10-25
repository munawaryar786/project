import { NextRequest, NextResponse } from "next/server";
import { authorizeDispatchOperator } from "@/lib/security/authorization";
import { clearActorCookies } from "@/lib/security/session";

export async function POST(request: NextRequest) {
  const auth = await authorizeDispatchOperator(request, { allowPasswordChange: true });
  if (!auth.ok) return auth.response;
  const response = NextResponse.json({ success: true });
  clearActorCookies(response, "DISPATCH_OPERATOR");
  return response;
}
