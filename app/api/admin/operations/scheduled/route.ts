import { NextRequest, NextResponse } from "next/server";
import { authorizeAdmin } from "@/lib/security/authorization";
import { listScheduledOperations } from "@/lib/admin-operations";

export async function GET(request: NextRequest) {
  const auth = await authorizeAdmin(request);
  if (!auth.ok) return auth.response;
  try {
    return NextResponse.json({ success: true, ...(await listScheduledOperations(request.nextUrl.searchParams)) });
  } catch {
    return NextResponse.json({ success: false, error: "Scheduled operations unavailable", code: "SCHEDULED_FETCH_FAILED" }, { status: 500 });
  }
}
