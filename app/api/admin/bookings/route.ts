import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  calculateBookingFinancialBreakdown,
  createOrUpdateDriverEarningForBooking,
} from "@/lib/commission-engine";

const VALID_STATUSES = [
  "PENDING",
  "CONFIRMED",
  "ASSIGNED",
  "DRIVER_ENROUTE",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
  "NO_SHOW",
];

const TERMINAL_STATUSES = ["COMPLETED", "CANCELLED", "NO_SHOW"];

const adminBookingInclude = {
  driver: true,
  earning: true,
  passenger: {
    include: {
      bookings: {
        select: { id: true },
      },
    },
  },
} satisfies Prisma.BookingInclude;

const bookingFinancialInclude = {
  driver: true,
  earning: true,
} satisfies Prisma.BookingInclude;

type AdminBookingWithRelations = Prisma.BookingGetPayload<{
  include: typeof adminBookingInclude;
}>;

type BookingWithFinancialRelations = Prisma.BookingGetPayload<{
  include: typeof bookingFinancialInclude;
}>;

type BookingForFinancialBreakdown =
  | AdminBookingWithRelations
  | BookingWithFinancialRelations;

async function withFinancialBreakdown(
  booking: BookingForFinancialBreakdown | null | undefined
) {
  if (!booking) return null;

  const { earning, driver } = booking;

  if (earning) {
    return {
      ...booking,
      financialBreakdown: {
        totalFare: Number(earning.totalFare || 0),
        platformCommission: Number(earning.platformAmount || 0),
        platformEarnings: Number(earning.platformAmount || 0),
        driverEarnings: Number(earning.driverAmount || 0),
        serviceType: booking.serviceType || "UNKNOWN",
        commissionPercentageUsed: Number(earning.commissionRate || 0),
        commissionSource: "EARNING",
        commissionSourceId: earning.id,
      },
    };
  }

  const financialBreakdown = await calculateBookingFinancialBreakdown({
    driverId: booking.driverId,
    fleetId: null,
    serviceType: booking.serviceType,
    fareTotalFare: booking.fareTotalFare,
    estimatedPrice: booking.estimatedPrice,
  });

  return {
    ...booking,
    financialBreakdown,
  };
}

export async function GET() {
  try {
    const bookings = await prisma.booking.findMany({
      orderBy: { createdAt: "desc" },
      include: adminBookingInclude,
      take: 100,
    });
    const bookingsWithFinancials = (
      await Promise.all(bookings.map(withFinancialBreakdown))
    ).filter((booking) => booking !== null);

    return NextResponse.json({
      success: true,
      bookings: bookingsWithFinancials,
      total: bookingsWithFinancials.length,
    });
  } catch (error) {
    console.error("❌ Admin bookings fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch bookings" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { bookingId, status, driverId } = body;

    if (!bookingId) {
      return NextResponse.json(
        { error: "Booking ID required" },
        { status: 400 }
      );
    }

    if (status && !VALID_STATUSES.includes(status)) {
      return NextResponse.json(
        { error: `Invalid booking status: ${status}` },
        { status: 400 }
      );
    }

    const currentBooking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: { driver: true },
    });

    if (!currentBooking) {
      return NextResponse.json(
        { error: "Booking not found" },
        { status: 404 }
      );
    }

    const updateData: any = {};

    if (status) {
      updateData.status = status;

      if (TERMINAL_STATUSES.includes(status)) {
        updateData.dispatchStatus =
          status === "COMPLETED" ? "ACCEPTED" : "NOT_STARTED";
      }
    }

    if (driverId) {
      const driver = await prisma.driver.findUnique({
        where: { id: driverId },
      });

      if (!driver) {
        return NextResponse.json(
          { error: "Driver not found" },
          { status: 404 }
        );
      }

      if (driver.status !== "ACTIVE") {
        return NextResponse.json(
          { error: "Driver is not active" },
          { status: 400 }
        );
      }

      if (driver.isOnTrip && currentBooking.driverId !== driverId) {
        return NextResponse.json(
          { error: "Driver is already on trip" },
          { status: 400 }
        );
      }

      updateData.driverId = driverId;
      updateData.status = "ASSIGNED";
      updateData.dispatchStatus = "ACCEPTED";
      updateData.acceptedAt = currentBooking.acceptedAt || new Date();

      await prisma.driver.update({
        where: { id: driverId },
        data: { isOnTrip: true },
      });

      await prisma.rideRequest.updateMany({
        where: {
          bookingId,
          status: "PENDING",
        },
        data: {
          status: "EXPIRED",
          respondedAt: new Date(),
        },
      });
    }

    const updatedBooking = await prisma.booking.update({
      where: { id: bookingId },
      data: updateData,
      include: { driver: true, earning: true },
    });

    if (
      status &&
      TERMINAL_STATUSES.includes(status) &&
      currentBooking.driverId
    ) {
      await prisma.driver.update({
        where: { id: currentBooking.driverId },
        data: { isOnTrip: false },
      });
    }

    if (status === "COMPLETED" && updatedBooking.driverId) {
      await createOrUpdateDriverEarningForBooking(updatedBooking.id);
    }

    const bookingWithFinancials = await prisma.booking.findUnique({
      where: { id: updatedBooking.id },
      include: bookingFinancialInclude,
    });

    console.log("═══════════════════════════════════════");
    console.log("📋 ADMIN BOOKING UPDATED");
    console.log(`Ref: ${updatedBooking.bookingRef}`);
    console.log(`Status: ${currentBooking.status} → ${updatedBooking.status}`);
    console.log(`Dispatch: ${updatedBooking.dispatchStatus || "NOT_STARTED"}`);
    console.log(`Driver: ${updatedBooking.driver?.fullName || "None"}`);
    console.log("═══════════════════════════════════════");

    return NextResponse.json({
      success: true,
      booking: bookingWithFinancials
        ? await withFinancialBreakdown(bookingWithFinancials)
        : updatedBooking,
    });
  } catch (error) {
    console.error("❌ Admin booking update error:", error);
    return NextResponse.json(
      { error: "Failed to update booking" },
      { status: 500 }
    );
  }
}
