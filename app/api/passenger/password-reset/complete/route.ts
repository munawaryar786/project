import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import {
  consumeVerificationProof,
  createPassengerSession,
  normalizePassengerPhone,
  publicPassenger,
  revokePassengerSessions,
  setPassengerCookie,
  setTrustedDeviceCookie,
  validatePassengerPassword,
} from "@/lib/passenger-auth";
import { prisma } from "@/lib/prisma";
import { rateLimits, withRateLimit } from "@/lib/rate-limit";

const CompleteSchema = z
  .object({
    phone: z.string().trim().min(6),
    proofToken: z.string().min(20),
    resetAttemptId: z.string().min(10),
    bookingId: z.string().optional().nullable(),
    password: z.string().min(1).max(128),
    confirmPassword: z.string().min(1).max(128),
    rememberDevice: z.boolean().optional().default(true),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match.",
  });

async function handler(request: NextRequest) {
  try {
    const parsed = CompleteSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const data = parsed.data;
    const passwordError = validatePassengerPassword(data.password);
    if (passwordError) return NextResponse.json({ error: passwordError }, { status: 400 });

    const normalizedPhone = normalizePassengerPhone(data.phone);
    const passenger = await prisma.passenger.findFirst({
      where: { OR: [{ phone: normalizedPhone }, { normalizedPhone }] },
    });
    if (!passenger) {
      return NextResponse.json({ error: "Password reset could not be completed." }, { status: 400 });
    }

    const proof = await consumeVerificationProof({
      proofToken: data.proofToken,
      normalizedPhone,
      purpose: "PASSENGER_PASSWORD_RESET",
      passengerId: passenger.id,
      resetAttemptId: data.resetAttemptId,
    });
    if (!proof) {
      return NextResponse.json({ error: "Password reset expired. Please try again." }, { status: 400 });
    }

    await revokePassengerSessions(passenger.id);
    await prisma.passengerTrustedDevice.updateMany({
      where: { passengerId: passenger.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    const updated = await prisma.passenger.update({
      where: { id: passenger.id },
      data: {
        passwordHash: await bcrypt.hash(data.password, 12),
        phoneVerified: true,
        phoneVerifiedAt: passenger.phoneVerifiedAt || new Date(),
        passwordResetAt: new Date(),
        lastLoginAt: new Date(),
        normalizedPhone,
        phone: normalizedPhone,
      },
    });

    if (data.bookingId) {
      await prisma.booking.updateMany({
        where: { id: data.bookingId, normalizedPhone },
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
    if (data.rememberDevice) {
      await setTrustedDeviceCookie(request, response, passenger.id);
    }

    console.log(`Passenger password reset completed: ${passenger.id}`);
    return response;
  } catch (error) {
    console.error("Password reset complete error:", error);
    return NextResponse.json(
      { error: "Password reset could not be completed." },
      { status: 500 }
    );
  }
}

export const POST = withRateLimit(handler, rateLimits.passengerPasswordReset);
