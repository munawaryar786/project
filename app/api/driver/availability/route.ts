import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * PATCH /api/driver/availability
 * Driver online/offline toggle
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { driverId, isOnline } = body;

    if (!driverId || typeof isOnline !== "boolean") {
      return NextResponse.json(
        { error: "driverId and isOnline are required" },
        { status: 400 }
      );
    }

    const driver = await prisma.driver.update({
      where: { id: driverId },
      data: {
        isOnline,
        lastLocationUpdate: new Date(),
      },
    });

    console.log(
      `🚗 Driver availability updated: ${driver.fullName} → ${
        isOnline ? "ONLINE" : "OFFLINE"
      }`
    );

    return NextResponse.json({
      success: true,
      driver: {
        id: driver.id,
        fullName: driver.fullName,
        isOnline: driver.isOnline,
      },
    });
  } catch (error) {
    console.error("❌ Driver availability update error:", error);
    return NextResponse.json(
      { error: "Failed to update availability" },
      { status: 500 }
    );
  }
}