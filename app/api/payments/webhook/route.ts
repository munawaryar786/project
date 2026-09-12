import { NextRequest, NextResponse } from "next/server";
import { verifyWebhookSignature } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { startAutomaticDispatch } from "@/lib/automatic-dispatch";
import { hasAuthoritativeBookingPrice } from "@/lib/security/booking-price";
import {
  bookingToEmailData,
  sendBookingCompletionEmails,
  sendPaymentReceipt,
} from "@/lib/email";

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const { valid, event } = verifyWebhookSignature(
      rawBody,
      request.headers.get("stripe-signature")
    );
    if (!valid || !event) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }
    const updatedBooking = event.type === "checkout.session.completed"
      ? await handleCheckoutCompleted(event.data.object)
      : null;
    const dispatch = updatedBooking && !updatedBooking.scheduledRide ? await startAutomaticDispatch(updatedBooking.id) : null;
    if (dispatch && !dispatch.ok) console.warn("[dispatch] payment-confirmed start deferred", { bookingId: updatedBooking.id, code: dispatch.code });
    return NextResponse.json({ received: true });
  } catch {
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }
}

async function handleCheckoutCompleted(session: any): Promise<any | null> {
  const bookingId = session.metadata?.bookingId;
  const bookingRef = session.metadata?.bookingRef;
  if (!bookingId || !bookingRef || session.payment_status !== "paid") {
    throw new Error("Invalid completed checkout metadata");
  }

  const booking = await prisma.booking.findUnique({ where: { id: String(bookingId) } });
  if (!booking || booking.bookingRef !== bookingRef || booking.paymentMethod !== "CARD") {
    throw new Error("Checkout booking binding failed");
  }
  const expectedAmount = booking.estimatedPrice ? Math.round(booking.estimatedPrice * 100) : null;
  if (!hasAuthoritativeBookingPrice(booking) || expectedAmount === null ||
    session.amount_total !== expectedAmount || session.currency !== "eur") {
    throw new Error("Checkout amount or currency mismatch");
  }

  const updated = await prisma.booking.updateMany({
    where: {
      id: booking.id,
      status: "PENDING",
    },
    data: { status: "CONFIRMED" },
  });
  if (updated.count === 0) return null;

  const confirmedBooking = await prisma.booking.findUnique({ where: { id: booking.id } });
  if (!confirmedBooking) return null;
  if (confirmedBooking.customerEmail) {
    await sendPaymentReceipt({
      ...bookingToEmailData(confirmedBooking),
      amount: expectedAmount / 100,
      paymentId: session.payment_intent || session.id,
    });
  }
  await sendBookingCompletionEmails(bookingToEmailData(confirmedBooking));
  return confirmedBooking;
}
