import { NextRequest, NextResponse } from "next/server";
import { authorizeDispatchOperator } from "@/lib/security/authorization";

export async function GET(request: NextRequest) {
  const auth = await authorizeDispatchOperator(request, { allowPasswordChange: true });
  if (!auth.ok) return auth.response;
  return NextResponse.json({ success: true, operator: { id: auth.actor.id, fullName: auth.actor.fullName, email: auth.actor.email, mustChangePassword: auth.actor.mustChangePassword } });
}
