import { NextRequest, NextResponse } from "next/server";
import { getAddressSuggestions } from "@/lib/google-maps";

/**
 * GET /api/addresses/suggest - Get address autocomplete suggestions
 * Query params: q (search query)
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q");
  const educational = searchParams.get("educational") === "1";

  if (!query || query.length < 3) {
    return NextResponse.json(
      { suggestions: [] },
      { status: 200 }
    );
  }

  try {
    const suggestions = await getAddressSuggestions(query, educational);

    return NextResponse.json({
      success: true,
      suggestions,
    });
  } catch (error: any) {
    console.error("❌ Address autocomplete error:", error.message);
    return NextResponse.json(
      { error: "Failed to get address suggestions" },
      { status: 500 }
    );
  }
}
