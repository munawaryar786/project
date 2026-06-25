import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { sendOTPWithFallback } from "@/lib/twilio";
import type { OTPDeliveryResult } from "@/lib/twilio";
import { normalizePassengerPhone } from "@/lib/passenger-auth";
import { rateLimits, withRateLimit } from "@/lib/rate-limit";

const OTPSchema = z.object({
  bookingId: z.string().min(1),
  phone: z.string().min(6),
});

async function handler(request: NextRequest) {
  try {
    const parsed = OTPSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { bookingId } = parsed.data;
    const normalizedPhone = normalizePassengerPhone(parsed.data.phone);

    const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }

    if (booking.normalizedPhone && booking.normalizedPhone !== normalizedPhone) {
      return NextResponse.json({ error: "Phone number does not match booking" }, { status: 400 });
    }

    await prisma.oTP.updateMany({
      where: {
        bookingId,
        phone: normalizedPhone,
        purpose: "PASSENGER_REGISTRATION",
        used: false,
      },
      data: { used: true },
    });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    await prisma.oTP.create({
      data: {
        code: otp,
        phone: normalizedPhone,
        purpose: "PASSENGER_REGISTRATION",
        bookingId,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      },
    });

    let deliveryResult: OTPDeliveryResult = { success: true, method: "console" };
    if (process.env.TWILIO_ACCOUNT_SID && process.env.NODE_ENV === "production") {
      deliveryResult = await sendOTPWithFallback(normalizedPhone, otp);
      if (!deliveryResult.success) {
        console.error("Passenger registration OTP delivery failed:", deliveryResult.error);
      }
    }

    await prisma.booking.update({
      where: { id: bookingId },
      data: {
        normalizedPhone,
        passengerAuthStatus: "PENDING_PHONE_VERIFICATION",
      },
    });

    return NextResponse.json({
      success: true,
      message: "A new verification code has been sent.",
      method: deliveryResult.method,
    });
  } catch (error) {
    console.error("OTP send error:", error);
    return NextResponse.json(
      { error: "Failed to send OTP. Please try again." },
      { status: 500 }
    );
  }
}

export const POST = withRateLimit(handler, rateLimits.passengerRegistrationOtpSend);
