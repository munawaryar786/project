import { NextRequest, NextResponse } from "next/server";
import { getDriverFinancialSummary } from "@/lib/financial";
import { authorizeDriver } from "@/lib/security/authorization";

export async function GET(request: NextRequest) {
  const auth = await authorizeDriver(request);
  if (!auth.ok) return auth.response;
  try {
    const financial = await getDriverFinancialSummary(auth.actor.id);
    return NextResponse.json({ success: true, financial });
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to fetch driver financial overview" },
      { status: 500 }
    );
  }
}
