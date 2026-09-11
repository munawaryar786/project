import { NextRequest, NextResponse } from "next/server";
import { bookingToEmailData, sendBookingCompletionEmails } from "@/lib/email";
import {
  authorizePassenger,
  normalizePassengerPhone,
} from "@/lib/passenger-auth";
import { prisma } from "@/lib/prisma";
import { csrfCookieName } from "@/lib/security/session";
import { getConfiguredOrigin } from "@/lib/env";

export async function POST(request: NextRequest) {
  try {
    const auth = await authorizePassenger(request);
    if (!auth.ok) return auth.response;
    const passenger = auth.actor;

    const body = await request.json();
    const bookingId = String(body.bookingId || "");
    if (!bookingId) {
      return NextResponse.json({ error: "bookingId is required" }, { status: 400 });
    }

    const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }

    const bookingPhone =
      booking.normalizedPhone ||
      normalizePassengerPhone(`${booking.customerPhoneCode}${booking.customerPhone}`);
    const passengerPhone = normalizePassengerPhone(passenger.normalizedPhone || passenger.phone);

    if (bookingPhone !== passengerPhone) {
      return NextResponse.json({ error: "Booking does not belong to this passenger" }, { status: 403 });
    }

    const alreadyContinued =
      booking.passengerAuthStatus === "AUTHENTICATED" && booking.passengerAuthCompletedAt;

    const updated = await prisma.booking.update({
      where: { id: bookingId },
      data: {
        passengerId: passenger.id,
        phoneVerified: true,
        normalizedPhone: bookingPhone,
        passengerAuthStatus: "AUTHENTICATED",
        passengerAuthCompletedAt: booking.passengerAuthCompletedAt || new Date(),
      },
    });

    if (!alreadyContinued && updated.paymentMethod !== "CARD") {
      await sendBookingCompletionEmails(bookingToEmailData(updated));

      try {
        await fetch(`${getConfiguredOrigin()}/api/dispatch/start`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Origin": getConfiguredOrigin(),
            "Cookie": request.headers.get("cookie") || "",
            "X-Drivo-CSRF": request.cookies.get(csrfCookieName("PASSENGER"))?.value || "",
          },
          body: JSON.stringify({ bookingId }),
        });
      } catch (error) {
        console.error("Post-auth dispatch start failed:", error);
      }
    }

    return NextResponse.json({
      success: true,
      booking: updated,
      alreadyContinued: Boolean(alreadyContinued),
    });
  } catch (error) {
    console.error("Passenger booking continue error:", error);
    return NextResponse.json(
      { error: "Could not continue booking. Please try again." },
      { status: 500 }
    );
  }
}
