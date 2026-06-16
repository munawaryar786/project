import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import {
  createOpaqueToken,
  createPassengerSession,
  normalizePassengerPhone,
  publicPassenger,
  setPassengerCookie,
  verifyTrustedDevice,
} from "@/lib/passenger-auth";
import { prisma } from "@/lib/prisma";
import { rateLimits, withRateLimit } from "@/lib/rate-limit";
import { sendOTPWithFallback } from "@/lib/twilio";

const PasswordLoginSchema = z.object({
  phone: z.string().trim().min(6),
  password: z.string().min(1),
  bookingId: z.string().optional().nullable(),
});

async function handler(request: NextRequest) {
  try {
    const parsed = PasswordLoginSchema.safeParse(await request.json());
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

    const genericError = { error: "Phone number or password is incorrect." };
    if (!passenger?.passwordHash || passenger.status !== "ACTIVE") {
      return NextResponse.json(genericError, { status: 401 });
    }

    const validPassword = await bcrypt.compare(parsed.data.password, passenger.passwordHash);
    if (!validPassword) {
      return NextResponse.json(genericError, { status: 401 });
    }

    const trusted = await verifyTrustedDevice(request, passenger.id);
    if (!trusted) {
      const loginAttemptId = createOpaqueToken(16);
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      await prisma.passengerOtp.deleteMany({
        where: {
          passengerId: passenger.id,
          purpose: "PASSENGER_LOGIN_STEP_UP",
          used: false,
        },
      });
      await prisma.passengerOtp.create({
        data: {
          passengerId: passenger.id,
          phone: normalizedPhone,
          code: otp,
          purpose: "PASSENGER_LOGIN_STEP_UP",
          loginAttemptId,
          expiresAt: new Date(Date.now() + 5 * 60 * 1000),
        },
      });

      if (process.env.TWILIO_ACCOUNT_SID && process.env.NODE_ENV === "production") {
        const deliveryResult = await sendOTPWithFallback(normalizedPhone, otp);
        if (!deliveryResult.success) {
          console.error("Passenger login step-up OTP delivery failed:", deliveryResult.error);
        }
      } else if (process.env.NODE_ENV !== "production") {
        console.log(`Passenger login step-up OTP for ${passenger.id}: ${otp}`);
      }

      return NextResponse.json({
        success: true,
        stepUpRequired: true,
        loginAttemptId,
        devOtp: process.env.NODE_ENV === "development" ? otp : undefined,
        message: "We need to verify this login. A code has been sent to your phone.",
      });
    }

    const token = await createPassengerSession(passenger);
    const response = NextResponse.json({
      success: true,
      stepUpRequired: false,
      passenger: publicPassenger(passenger),
    });
    setPassengerCookie(response, token);

    await prisma.passenger.update({
      where: { id: passenger.id },
      data: { lastLoginAt: new Date(), normalizedPhone },
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

    console.log(`Passenger login success: ${passenger.id}`);
    return response;
  } catch (error) {
    console.error("Passenger password login error:", error);
    return NextResponse.json({ error: "Login failed." }, { status: 500 });
  }
}

export const POST = withRateLimit(handler, rateLimits.auth);
