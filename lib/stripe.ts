import Stripe from 'stripe';

// Initialize Stripe client
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

export function getStripeClient(): Stripe | null {
  if (!stripeSecretKey) {
    console.error("❌ Stripe not configured - missing STRIPE_SECRET_KEY");
    return null;
  }
  
  return new Stripe(stripeSecretKey, {
    apiVersion: '2026-04-22.dahlia',
  });
}

export interface PaymentSessionParams {
  amount: number; // Amount in cents (e.g., 1500 = €15.00)
  currency: string;
  bookingId: string;
  bookingRef: string;
  customerEmail: string;
  customerName: string;
  description: string;
}

/**
 * Create a Stripe Checkout Session for booking payment
 */
export async function createPaymentSession(params: PaymentSessionParams) {
  const stripe = getStripeClient();
  
  if (!stripe) {
    throw new Error("Stripe not configured");
  }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      customer_email: params.customerEmail,
      line_items: [
        {
          price_data: {
            currency: params.currency.toLowerCase(),
            product_data: {
              name: 'Drivo Transport Booking',
              description: params.description,
              metadata: {
                bookingId: params.bookingId,
                bookingRef: params.bookingRef,
              },
            },
            unit_amount: params.amount, // Amount in cents
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${baseUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/payment/cancel?booking_id=${params.bookingId}`,
      metadata: {
        bookingId: params.bookingId,
        bookingRef: params.bookingRef,
      },
    });

    return {
      success: true,
      sessionId: session.id,
      sessionUrl: session.url,
    };
  } catch (error: any) {
    console.error("❌ Stripe session creation error:", error.message);
    throw error;
  }
}

/**
 * Retrieve a Stripe Checkout Session
 */
export async function getPaymentSession(sessionId: string) {
  const stripe = getStripeClient();
  
  if (!stripe) {
    throw new Error("Stripe not configured");
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['payment_intent'],
    });

    return {
      success: true,
      session,
      status: session.payment_status,
      amount: session.amount_total,
    };
  } catch (error: any) {
    console.error("❌ Stripe session retrieval error:", error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Create a PaymentIntent for server-side payment processing
 */
export async function createPaymentIntent(params: {
  amount: number;
  currency: string;
  bookingId: string;
  receiptEmail?: string;
}) {
  const stripe = getStripeClient();
  
  if (!stripe) {
    throw new Error("Stripe not configured");
  }

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: params.amount,
      currency: params.currency.toLowerCase(),
      metadata: {
        bookingId: params.bookingId,
      },
      receipt_email: params.receiptEmail,
      automatic_payment_methods: {
        enabled: true,
      },
    });

    return {
      success: true,
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    };
  } catch (error: any) {
    console.error("❌ Stripe payment intent error:", error.message);
    throw error;
  }
}

/**
 * Format amount for Stripe (euros to cents)
 */
export function formatAmountForStripe(amountInEuros: number): number {
  return Math.round(amountInEuros * 100); // Convert euros to cents
}

/**
 * Format amount from Stripe (cents to euros)
 */
export function formatAmountFromStripe(amountInCents: number): number {
  return amountInCents / 100; // Convert cents to euros
}

/**
 * Generate booking description for payment
 */
export function generatePaymentDescription(
  serviceType: string,
  pickup: string,
  dropoff: string,
  passengers: number
): string {
  return `${serviceType} booking: ${pickup} → ${dropoff} (${passengers} passenger(s))`;
}

/**
 * Verify Stripe webhook signature
 * This is CRITICAL for security - prevents forged webhook events
 */
export function verifyWebhookSignature(
  payload: Buffer | string,
  signature: string | null
): { valid: boolean; event: any | null } {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  
  if (!webhookSecret) {
    console.error("❌ STRIPE_WEBHOOK_SECRET not configured");
    return { valid: false, event: null };
  }

  if (!signature) {
    console.error("❌ No stripe-signature header provided");
    return { valid: false, event: null };
  }

  try {
    const stripe = getStripeClient();
    if (!stripe) {
      return { valid: false, event: null };
    }

    // Verify the webhook signature
    const event = stripe.webhooks.constructEvent(
      payload,
      signature,
      webhookSecret
    );

    return { valid: true, event };
  } catch (error: any) {
    console.error("❌ Webhook signature verification failed:", error.message);
    return { valid: false, event: null };
  }
}
