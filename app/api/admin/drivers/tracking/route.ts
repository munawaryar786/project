import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeAdmin } from "@/lib/security/authorization";

/**
 * GET /api/admin/drivers/tracking - Get all active drivers with locations
 */
export async function GET(request: NextRequest) {
  const auth = await authorizeAdmin(request);
  if (!auth.ok) return auth.response;
  try {
    const drivers = await prisma.driver.findMany({
      where: {
        status: "ACTIVE",
      },
      select: {
        id: true,
        fullName: true,
        phone: true,
        email: true,
        vehicleType: true,
        vehiclePlate: true,
        currentLat: true,
        currentLng: true,
        lastLocationUpdate: true,
        isOnline: true,
        isOnTrip: true,
        status: true,
        _count: {
          select: {
            bookings: true,
          },
        },
      },
      orderBy: {
        lastLocationUpdate: "desc",
      },
    });

    const driversWithHistory = await Promise.all(
      drivers.map(async (driver: any) => {
        const locationHistory = await prisma.driverLocation.findMany({
          where: { driverId: driver.id },
          orderBy: { timestamp: "desc" },
          take: 10,
        });

        return {
          ...driver,
          locationHistory: locationHistory.map((loc: any) => ({
            lat: loc.lat,
            lng: loc.lng,
            timestamp: loc.timestamp,
          })),
        };
      })
    );

    return NextResponse.json({
      success: true,
      drivers: driversWithHistory,
      total: drivers.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Get active drivers error:", error.message);
    return NextResponse.json(
      { error: "Failed to fetch drivers" },
      { status: 500 }
    );
  }
}
