import { NextRequest, NextResponse } from "next/server";
import { getPaymentSession, verifyWebhookSignature } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { sendPaymentReceipt, sendCustomerConfirmation } from "@/lib/email";

// Processed events store to prevent duplicate processing (use Redis in production)
const processedEvents = new Set<string>();

/**
 * POST /api/payments/webhook - Stripe Webhook Handler
 * Handles payment events from Stripe with signature verification
 */
export async function POST(request: NextRequest) {
  const stripeSignature = request.headers.get("stripe-signature");
  
  try {
    // Get raw body for signature verification
    const rawBody = await request.text();
    
    // Verify webhook signature (CRITICAL for security)
    const { valid, event } = verifyWebhookSignature(rawBody, stripeSignature);
    
    if (!valid || !event) {
      console.error("❌ Invalid webhook signature - request rejected");
      return NextResponse.json(
        { error: "Invalid signature" },
        { status: 400 }
      );
    }

    console.log(`📥 Stripe webhook received: ${event.type}`);

    // Check for duplicate events (idempotency)
    if (processedEvents.has(event.id)) {
      console.log(`⚠️ Duplicate event detected: ${event.id} - skipping`);
      return NextResponse.json({ received: true, duplicate: true }, { status: 200 });
    }

    // Mark event as processed
    processedEvents.add(event.id);

    // Handle the event
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(event.data.object);
        break;

      case "checkout.session.expired":
        await handleCheckoutExpired(event.data.object);
        break;

      case "payment_intent.succeeded":
        await handlePaymentSucceeded(event.data.object);
        break;

      case "payment_intent.payment_failed":
        await handlePaymentFailed(event.data.object);
        break;

      default:
        console.log(`ℹ️ Unhandled Stripe event: ${event.type}`);
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error: any) {
    console.error("❌ Webhook handler error:", error.message);
    return NextResponse.json(
      { error: "Webhook handler failed" },
      { status: 500 }
    );
  }
}

/**
 * Handle successful checkout completion
 */
async function handleCheckoutCompleted(session: any) {
  const bookingId = session.metadata?.bookingId;
  
  if (!bookingId) {
    console.error("❌ No booking ID in session metadata");
    return;
  }

  console.log(`✅ Payment completed for booking: ${bookingId}`);

  // Fetch booking details from database
  try {
    const booking = await prisma.booking.findUnique({
      where: { id: String(bookingId) },
    });

    if (!booking) {
      console.error(`❌ Booking not found: ${bookingId}`);
      return;
    }

    // Update booking status to CONFIRMED
    await prisma.booking.update({
      where: { id: String(bookingId) },
      data: { status: "CONFIRMED" },
    });

    console.log(`📋 Booking ${bookingId} status updated to CONFIRMED`);

    // Send payment receipt
    if (booking.customerEmail) {
      const amount = (session.amount_total || 0) / 100; // Stripe amounts are in cents
      await sendPaymentReceipt({
        bookingRef: booking.bookingRef,
        serviceType: booking.serviceType,
        pickupAddress: booking.pickupAddress,
        dropoffAddress: booking.dropoffAddress,
        scheduledDate: booking.scheduledDate,
        scheduledTime: booking.scheduledTime,
        passengerCount: booking.passengerCount,
        customerName: booking.customerName,
        customerPhone: `${booking.customerPhoneCode}${booking.customerPhone}`,
        customerEmail: booking.customerEmail,
        paymentMethod: booking.paymentMethod,
        wheelchairNeeded: booking.wheelchairNeeded,
        luggageType: booking.luggageType,
        specialNotes: booking.specialNotes,
        amount,
        paymentId: session.payment_intent || session.id,
      });
    }

    // Also send booking confirmation (since card payments skipped it initially)
    if (booking.customerEmail) {
      await sendCustomerConfirmation({
        bookingRef: booking.bookingRef,
        serviceType: booking.serviceType,
        pickupAddress: booking.pickupAddress,
        dropoffAddress: booking.dropoffAddress,
        scheduledDate: booking.scheduledDate,
        scheduledTime: booking.scheduledTime,
        passengerCount: booking.passengerCount,
        customerName: booking.customerName,
        customerPhone: `${booking.customerPhoneCode}${booking.customerPhone}`,
        customerEmail: booking.customerEmail,
        paymentMethod: booking.paymentMethod,
        wheelchairNeeded: booking.wheelchairNeeded,
        luggageType: booking.luggageType,
        specialNotes: booking.specialNotes,
        estimatedPrice: booking.estimatedPrice || undefined,
        distanceKm: booking.distanceKm || undefined,
      });
    }
  } catch (error: any) {
    console.error(`❌ Error processing payment completion for booking ${bookingId}:`, error.message);
  }
}

/**
 * Handle expired checkout
 */
async function handleCheckoutExpired(session: any) {
  const bookingId = session.metadata?.bookingId;
  
  if (!bookingId) return;

  console.log(`⏰ Payment session expired for booking: ${bookingId}`);
}

/**
 * Handle successful payment intent
 */
async function handlePaymentSucceeded(paymentIntent: any) {
  const bookingId = paymentIntent.metadata?.bookingId;
  
  if (!bookingId) return;

  console.log(`✅ Payment intent succeeded for booking: ${bookingId}`);
}

/**
 * Handle failed payment
 */
async function handlePaymentFailed(paymentIntent: any) {
  const bookingId = paymentIntent.metadata?.bookingId;
  
  if (!bookingId) return;

  console.error(`❌ Payment failed for booking: ${bookingId}`);
}

// GET endpoint to verify payment status
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("session_id");

  if (!sessionId) {
    return NextResponse.json(
      { error: "Missing session_id parameter" },
      { status: 400 }
    );
  }

  try {
    const result = await getPaymentSession(sessionId);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      status: result.status,
      amount: result.amount,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
