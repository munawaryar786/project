import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { updateDriverLocation } from "@/lib/tracking";

/**
 * POST /api/driver/location
 * Driver live GPS update
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { driverId, lat, lng, speed, heading, isOnTrip } = body;

    if (!driverId) {
      return NextResponse.json(
        { error: "driverId is required" },
        { status: 400 }
      );
    }

    const latitude = Number(lat);
    const longitude = Number(lng);

    if (
      Number.isNaN(latitude) ||
      Number.isNaN(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      return NextResponse.json(
        { error: "Valid latitude and longitude are required" },
        { status: 400 }
      );
    }

    const driver = await prisma.driver.findUnique({
      where: { id: String(driverId) },
      select: {
        id: true,
        fullName: true,
        isOnTrip: true,
      },
    });

    if (!driver) {
      return NextResponse.json(
        { error: "Driver not found" },
        { status: 404 }
      );
    }

    const updatedDriver = await prisma.driver.update({
      where: { id: String(driverId) },
      data: {
        currentLat: latitude,
        currentLng: longitude,
        lastLocationUpdate: new Date(),
        isOnTrip:
          typeof isOnTrip === "boolean" ? isOnTrip : driver.isOnTrip,
      },
      select: {
        id: true,
        fullName: true,
        currentLat: true,
        currentLng: true,
        lastLocationUpdate: true,
        isOnline: true,
        isOnTrip: true,
        status: true,
      },
    });

    await prisma.driverLocation.create({
      data: {
        driverId: String(driverId),
        lat: latitude,
        lng: longitude,
        speed:
          typeof speed === "number" && Number.isFinite(speed)
            ? speed
            : null,
        heading:
          typeof heading === "number" && Number.isFinite(heading)
            ? heading
            : null,
      },
    });

    updateDriverLocation({
      driverId: String(driverId),
      lat: latitude,
      lng: longitude,
      speed:
        typeof speed === "number" && Number.isFinite(speed)
          ? speed
          : undefined,
      heading:
        typeof heading === "number" && Number.isFinite(heading)
          ? heading
          : undefined,
      timestamp: Date.now(),
    });

    console.log(
      `📍 Driver location updated: ${updatedDriver.fullName} (${latitude}, ${longitude})`
    );

    return NextResponse.json({
      success: true,
      driver: updatedDriver,
    });
  } catch (error: any) {
    console.error("❌ Driver location update error:", error);
    return NextResponse.json(
      { error: "Failed to update location" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/driver/location
 */
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const driverId = url.searchParams.get("driverId");

    if (!driverId) {
      return NextResponse.json(
        { error: "Driver ID required" },
        { status: 400 }
      );
    }

    const driver = await prisma.driver.findUnique({
      where: { id: String(driverId) },
      select: {
        id: true,
        fullName: true,
        currentLat: true,
        currentLng: true,
        lastLocationUpdate: true,
        isOnline: true,
        isOnTrip: true,
        status: true,
      },
    });

    if (!driver) {
      return NextResponse.json(
        { error: "Driver not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      driver,
    });
  } catch (error: any) {
    console.error("❌ Get driver location error:", error);
    return NextResponse.json(
      { error: "Failed to get location" },
      { status: 500 }
    );
  }
}