import { NextRequest, NextResponse } from "next/server";
import { getPassengerFromRequest, publicPassenger } from "@/lib/passenger-auth";

export async function GET(request: NextRequest) {
  const passenger = await getPassengerFromRequest(request);

  if (!passenger) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  return NextResponse.json({
    success: true,
    passenger: publicPassenger(passenger),
  });
}
