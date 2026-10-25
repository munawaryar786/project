import { NextRequest, NextResponse } from "next/server";
import { authorizePassenger, normalizePassengerPhone } from "@/lib/passenger-auth";
import { prisma } from "@/lib/prisma";
import { bindPublicBookingOwner, publicBookingAccess, validBookingId } from "@/lib/booking-access";
import { startAutomaticDispatch } from "@/lib/automatic-dispatch";
import { isScheduledBooking } from "@/lib/scheduled-marketplace";
import { writeBookingActivationIntent } from "@/lib/booking-activation";

export async function POST(request: NextRequest) {
  const auth = await authorizePassenger(request);
  if (!auth.ok) return auth.response;
  const body = await request.json().catch(() => null);
  const bookingId = typeof body?.bookingId === "string" ? body.bookingId : "";
  if (!validBookingId(bookingId)) return NextResponse.json({ error: "Invalid booking ID" }, { status: 400 });
  try {
    const result = await prisma.$transaction(async tx => {
      const booking = await tx.booking.findUnique({ where: { id: bookingId } });
      if (!booking || !(await publicBookingAccess(request, booking, auth.actor.id, tx)).allowed) throw new Error("BOOKING_ACCESS_DENIED");
      const alreadyContinued = booking.passengerId === auth.actor.id && booking.passengerAuthStatus === "AUTHENTICATED";
      if (!alreadyContinued) {
        const passengerPhone = normalizePassengerPhone(auth.actor.normalizedPhone || auth.actor.phone);
        const bookingPhone = booking.normalizedPhone || normalizePassengerPhone(`${booking.customerPhoneCode}${booking.customerPhone}`);
        if (!auth.actor.phoneVerified || passengerPhone !== bookingPhone) throw new Error("BOOKING_ACCESS_DENIED");
        await bindPublicBookingOwner(tx, request, booking, auth.actor.id);
      }
      if (booking.paymentMethod === "CASH") await writeBookingActivationIntent(tx, bookingId);
      return { booking: await tx.booking.findUniqueOrThrow({ where: { id: bookingId } }), alreadyContinued };
    });
    // Authentication flags are not evidence that dispatch started. The existing
    // dispatch CAS guards repeats; scheduled bookings stay in their marketplace.
    if (result.booking.paymentMethod === "CASH" && !isScheduledBooking(result.booking) && result.booking.dispatchStatus === "NOT_STARTED") {
      try { await startAutomaticDispatch(bookingId); }
      catch { console.error("[passenger.booking.continue.dispatch-deferred]", { code: "DISPATCH_START_DEFERRED" }); }
    }
    return NextResponse.json({ success: true, ...result }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const denied = error instanceof Error && ["BOOKING_ACCESS_DENIED", "BOOKING_ACCESS_CONFLICT"].includes(error.message);
    console.error("[passenger.booking.continue.failed]", { code: denied ? "BOOKING_ACCESS_DENIED" : "BOOKING_CONTINUE_FAILED" });
    return NextResponse.json({ error: denied ? "Booking unavailable. Sign in to the owning account or contact Drivo support." : "Could not continue booking. Please try again.", code: denied ? "BOOKING_ACCESS_DENIED" : "BOOKING_CONTINUE_FAILED" }, { status: denied ? 404 : 503 });
  }
}
