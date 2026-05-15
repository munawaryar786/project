import { NextRequest, NextResponse } from "next/server";
import { getPaymentSession } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/payments/verify - Verify payment status after redirect
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId, bookingId } = body;

    if (!sessionId || !bookingId) {
      return NextResponse.json(
        { error: "Missing sessionId or bookingId" },
        { status: 400 }
      );
    }

    // Get payment session from Stripe
    const result = await getPaymentSession(sessionId);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 400 }
      );
    }

    // Note: Payment status will be tracked via Stripe webhook
    // For now, just return the payment status
    if (result.status === "paid") {
      return NextResponse.json({
        success: true,
        paymentStatus: "PAID",
        message: "Payment verified successfully",
      });
    }

    return NextResponse.json({
      success: false,
      paymentStatus: result.status,
      message: "Payment not yet completed",
    });
  } catch (error: any) {
    console.error("❌ Payment verification error:", error.message);
    return NextResponse.json(
      { error: "Payment verification failed" },
      { status: 500 }
    );
  }
}
