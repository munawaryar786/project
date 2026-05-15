import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const REQUEST_TIMEOUT_SECONDS = 30;

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

function vehicleMatches(driverVehicle: string | null, serviceType: string) {
  if (!driverVehicle) return true;
  if (serviceType === "ACCESSIBLE") return driverVehicle === "WAV" || driverVehicle === "7_SEATER";
  if (serviceType === "AIRPORT") return ["STANDARD", "7_SEATER", "WAV"].includes(driverVehicle);
  return true;
}

export async function PATCH(request: NextRequest) {
  try {
    const { requestId, driverId, action } = await request.json();

    if (!requestId || !driverId || !action) {
      return NextResponse.json(
        { error: "requestId, driverId, and action are required" },
        { status: 400 }
      );
    }

    if (!["ACCEPT", "REJECT"].includes(action)) {
      return NextResponse.json(
        { error: "Action must be ACCEPT or REJECT" },
        { status: 400 }
      );
    }

    const rideRequest = await prisma.rideRequest.findUnique({
      where: { id: requestId },
    });

    if (!rideRequest) {
      return NextResponse.json({ error: "Ride request not found" }, { status: 404 });
    }

    if (rideRequest.driverId !== driverId) {
      return NextResponse.json(
        { error: "This ride request does not belong to this driver" },
        { status: 403 }
      );
    }

    const booking = await prisma.booking.findUnique({
      where: { id: rideRequest.bookingId },
      include: { driver: true },
    });

    if (!booking) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }

    if (["COMPLETED", "CANCELLED", "NO_SHOW"].includes(booking.status)) {
      await prisma.rideRequest.update({
        where: { id: requestId },
        data: { status: "EXPIRED", respondedAt: new Date() },
      });

      return NextResponse.json(
        { error: `Booking is already ${booking.status}` },
        { status: 400 }
      );
    }

    if (rideRequest.status !== "PENDING") {
      return NextResponse.json(
        { error: `Ride request is already ${rideRequest.status}` },
        { status: 400 }
      );
    }

    if (rideRequest.expiresAt < new Date()) {
      await prisma.rideRequest.update({
        where: { id: requestId },
        data: { status: "EXPIRED", respondedAt: new Date() },
      });

      return NextResponse.json({ error: "Ride request expired" }, { status: 400 });
    }

    if (action === "ACCEPT") {
      const driver = await prisma.driver.findUnique({
        where: { id: driverId },
      });

      if (!driver) {
        return NextResponse.json({ error: "Driver not found" }, { status: 404 });
      }

      if (driver.status !== "ACTIVE") {
        return NextResponse.json({ error: "Driver is not active" }, { status: 400 });
      }

      if (driver.isOnTrip && booking.driverId !== driverId) {
        return NextResponse.json(
          { error: "Driver is already on another trip" },
          { status: 400 }
        );
      }

      const updatedRequest = await prisma.rideRequest.update({
        where: { id: requestId },
        data: { status: "ACCEPTED", respondedAt: new Date() },
      });

      const updatedBooking = await prisma.booking.update({
        where: { id: rideRequest.bookingId },
        data: {
          driverId,
          status: "ASSIGNED",
          dispatchStatus: "ACCEPTED",
          acceptedAt: new Date(),
        },
        include: { driver: true },
      });

      await prisma.driver.update({
        where: { id: driverId },
        data: { isOnTrip: true },
      });

      await prisma.rideRequest.updateMany({
        where: {
          bookingId: rideRequest.bookingId,
          id: { not: requestId },
          status: "PENDING",
        },
        data: { status: "EXPIRED", respondedAt: new Date() },
      });

      console.log(
        `✅ Ride request accepted: booking=${updatedBooking.bookingRef}, driver=${updatedBooking.driver?.fullName}`
      );

      return NextResponse.json({
        success: true,
        action: "ACCEPTED",
        rideRequest: updatedRequest,
        booking: updatedBooking,
      });
    }

    const updatedRequest = await prisma.rideRequest.update({
      where: { id: requestId },
      data: { status: "REJECTED", respondedAt: new Date() },
    });

    const previousRequests = await prisma.rideRequest.findMany({
      where: { bookingId: rideRequest.bookingId },
      select: { driverId: true },
    });

    const excludedDriverIds = previousRequests.map((r) => r.driverId);

    const availableDrivers = await prisma.driver.findMany({
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
        currentLat: true,
        currentLng: true,
        lastLocationUpdate: true,
      },
    });

    const pickupLat = toNumber((booking as any).pickupLat);
    const pickupLng = toNumber((booking as any).pickupLng);

    const rankedDrivers = availableDrivers
      .filter((driver) => vehicleMatches(driver.vehicleType, booking.serviceType))
      .map((driver) => {
        const driverLat = toNumber(driver.currentLat);
        const driverLng = toNumber(driver.currentLng);

        const hasDistance =
          pickupLat !== null &&
          pickupLng !== null &&
          driverLat !== null &&
          driverLng !== null;

        const distance = hasDistance
          ? distanceKm(pickupLat, pickupLng, driverLat, driverLng)
          : null;

        return {
          driver,
          distance,
          lastUpdateScore: driver.lastLocationUpdate
            ? new Date(driver.lastLocationUpdate).getTime()
            : 0,
        };
      })
      .sort((a, b) => {
        if (a.distance !== null && b.distance !== null) return a.distance - b.distance;
        if (a.distance !== null) return -1;
        if (b.distance !== null) return 1;
        return b.lastUpdateScore - a.lastUpdateScore;
      });

    const selected = rankedDrivers[0];

    if (!selected) {
      const updatedBooking = await prisma.booking.update({
        where: { id: rideRequest.bookingId },
        data: { dispatchStatus: "NO_DRIVER_AVAILABLE" },
      });

      console.log(
        `❌ Ride request rejected and no next driver available: booking=${updatedBooking.bookingRef}`
      );

      return NextResponse.json({
        success: true,
        action: "REJECTED",
        rideRequest: updatedRequest,
        redispatched: false,
        message: "No next online available driver found",
      });
    }

    const expiresAt = new Date(Date.now() + REQUEST_TIMEOUT_SECONDS * 1000);

    const nextRideRequest = await prisma.rideRequest.create({
      data: {
        bookingId: rideRequest.bookingId,
        driverId: selected.driver.id,
        status: "PENDING",
        expiresAt,
      },
    });

    const updatedBooking = await prisma.booking.update({
      where: { id: rideRequest.bookingId },
      data: { dispatchStatus: "SEARCHING_DRIVER" },
    });

    console.log("═══════════════════════════════════════");
    console.log("🔁 RIDE REQUEST RE-DISPATCHED");
    console.log(`📋 Booking: ${updatedBooking.bookingRef}`);
    console.log(`❌ Rejected By: ${driverId}`);
    console.log(`🚗 Next Driver: ${selected.driver.fullName}`);
    console.log(
      `📍 Distance: ${
        selected.distance !== null ? `${selected.distance.toFixed(2)} km` : "N/A"
      }`
    );
    console.log(`⏰ Expires: ${expiresAt.toISOString()}`);
    console.log("═══════════════════════════════════════");

    return NextResponse.json({
      success: true,
      action: "REJECTED",
      rideRequest: updatedRequest,
      redispatched: true,
      nextRideRequest,
      nextDriver: {
        id: selected.driver.id,
        fullName: selected.driver.fullName,
        phone: selected.driver.phone,
        vehicleType: selected.driver.vehicleType,
        vehiclePlate: selected.driver.vehiclePlate,
        distanceKm:
          selected.distance !== null ? Number(selected.distance.toFixed(2)) : null,
      },
    });
  } catch (error) {
    console.error("❌ Ride request response error:", error);
    return NextResponse.json(
      { error: "Failed to respond to ride request" },
      { status: 500 }
    );
  }
}