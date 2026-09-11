import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { updateDriverLocation } from "@/lib/tracking";
import { authorizeDriver } from "@/lib/security/authorization";

const LocationSchema = z.object({
  driverId: z.string().optional(),
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  speed: z.number().finite().min(0).max(100).optional(),
  heading: z.number().finite().min(0).max(360).optional(),
}).strict();

export async function POST(request: NextRequest) {
  const auth = await authorizeDriver(request);
  if (!auth.ok) return auth.response;
  try {
    const parsed = LocationSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Invalid location payload" }, { status: 400 });
    const { lat, lng, speed, heading } = parsed.data;
    const updatedDriver = await prisma.driver.update({
      where: { id: auth.actor.id },
      data: { currentLat: lat, currentLng: lng, lastLocationUpdate: new Date() },
      select: {
        id: true, currentLat: true, currentLng: true, lastLocationUpdate: true,
        isOnline: true, isOnTrip: true, status: true,
      },
    });
    await prisma.driverLocation.create({
      data: { driverId: auth.actor.id, lat, lng, speed: speed ?? null, heading: heading ?? null },
    });
    updateDriverLocation({
      driverId: auth.actor.id, lat, lng, speed, heading, timestamp: Date.now(),
    });
    return NextResponse.json({ success: true, driver: updatedDriver });
  } catch {
    return NextResponse.json({ error: "Failed to update location" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const auth = await authorizeDriver(request);
  if (!auth.ok) return auth.response;
  const driver = await prisma.driver.findUnique({
    where: { id: auth.actor.id },
    select: {
      id: true, currentLat: true, currentLng: true, lastLocationUpdate: true,
      isOnline: true, isOnTrip: true, status: true,
    },
  });
  return driver
    ? NextResponse.json({ success: true, driver })
    : NextResponse.json({ error: "Driver not found" }, { status: 404 });
}
