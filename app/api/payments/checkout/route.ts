import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createPaymentSession, formatAmountForStripe, generatePaymentDescription } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";

const CheckoutSchema = z.object({
  bookingId: z.string().min(1),
  amount: z.number().min(0.01),
  currency: z.string().default("EUR"),
});

/**
 * POST /api/payments/checkout - Create Stripe Checkout Session
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const parsed = CheckoutSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { bookingId, amount, currency } = parsed.data;

    // Fetch booking details
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
    });

    if (!booking) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }

    // Create Stripe Checkout Session
    const result = await createPaymentSession({
      amount: formatAmountForStripe(amount),
      currency,
      bookingId,
      bookingRef: booking.bookingRef,
      customerEmail: booking.customerEmail || "",
      customerName: booking.customerName,
      description: `Booking ${booking.bookingRef} - ${booking.serviceType}`,
    });

    return NextResponse.json(
      {
        success: true,
        sessionId: result.sessionId,
        sessionUrl: result.sessionUrl,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("❌ Checkout session error:", error.message);
    return NextResponse.json(
      { error: "Failed to create payment session. Please try again." },
      { status: 500 }
    );
  }
}
