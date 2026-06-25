import { NextRequest, NextResponse } from "next/server";
import { getPassengerFromRequest, publicPassenger } from "@/lib/passenger-auth";

export async function GET(request: NextRequest) {
  const passenger = await getPassengerFromRequest(request);

  if (!passenger) {
    return NextResponse.json(
      {
        success: false,
        code: "AUTHENTICATION_REQUIRED",
        message: "Please log in or verify your phone to continue.",
        error: "Please log in or verify your phone to continue.",
      },
      { status: 401 }
    );
  }

  return NextResponse.json({
    success: true,
    passenger: publicPassenger(passenger),
  });
}
