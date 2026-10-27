import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authorizePassenger } from "@/lib/passenger-auth";
import { hasAuthoritativeBookingPrice } from "@/lib/security/booking-price";
import { createOrReusePaymentCheckout } from "@/lib/payment-checkout";
import { isLiveStripeCheckoutEnabled } from "@/lib/stripe";

const CheckoutSchema = z.object({
  bookingId: z.string().regex(/^[a-f0-9]{24}$/i),
  currency: z.literal("EUR").default("EUR"),
  amount: z.number().optional(),
  requestKey: z.string().uuid().optional(),
}).strict();

const NO_STORE = { headers: { "Cache-Control": "private, no-store" } };

export async function POST(request: NextRequest) {
  const auth = await authorizePassenger(request);
  if (!auth.ok) return auth.response;
  if (!isLiveStripeCheckoutEnabled()) return NextResponse.json({
    success: false, paymentStatus: "UNAVAILABLE", code: "CARD_CHECKOUT_UNAVAILABLE",
  }, { status: 503, ...NO_STORE });
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

    const result = await createOrReusePaymentCheckout({
      bookingId: booking.id, actorId: auth.actor.id, channel: "PUBLIC",
      requestKey: parsed.data.requestKey,
    });
    if (result.state === "READY") return NextResponse.json({
      success: true, sessionId: result.sessionId, sessionUrl: result.sessionUrl, reused: result.reused,
    }, NO_STORE);
    if (result.state === "PROCESSING") return NextResponse.json({
      success: false, paymentStatus: "PROCESSING",
    }, { status: 202, ...NO_STORE });
    return NextResponse.json({
      success: false, paymentStatus: result.state,
      error: result.state === "RECONCILIATION_REQUIRED" || result.state === "LEGACY_ACTIVE"
        ? "Payment state requires review before another checkout"
        : "Payment session is not available",
    }, { status: 409, ...NO_STORE });
  } catch {
    return NextResponse.json(
      { error: "Payment checkout is temporarily unavailable" },
      { status: 503, ...NO_STORE }
    );
  }
}
