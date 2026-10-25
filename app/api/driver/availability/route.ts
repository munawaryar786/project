import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authorizeDriver } from "@/lib/security/authorization";
import { getDriverPresence } from "@/lib/driver-operations";
import { cancelPendingOffersForOffline } from "@/lib/automatic-dispatch";
import { errorBody, DRIVER_ERROR_CODES } from "@/lib/driver-state";

const AvailabilitySchema = z.object({ isOnline: z.boolean() }).strict();

export async function PATCH(request: NextRequest) {
  const auth = await authorizeDriver(request);
  if (!auth.ok) return auth.response;
  const parsed = AvailabilitySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(errorBody(DRIVER_ERROR_CODES.INVALID_REQUEST, "Invalid availability request"), { status: 400 });
  }
  try {
    const driver = await prisma.driver.update({
      where: { id: auth.actor.id },
      data: { isOnline: parsed.data.isOnline, lastHeartbeatAt: new Date() },
      select: { id: true, fullName: true, isOnline: true, isOnTrip: true, lastLocationReceivedAt: true, lastLocationUpdate: true },
    });
    const offlineDispatch = parsed.data.isOnline ? null : await cancelPendingOffersForOffline(auth.actor.id);
    const presence = await getDriverPresence(auth.actor.id);
    return NextResponse.json({ success: true, driver, presence: presence?.state || "OFFLINE", dispatch: offlineDispatch });
  } catch {
    return NextResponse.json({ error: "Failed to update availability", code: "AVAILABILITY_UPDATE_FAILED" }, { status: 500 });
  }
}
