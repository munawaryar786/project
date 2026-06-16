import { NextRequest, NextResponse } from "next/server";
import {
  clearPassengerCookies,
  getPassengerFromRequest,
  revokePassengerSessions,
} from "@/lib/passenger-auth";

export async function POST(request: NextRequest) {
  const passenger = await getPassengerFromRequest(request);
  if (passenger) {
    await revokePassengerSessions(passenger.id);
  }

  const response = NextResponse.json({ success: true });
  clearPassengerCookies(response);
  return response;
}
