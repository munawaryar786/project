import { NextRequest, NextResponse } from "next/server";
import { authorizeAdmin } from "@/lib/security/authorization";
import { getOperationsOverview } from "@/lib/admin-operations";

export async function GET(request: NextRequest) {
  const auth = await authorizeAdmin(request);
  if (!auth.ok) return auth.response;
  try {
    return NextResponse.json({ success: true, overview: await getOperationsOverview() });
  } catch {
    return NextResponse.json({ success: false, error: "Operations overview unavailable", code: "OPERATIONS_FETCH_FAILED" }, { status: 500 });
  }
}
