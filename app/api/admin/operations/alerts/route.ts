import { NextRequest, NextResponse } from "next/server";
import { authorizeAdmin } from "@/lib/security/authorization";
import { getOperationsOverview } from "@/lib/admin-operations";

export async function GET(request: NextRequest) {
  const auth = await authorizeAdmin(request);
  if (!auth.ok) return auth.response;
  try {
    const overview = await getOperationsOverview();
    return NextResponse.json({ success: true, alerts: overview.alerts, timestamp: overview.timestamp });
  } catch {
    return NextResponse.json({ success: false, error: "Operations alerts unavailable", code: "ALERTS_FETCH_FAILED" }, { status: 500 });
  }
}
