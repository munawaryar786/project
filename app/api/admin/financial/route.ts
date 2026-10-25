import { authorizeAdmin } from "@/lib/security/authorization";
import { NextRequest, NextResponse } from "next/server";
import { getAllDriverFinancialSummaries } from "@/lib/financial";

export async function GET(request: NextRequest) {
  const auth = await authorizeAdmin(request);
  if (!auth.ok) return auth.response;
  try {
    const drivers = await getAllDriverFinancialSummaries();
    return NextResponse.json({ success: true, drivers });
  } catch (error) {
    console.error("Admin financial overview error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch admin financial overview" },
      { status: 500 }
    );
  }
}
