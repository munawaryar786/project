import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { sendOTPWithFallback } from "@/lib/twilio";

const OTPSchema = z.object({
  bookingId: z.string().min(1),
  phone: z.string().min(6),
});

/**
 * POST /api/otp/send — Send OTP to verify phone
 * Production: Sends via WhatsApp/SMS using Twilio with fallback
 * Development: Also returns OTP in response for testing
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const parsed = OTPSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { bookingId, phone } = parsed.data;

    // Verify booking exists in database
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
    });

    if (!booking) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }

    // Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Save OTP to database
    await prisma.oTP.create({
      data: {
        code: otp,
        phone,
        bookingId,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
      },
    });

    // Send OTP via WhatsApp/SMS (Production)
    let deliveryResult;
    
    if (process.env.TWILIO_ACCOUNT_SID && process.env.NODE_ENV === "production") {
      // Production: Use Twilio for real OTP delivery
      deliveryResult = await sendOTPWithFallback(phone, otp);
      
      if (!deliveryResult.success) {
        console.error("❌ OTP delivery failed:", deliveryResult.error);
        // Still return success to user (OTP is saved in DB), but log the failure
        // Admin can manually contact user if needed
      }
    } else {
      // Development: Log to console for testing
      console.log("═══════════════════════════════════════");
      console.log("📱 OTP CODE — SAVED TO DATABASE ✅");
      console.log("═══════════════════════════════════════");
      console.log(`📋 Booking:  ${bookingId}`);
      console.log(`📱 Phone:    ${phone}`);
      console.log(`🔢 OTP Code: ${otp}`);
      console.log(`⏰ Expires:  5 minutes`);
      console.log("═══════════════════════════════════════");
      
      deliveryResult = { success: true, method: "console" };
    }

    return NextResponse.json(
      {
        success: true,
        message: "OTP sent successfully",
        method: deliveryResult.method,
        // DEV ONLY — remove in production
        devOtp: process.env.NODE_ENV === "development" ? otp : undefined,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("❌ OTP send error:", error);
    return NextResponse.json(
      { error: "Failed to send OTP. Please try again." },
      { status: 500 }
    );
  }
}