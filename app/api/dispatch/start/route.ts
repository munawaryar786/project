import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const REQUEST_TIMEOUT_SECONDS = 30;
const DRIVER_LOCATION_STALE_MINUTES = 30;

function toNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;

  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function normalizeVehicleType(vehicleType?: string | null) {
  return vehicleType?.trim().toUpperCase() || "UNKNOWN";
}

function vehicleMatches(
  driverVehicle: string | null | undefined,
  serviceType: string,
  passengerCount: number
) {
  const vehicle = normalizeVehicleType(driverVehicle);

  // TEMP PRODUCTION-SAFE MVP RULE:
  // If vehicle type is not set in admin, allow driver for dispatch.
  // Later, when all drivers have vehicles assigned, make this stricter.
  if (vehicle === "UNKNOWN") return true;

  if (passengerCount >= 5) {
    return ["7_SEATER", "MINIVAN", "VAN", "WAV"].includes(vehicle);
  }

  if (serviceType === "ACCESSIBLE") {
    return ["WAV", "7_SEATER", "MINIVAN", "VAN"].includes(vehicle);
  }

  if (serviceType === "AIRPORT") {
    return ["STANDARD", "7_SEATER", "MINIVAN", "VAN", "WAV"].includes(vehicle);
  }

  return true;
}

function isFreshLocation(lastLocationUpdate: Date | null) {
  if (!lastLocationUpdate) return false;
  const ageMs = Date.now() - new Date(lastLocationUpdate).getTime();
  return ageMs <= DRIVER_LOCATION_STALE_MINUTES * 60 * 1000;
}

export async function POST(request: NextRequest) {
  try {
    const { bookingId } = await request.json();

    if (!bookingId) {
      return NextResponse.json({ error: "bookingId is required" }, { status: 400 });
    }

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: { driver: true },
    });

    if (!booking) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }

    if (["COMPLETED", "CANCELLED", "NO_SHOW"].includes(booking.status)) {
      return NextResponse.json(
        { error: "Cannot dispatch completed, cancelled, or no-show booking" },
        { status: 400 }
      );
    }

    if (["COMPLETED", "CANCELLED", "NO_SHOW"].includes(booking.status)) {
  return NextResponse.json(
    { error: "Cannot dispatch completed, cancelled, or no-show booking" },
    { status: 400 }
  );
}

if (
  booking.status !== "PENDING" &&
  booking.status !== "SEARCHING_DRIVER"
) {
  return NextResponse.json(
    { error: "Booking cannot be dispatched" },
    { status: 400 }
  );
}

    if (
      booking.dispatchStatus === "ACCEPTED" &&
      booking.driverId &&
      ["ASSIGNED", "DRIVER_ENROUTE", "IN_PROGRESS"].includes(booking.status)
    ) {
      return NextResponse.json(
        { error: `Booking already accepted by ${booking.driver?.fullName || "driver"}` },
        { status: 400 }
      );
    }

    const now = new Date();

    await prisma.rideRequest.updateMany({
      where: {
        bookingId,
        status: "PENDING",
      },
      data: {
        status: "EXPIRED",
        respondedAt: now,
      },
    });

    const previousRequests = await prisma.rideRequest.findMany({
      where: {
        bookingId,
        status: { in: ["REJECTED", "ACCEPTED"] },
      },
      select: { driverId: true },
    });

    const excludedDriverIds = previousRequests.map((r) => r.driverId);

    const drivers = await prisma.driver.findMany({ 
    
      where: {
        status: "ACTIVE",
        isOnline: true,
        isOnTrip: false,
        id: { notIn: excludedDriverIds },
      },
      select: {
        id: true,
        fullName: true,
        phone: true,
        vehicleType: true,
        vehiclePlate: true,
        vehicleCapacity: true,
        currentLat: true,
        currentLng: true,
        lastLocationUpdate: true,
        isOnline: true,
        isOnTrip: true,
        status: true,
      },
    });
    const capacityFilteredDrivers =
  booking.passengerCount >= 6
    ? drivers.filter((driver) => (driver.vehicleCapacity ?? 4) >= 6)
    : drivers;

    const pickupLat = toNumber((booking as any).pickupLat);
    const pickupLng = toNumber((booking as any).pickupLng);

    const rankedDrivers = capacityFilteredDrivers
      .filter((driver) =>
        vehicleMatches(driver.vehicleType, booking.serviceType, booking.passengerCount)
      )
      .map((driver) => {
        const driverLat = toNumber(driver.currentLat);
        const driverLng = toNumber(driver.currentLng);

        const hasFreshLocation =
          pickupLat !== null &&
          pickupLng !== null &&
          driverLat !== null &&
          driverLng !== null &&
          isFreshLocation(driver.lastLocationUpdate);

        const distance = hasFreshLocation
          ? distanceKm(pickupLat, pickupLng, driverLat, driverLng)
          : null;

        const lastUpdateScore = driver.lastLocationUpdate
          ? new Date(driver.lastLocationUpdate).getTime()
          : 0;

        return { driver, distance, hasFreshLocation, lastUpdateScore };
      })
      .sort((a, b) => {
        if (a.distance !== null && b.distance !== null) return a.distance - b.distance;
        if (a.distance !== null) return -1;
        if (b.distance !== null) return 1;
        return b.lastUpdateScore - a.lastUpdateScore;
      });

    console.log("🧪 DISPATCH DEBUG", {
      booking: booking.bookingRef,
      serviceType: booking.serviceType,
      passengerCount: booking.passengerCount,
      availableDrivers: drivers.length,
      rankedDrivers: rankedDrivers.map((r) => ({
        name: r.driver.fullName,
        vehicleType: r.driver.vehicleType,
        isOnline: r.driver.isOnline,
        isOnTrip: r.driver.isOnTrip,
        distance: r.distance,
      })),
    });

    const selected = rankedDrivers[0];

    if (!selected) {
      await prisma.booking.update({
        where: { id: bookingId },
        data: { dispatchStatus: "NO_DRIVER_AVAILABLE" },
      });

      return NextResponse.json(
        { error: "No online available driver found" },
        { status: 404 }
      );
    }

    const expiresAt = new Date(Date.now() + REQUEST_TIMEOUT_SECONDS * 1000);

    const rideRequest = await prisma.rideRequest.create({
      data: {
        bookingId,
        driverId: selected.driver.id,
        status: "PENDING",
        expiresAt,
      },
    });

    const updatedBooking = await prisma.booking.update({
      where: { id: bookingId },
      data: { dispatchStatus: "SEARCHING_DRIVER" },
      include: { driver: true },
    });

    console.log("═══════════════════════════════════════");
    console.log("📡 DISPATCH STARTED");
    console.log(`📋 Booking: ${booking.bookingRef}`);
    console.log(`🚗 Driver:  ${selected.driver.fullName}`);
    console.log(
      `📍 Distance: ${
        selected.distance !== null ? `${selected.distance.toFixed(2)} km` : "N/A"
      }`
    );
    console.log(`⏰ Expires: ${expiresAt.toISOString()}`);
    console.log("═══════════════════════════════════════");

    return NextResponse.json({
      success: true,
      booking: updatedBooking,
      rideRequest,
      driver: {
        id: selected.driver.id,
        fullName: selected.driver.fullName,
        phone: selected.driver.phone,
        vehicleType: selected.driver.vehicleType,
        vehiclePlate: selected.driver.vehiclePlate,
        distanceKm:
          selected.distance !== null ? Number(selected.distance.toFixed(2)) : null,
        hasFreshLocation: selected.hasFreshLocation,
      },
    });
  } catch (error) {
    console.error("❌ Dispatch start error:", error);
    return NextResponse.json(
      { error: "Failed to start dispatch" },
      { status: 500 }
    );
  }
}