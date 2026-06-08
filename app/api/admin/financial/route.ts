import { NextResponse } from "next/server";
import { getAllDriverFinancialSummaries } from "@/lib/financial";

export async function GET() {
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
