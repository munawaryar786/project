import { NextRequest, NextResponse } from "next/server";
import {
  authorizePassenger,
  clearPassengerCookies,
  revokePassengerSessions,
} from "@/lib/passenger-auth";

export async function POST(request: NextRequest) {
  const auth = await authorizePassenger(request);
  if (!auth.ok) return auth.response;
  await revokePassengerSessions(auth.actor.id);
  const response = NextResponse.json({ success: true });
  clearPassengerCookies(response);
  return response;
}
