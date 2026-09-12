import { NextRequest, NextResponse } from "next/server";
import { authorizeAdmin } from "@/lib/security/authorization";
import { listOperationalRides } from "@/lib/admin-operations";

export async function GET(request: NextRequest) {
  const auth = await authorizeAdmin(request);
  if (!auth.ok) return auth.response;
  try {
    return NextResponse.json({ success: true, ...(await listOperationalRides(request.nextUrl.searchParams)) });
  } catch {
    return NextResponse.json({ success: false, error: "Ride operations unavailable", code: "RIDES_FETCH_FAILED" }, { status: 500 });
  }
}
