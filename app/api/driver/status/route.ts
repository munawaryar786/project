import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createOrUpdateDriverEarningForBooking } from "@/lib/commission-engine";
import { z } from "zod";
import { authorizeDriver } from "@/lib/security/authorization";

const StatusSchema = z.object({
  bookingId: z.string().regex(/^[a-f0-9]{24}$/i),
  newStatus: z.enum(["DRIVER_ENROUTE", "IN_PROGRESS", "COMPLETED"]),
  cashConfirmed: z.boolean().optional(),
  driverId: z.string().optional(),
}).strict();

const VALID_DRIVER_STATUSES = [
  "DRIVER_ENROUTE",
  "IN_PROGRESS",
  "COMPLETED",
];

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  ASSIGNED: ["DRIVER_ENROUTE"],
  CONFIRMED: ["DRIVER_ENROUTE"],
  DRIVER_ENROUTE: ["IN_PROGRESS"],
  IN_PROGRESS: ["COMPLETED"],
};

export async function PATCH(request: NextRequest) {
  const auth = await authorizeDriver(request);
  if (!auth.ok) return auth.response;
  try {
    const parsed = StatusSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid status request" }, { status: 400 });
    }
    const { bookingId, newStatus, cashConfirmed } = parsed.data;
    const driverId = auth.actor.id;
    if (!VALID_DRIVER_STATUSES.includes(newStatus)) {
      return NextResponse.json(
        { error: `Invalid driver status: ${newStatus}` },
        { status: 400 }
      );
    }

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: { driver: { omit: { passwordHash: true, authVersion: true } } },
    });

    if (!booking) {
      return NextResponse.json(
        { error: "Booking not found" },
        { status: 404 }
      );
    }

    if (!booking.driverId) {
      return NextResponse.json(
        { error: "Booking has no assigned driver" },
        { status: 400 }
      );
    }

    if (booking.driverId !== driverId) {
      return NextResponse.json(
        { error: "Booking not found" },
        { status: 404 }
      );
    }

    if (["COMPLETED", "CANCELLED", "NO_SHOW"].includes(booking.status)) {
      return NextResponse.json(
        { error: `Booking is already ${booking.status}` },
        { status: 400 }
      );
    }

    const allowed = ALLOWED_TRANSITIONS[booking.status] || [];

    if (!allowed.includes(newStatus)) {
      return NextResponse.json(
        {
          error: `Cannot change from ${booking.status} to ${newStatus}`,
        },
        { status: 400 }
      );
    }

    if (
      newStatus === "IN_PROGRESS" &&
      booking.paymentMethod === "CASH" &&
      !cashConfirmed
    ) {
      return NextResponse.json(
        {
          error:
            "Musíte potvrdiť prijatie hotovosti pred začiatkom jazdy. / You must confirm cash received before starting the ride.",
        },
        { status: 400 }
      );
    }

    const updateData: any = {
      status: newStatus,
    };

    if (newStatus === "DRIVER_ENROUTE") {
      updateData.dispatchStatus = "ACCEPTED";
      updateData.acceptedAt = booking.acceptedAt || new Date();
    }

    if (newStatus === "IN_PROGRESS") {
      updateData.dispatchStatus = "ACCEPTED";
    }

    if (newStatus === "COMPLETED") {
      updateData.dispatchStatus = "ACCEPTED";
    }

    if (cashConfirmed && booking.paymentMethod === "CASH") {
      updateData.cashAgreed = true;
    }

    const updated = await prisma.booking.update({
      where: { id: bookingId },
      data: updateData,
      include: { driver: { omit: { passwordHash: true, authVersion: true } } },
    });

    if (newStatus === "DRIVER_ENROUTE" || newStatus === "IN_PROGRESS") {
      await prisma.driver.update({
        where: { id: driverId },
        data: {
          isOnTrip: true,
        },
      });
    }

    if (newStatus === "COMPLETED") {
      await prisma.driver.update({
        where: { id: driverId },
        data: {
          isOnTrip: false,
        },
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

      await createOrUpdateDriverEarningForBooking(bookingId);
    }

    const statusLabels: Record<string, string> = {
      DRIVER_ENROUTE: "🚗 Driver on the way",
      IN_PROGRESS: "🚕 Ride started",
      COMPLETED: "✅ Ride completed",
    };

    console.log("═══════════════════════════════════════");
    console.log("🚗 DRIVER STATUS UPDATE");
    console.log(`📋 Booking: ${updated.bookingRef}`);
    console.log(`👤 Driver:  ${updated.driver?.fullName || driverId}`);
    console.log(`📊 Status:  ${booking.status} → ${newStatus}`);
    console.log(`🚗 Action:  ${statusLabels[newStatus] || newStatus}`);
    console.log(`💳 Payment: ${booking.paymentMethod}`);

    if (cashConfirmed && booking.paymentMethod === "CASH") {
      console.log("💵 Cash payment confirmed by driver");
    }

    if (newStatus === "COMPLETED") {
      console.log("✅ Driver released: isOnTrip=false");
    }

    console.log("═══════════════════════════════════════");

    return NextResponse.json({
      success: true,
      booking: updated,
    });
  } catch (error) {
    console.error("❌ Driver status update error:", error);
    return NextResponse.json(
      { error: "Failed to update status" },
      { status: 500 }
    );
  }
}
