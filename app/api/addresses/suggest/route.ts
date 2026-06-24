import { NextRequest, NextResponse } from "next/server";
import { getAddressSuggestionItems } from "@/lib/google-maps";

/**
 * GET /api/addresses/suggest - Get address and POI autocomplete suggestions.
 * Query params: q, optional educationalOnly/type filter.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = (searchParams.get("q") || "").trim();
  const typeFilter = (searchParams.get("type") || "").trim().toLowerCase();
  const educationalOnly =
    searchParams.get("educationalOnly") === "true" ||
    searchParams.get("educationalOnly") === "1" ||
    searchParams.get("educational") === "1" ||
    typeFilter === "education" ||
    typeFilter === "educational";

  if (query.length < 3) {
    return NextResponse.json(
      { success: true, suggestions: [], suggestionItems: [] },
      { status: 200 }
    );
  }

  try {
    const suggestionItems = await getAddressSuggestionItems(query, { educationalOnly });

    return NextResponse.json({
      success: true,
      suggestions: suggestionItems.map((item) => item.description),
      suggestionItems,
    });
  } catch (error: any) {
    console.error("Address autocomplete error:", error.message);
    return NextResponse.json(
      { error: "Failed to get address suggestions" },
      { status: 500 }
    );
  }
}
