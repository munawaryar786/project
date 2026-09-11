import { NextRequest, NextResponse } from "next/server";
import { authorizeAdmin } from "@/lib/security/authorization";

export async function GET(request: NextRequest) {
  const auth = await authorizeAdmin(request);
  if (!auth.ok) return auth.response;
  return NextResponse.json({
    success: true,
    admin: {
      id: auth.actor.id,
      fullName: auth.actor.fullName,
      email: auth.actor.email,
      role: auth.actor.role,
    },
  });
}
