import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  createPassengerSession,
  normalizePassengerPhone,
  publicPassenger,
  setPassengerCookie,
  setTrustedDeviceCookie,
} from "@/lib/passenger-auth";
import { prisma } from "@/lib/prisma";
import { rateLimits, withRateLimit } from "@/lib/rate-limit";

const VerifySchema = z.object({
  phone: z.string().trim().min(6),
  otpCode: z.string().trim().length(6),
  loginAttemptId: z.string().min(10),
  bookingId: z.string().optional().nullable(),
  rememberDevice: z.boolean().optional().default(true),
});

async function handler(request: NextRequest) {
  try {
    const parsed = VerifySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const normalizedPhone = normalizePassengerPhone(parsed.data.phone);
    const passenger = await prisma.passenger.findFirst({
      where: { OR: [{ phone: normalizedPhone }, { normalizedPhone }] },
    });
    if (!passenger?.passwordHash) {
      return NextResponse.json({ error: "Invalid or expired verification code" }, { status: 400 });
    }

    const otp = await prisma.passengerOtp.findFirst({
      where: {
        passengerId: passenger.id,
        phone: normalizedPhone,
        purpose: "PASSENGER_LOGIN_STEP_UP",
        loginAttemptId: parsed.data.loginAttemptId,
        expiresAt: { gte: new Date() },
        used: false,
      },
      orderBy: { createdAt: "desc" },
    });

    if (!otp || otp.code !== parsed.data.otpCode || otp.attempts >= otp.maxAttempts) {
      if (otp) {
        await prisma.passengerOtp.update({
          where: { id: otp.id },
          data: { attempts: { increment: 1 } },
        });
      }
      return NextResponse.json({ error: "Invalid or expired verification code" }, { status: 400 });
    }

    await prisma.passengerOtp.update({
      where: { id: otp.id },
      data: { used: true },
    });

    const updated = await prisma.passenger.update({
      where: { id: passenger.id },
      data: { phoneVerified: true, phoneVerifiedAt: new Date(), lastLoginAt: new Date() },
    });

    if (parsed.data.bookingId) {
      await prisma.booking.updateMany({
        where: { id: parsed.data.bookingId, normalizedPhone },
        data: {
          passengerId: passenger.id,
          passengerAuthStatus: "AUTHENTICATED",
          passengerAuthCompletedAt: new Date(),
          phoneVerified: true,
        },
      });
    }

    const token = await createPassengerSession(updated);
    const response = NextResponse.json({
      success: true,
      passenger: publicPassenger(updated),
    });
    setPassengerCookie(response, token);
    if (parsed.data.rememberDevice) {
      await setTrustedDeviceCookie(request, response, passenger.id);
    }

    console.log(`Passenger step-up login success: ${passenger.id}`);
    return response;
  } catch (error) {
    console.error("Passenger login OTP verify error:", error);
    return NextResponse.json({ error: "Could not verify login." }, { status: 500 });
  }
}

export const POST = withRateLimit(handler, rateLimits.passengerLoginStepUpOtpVerify);
