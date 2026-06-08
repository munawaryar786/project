import { NextRequest, NextResponse } from "next/server";
import { getDriverFinancialSummary } from "@/lib/financial";

export async function GET(request: NextRequest) {
  try {
    const driverId = request.nextUrl.searchParams.get("driverId");

    if (!driverId) {
      return NextResponse.json(
        { success: false, error: "Driver ID required" },
        { status: 400 }
      );
    }

    const financial = await getDriverFinancialSummary(driverId);

    return NextResponse.json({ success: true, financial });
  } catch (error) {
    console.error("Driver financial overview error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch driver financial overview" },
      { status: 500 }
    );
  }
}
