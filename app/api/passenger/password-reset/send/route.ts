import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createOpaqueToken, normalizePassengerPhone } from "@/lib/passenger-auth";
import { prisma } from "@/lib/prisma";
import { rateLimits, withRateLimit } from "@/lib/rate-limit";
import { sendOTPWithFallback } from "@/lib/twilio";

const SendSchema = z.object({
  phone: z.string().trim().min(6),
});

async function handler(request: NextRequest) {
  const generic = {
    success: true,
    message: "If an account exists for this phone number, a verification code has been sent.",
  };

  try {
    const parsed = SendSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json(generic);

    const normalizedPhone = normalizePassengerPhone(parsed.data.phone);
    const passenger = await prisma.passenger.findFirst({
      where: { OR: [{ phone: normalizedPhone }, { normalizedPhone }] },
    });

    if (!passenger?.passwordHash) return NextResponse.json(generic);

    const resetAttemptId = createOpaqueToken(16);
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    await prisma.passengerOtp.updateMany({
      where: {
        passengerId: passenger.id,
        purpose: "PASSENGER_PASSWORD_RESET",
        used: false,
      },
      data: { used: true },
    });

    await prisma.passengerVerificationProof.updateMany({
      where: {
        passengerId: passenger.id,
        normalizedPhone,
        purpose: "PASSENGER_PASSWORD_RESET",
        consumedAt: null,
      },
      data: { consumedAt: new Date() },
    });

    await prisma.passengerOtp.create({
      data: {
        passengerId: passenger.id,
        phone: normalizedPhone,
        code: otp,
        purpose: "PASSENGER_PASSWORD_RESET",
        resetAttemptId,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      },
    });

    if (process.env.TWILIO_ACCOUNT_SID && process.env.NODE_ENV === "production") {
      const deliveryResult = await sendOTPWithFallback(normalizedPhone, otp);
      if (!deliveryResult.success) {
        console.error("Passenger password reset OTP delivery failed:", deliveryResult.error);
      }
    }

    return NextResponse.json({
      ...generic,
      resetAttemptId,
    });
  } catch (error) {
    console.error("Password reset send error:", error);
    return NextResponse.json(generic);
  }
}

export const POST = withRateLimit(handler, rateLimits.passengerPasswordResetOtpSend);
