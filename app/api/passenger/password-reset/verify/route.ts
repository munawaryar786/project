import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  createVerificationProof,
  normalizePassengerPhone,
} from "@/lib/passenger-auth";
import { prisma } from "@/lib/prisma";
import { rateLimits, withRateLimit } from "@/lib/rate-limit";

const VerifySchema = z.object({
  phone: z.string().trim().min(6),
  otpCode: z.string().trim().length(6),
  resetAttemptId: z.string().min(10),
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
        purpose: "PASSENGER_PASSWORD_RESET",
        resetAttemptId: parsed.data.resetAttemptId,
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

    const proof = await createVerificationProof({
      passengerId: passenger.id,
      normalizedPhone,
      purpose: "PASSENGER_PASSWORD_RESET",
      resetAttemptId: parsed.data.resetAttemptId,
    });

    return NextResponse.json({
      success: true,
      proofToken: proof.proofToken,
      expiresAt: proof.expiresAt.toISOString(),
    });
  } catch (error) {
    console.error("Password reset verify error:", error);
    return NextResponse.json({ error: "Could not verify reset code." }, { status: 500 });
  }
}

export const POST = withRateLimit(handler, rateLimits.passengerPasswordReset);
