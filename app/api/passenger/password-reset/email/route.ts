import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createOpaqueToken, createVerificationProof } from "@/lib/passenger-auth";
import { sendPassengerPasswordResetEmail } from "@/lib/email";
import { rateLimits, withRateLimit } from "@/lib/rate-limit";
import { getSourceDomain } from "@/lib/utils";

const Schema = z.object({ email: z.string().trim().email().max(160) });
const generic = { success: true, message: "If an account exists for this email, a password reset link has been sent." };

async function handler(request: NextRequest) {
  try {
    const parsed = Schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json(generic);
    const email = parsed.data.email.toLowerCase();
    const passenger = await prisma.passenger.findFirst({ where: { email, passwordHash: { not: null }, status: "ACTIVE" } });
    if (!passenger) return NextResponse.json(generic);
    const resetAttemptId = createOpaqueToken(16);
    await prisma.passengerVerificationProof.updateMany({ where: { passengerId: passenger.id, purpose: "PASSENGER_PASSWORD_RESET_EMAIL", consumedAt: null }, data: { consumedAt: new Date() } });
    const proof = await createVerificationProof({ passengerId: passenger.id, normalizedPhone: passenger.normalizedPhone || passenger.phone, purpose: "PASSENGER_PASSWORD_RESET_EMAIL", resetAttemptId });
    await sendPassengerPasswordResetEmail({ to: email, resetToken: proof.proofToken, resetAttemptId, expiresAt: proof.expiresAt, sourceDomain: getSourceDomain(request) });
    return NextResponse.json(generic);
  } catch (error) {
    console.error("Password reset email request failed:", error instanceof Error ? error.message : "unknown");
    return NextResponse.json(generic);
  }
}

export const POST = withRateLimit(handler, rateLimits.passengerPasswordResetEmailSend);