import { NextRequest, NextResponse } from "next/server";
import { authorizeAdmin } from "@/lib/security/authorization";
import { listAdminAudit } from "@/lib/admin-operations";

export async function GET(request: NextRequest) {
  const auth = await authorizeAdmin(request);
  if (!auth.ok) return auth.response;
  try {
    return NextResponse.json({ success: true, entries: await listAdminAudit(request.nextUrl.searchParams) });
  } catch {
    return NextResponse.json({ success: false, error: "Audit history unavailable", code: "AUDIT_FETCH_FAILED" }, { status: 500 });
  }
}
