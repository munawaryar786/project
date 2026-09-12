import { NextRequest, NextResponse } from "next/server";
import { authorizeAdmin } from "@/lib/security/authorization";
import { listOperationalDrivers } from "@/lib/admin-operations";

export async function GET(request: NextRequest) {
  const auth = await authorizeAdmin(request);
  if (!auth.ok) return auth.response;
  try {
    return NextResponse.json({ success: true, ...(await listOperationalDrivers(request.nextUrl.searchParams)) });
  } catch {
    return NextResponse.json({ success: false, error: "Driver operations unavailable", code: "DRIVERS_FETCH_FAILED" }, { status: 500 });
  }
}
