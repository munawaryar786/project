import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPaymentSession } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { authorizePassenger } from "@/lib/passenger-auth";
import { hasAuthoritativeBookingPrice } from "@/lib/security/booking-price";

const VerifySchema = z.object({ sessionId: z.string().min(8).max(255) }).strict();

export async function POST(request: NextRequest) {
  const auth = await authorizePassenger(request);
  if (!auth.ok) return auth.response;
  try {
    const parsed = VerifySchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

    const result = await getPaymentSession(parsed.data.sessionId);
    if (!result.success || !result.session) {
      return NextResponse.json({ error: "Payment session could not be verified" }, { status: 400 });
    }

    const bookingId = result.session.metadata?.bookingId;
    if (!bookingId) return NextResponse.json({ error: "Payment session is invalid" }, { status: 400 });
    const booking = await prisma.booking.findFirst({
      where: { id: bookingId, passengerId: auth.actor.id },
      select: { id: true, bookingRef: true, estimatedPrice: true, fareBreakdown: true, paymentMethod: true },
    });
    if (!booking || result.session.metadata?.bookingRef !== booking.bookingRef) {
      return NextResponse.json({ error: "Payment session not found" }, { status: 404 });
    }
    const expected = booking.estimatedPrice ? Math.round(booking.estimatedPrice * 100) : null;
    if (booking.paymentMethod !== "CARD" || !hasAuthoritativeBookingPrice(booking) ||
      expected === null || result.session.amount_total !== expected || result.session.currency !== "eur") {
      return NextResponse.json({ error: "Payment session amount mismatch" }, { status: 409 });
    }

    return NextResponse.json({
      success: result.status === "paid",
      paymentStatus: result.status,
      message: result.status === "paid" ? "Payment verified successfully" : "Payment not yet completed",
    });
  } catch {
    return NextResponse.json({ error: "Payment verification failed" }, { status: 500 });
  }
}
