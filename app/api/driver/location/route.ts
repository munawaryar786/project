import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { updateDriverLocation } from "@/lib/tracking";
import { authorizeDriver } from "@/lib/security/authorization";
import { parseClientTimestamp } from "@/lib/driver-state";

const LocationSchema = z.object({
  lat: z.number().finite().min(-90).max(90),
  lng: z.number().finite().min(-180).max(180),
  accuracy: z.number().finite().min(0).max(10000).optional(),
  speed: z.number().finite().min(0).max(100).optional(),
  heading: z.number().finite().min(0).max(360).optional(),
  clientTimestamp: z.union([z.string(), z.number()]).optional(),
}).strict();

export async function POST(request: NextRequest) {
  const auth = await authorizeDriver(request);
  if (!auth.ok) return auth.response;
  const parsed = LocationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid location payload", code: "INVALID_REQUEST" }, { status: 400 });
  try {
    const receivedAt = new Date();
    const clientAt = parseClientTimestamp(parsed.data.clientTimestamp);
    if (parsed.data.clientTimestamp !== undefined && (!clientAt || clientAt > receivedAt)) {
      return NextResponse.json({ error: "Invalid client timestamp", code: "INVALID_REQUEST" }, { status: 400 });
    }
    const { lat, lng, accuracy, speed, heading } = parsed.data;
    const updatedDriver = await prisma.driver.update({
      where: { id: auth.actor.id },
      data: {
        currentLat: lat,
        currentLng: lng,
        lastLocationUpdate: receivedAt,
        lastLocationReceivedAt: receivedAt,
        lastLocationClientAt: clientAt,
        lastLocationAccuracy: accuracy ?? null,
        lastLocationSpeed: speed ?? null,
        lastLocationHeading: heading ?? null,
        lastHeartbeatAt: receivedAt,
      },
      select: {
        id: true, currentLat: true, currentLng: true, lastLocationUpdate: true,
        lastLocationClientAt: true, lastLocationReceivedAt: true,
        lastLocationAccuracy: true, lastLocationSpeed: true, lastLocationHeading: true,
        lastHeartbeatAt: true, isOnline: true, isOnTrip: true, status: true,
      },
    });
    await prisma.driverLocation.create({
      data: { driverId: auth.actor.id, lat, lng, speed: speed ?? null, heading: heading ?? null, timestamp: receivedAt },
    });
    updateDriverLocation({ driverId: auth.actor.id, lat, lng, speed, heading, timestamp: receivedAt.getTime() });
    return NextResponse.json({ success: true, receivedAt: receivedAt.toISOString(), driver: updatedDriver });
  } catch {
    return NextResponse.json({ error: "Failed to update location", code: "LOCATION_UPDATE_FAILED" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const auth = await authorizeDriver(request);
  if (!auth.ok) return auth.response;
  const driver = await prisma.driver.findUnique({
    where: { id: auth.actor.id },
    select: {
      id: true, currentLat: true, currentLng: true, lastLocationUpdate: true,
      lastLocationClientAt: true, lastLocationReceivedAt: true,
      lastLocationAccuracy: true, lastLocationSpeed: true, lastLocationHeading: true,
      lastHeartbeatAt: true, isOnline: true, isOnTrip: true, status: true,
    },
  });
  return driver
    ? NextResponse.json({ success: true, driver })
    : NextResponse.json({ error: "Driver not found", code: "DRIVER_NOT_FOUND" }, { status: 404 });
}
