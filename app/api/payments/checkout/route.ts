import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createPaymentSession, formatAmountForStripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { authorizePassenger } from "@/lib/passenger-auth";
import { hasAuthoritativeBookingPrice } from "@/lib/security/booking-price";

const CheckoutSchema = z.object({
  bookingId: z.string().regex(/^[a-f0-9]{24}$/i),
  currency: z.literal("EUR").default("EUR"),
  amount: z.number().optional(),
}).strict();

export async function POST(request: NextRequest) {
  const auth = await authorizePassenger(request);
  if (!auth.ok) return auth.response;
  try {
    const parsed = CheckoutSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

    const booking = await prisma.booking.findFirst({
      where: { id: parsed.data.bookingId, passengerId: auth.actor.id },
    });
    if (!booking) return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    if (booking.paymentMethod !== "CARD") {
      return NextResponse.json({ error: "Booking is not configured for card payment" }, { status: 409 });
    }
    if (booking.status !== "PENDING") {
      return NextResponse.json({ error: "Booking is not awaiting payment" }, { status: 409 });
    }
    if (!hasAuthoritativeBookingPrice(booking)) {
      return NextResponse.json({ error: "Booking price requires review before payment" }, { status: 409 });
    }

    const result = await createPaymentSession({
      amount: formatAmountForStripe(booking.estimatedPrice!),
      currency: "EUR",
      bookingId: booking.id,
      bookingRef: booking.bookingRef,
      customerEmail: booking.customerEmail || "",
      customerName: booking.customerName,
      description: `Booking ${booking.bookingRef} - ${booking.serviceType}`,
    });

    return NextResponse.json({
      success: true,
      sessionId: result.sessionId,
      sessionUrl: result.sessionUrl,
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to create payment session. Please try again." },
      { status: 500 }
    );
  }
}
