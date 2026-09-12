import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { consumeVerificationProofById, createPassengerSession, findVerificationProof, hashSecret, normalizePassengerPhone, publicPassenger, revokePassengerSessions, setPassengerCookie, setTrustedDeviceCookie, validatePassengerPassword } from "@/lib/passenger-auth";
import { rateLimits, withRateLimit } from "@/lib/rate-limit";

const CompleteSchema = z.object({
  // Legacy phone proof is accepted only for backwards-compatible server callers; UI and issuance are email-only.
  phone: z.string().trim().min(6).optional(),
  passwordResetProofToken: z.string().min(20),
  resetAttemptId: z.string().min(10),
  password: z.string().min(1).max(128),
  confirmPassword: z.string().min(1).max(128),
  rememberDevice: z.boolean().optional().default(true),
}).refine((data) => data.password === data.confirmPassword, { path: ["confirmPassword"], message: "Passwords do not match." });

async function handler(request: NextRequest) {
  try {
    const parsed = CompleteSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten().fieldErrors }, { status: 400 });
    const data = parsed.data;
    const passwordError = validatePassengerPassword(data.password);
    if (passwordError) return NextResponse.json({ error: passwordError }, { status: 400 });

    const normalizedPhone = data.phone ? normalizePassengerPhone(data.phone) : "";
    let proof;
    let passenger;
    if (normalizedPhone) {
      passenger = await prisma.passenger.findFirst({ where: { OR: [{ phone: normalizedPhone }, { normalizedPhone }] } });
      proof = passenger ? await findVerificationProof({ proofToken: data.passwordResetProofToken, normalizedPhone, purpose: "PASSENGER_PASSWORD_RESET", passengerId: passenger.id, resetAttemptId: data.resetAttemptId }) : null;
    } else {
      proof = await prisma.passengerVerificationProof.findFirst({ where: { proofTokenHash: hashSecret(data.passwordResetProofToken), purpose: "PASSENGER_PASSWORD_RESET_EMAIL", resetAttemptId: data.resetAttemptId, expiresAt: { gt: new Date() }, consumedAt: null, passengerId: { isSet: true } } });
      passenger = proof?.passengerId ? await prisma.passenger.findUnique({ where: { id: proof.passengerId } }) : null;
    }
    if (!passenger || !proof) return NextResponse.json({ error: "Password reset expired. Please request a new link." }, { status: 400 });
    if (!(await consumeVerificationProofById(proof.id))) return NextResponse.json({ error: "Password reset expired. Please request a new link." }, { status: 400 });

    await revokePassengerSessions(passenger.id);
    await prisma.passengerTrustedDevice.updateMany({ where: { passengerId: passenger.id, revokedAt: null }, data: { revokedAt: new Date() } });
    const updated = await prisma.passenger.update({ where: { id: passenger.id }, data: { passwordHash: await bcrypt.hash(data.password, 12), passwordResetAt: new Date(), lastLoginAt: new Date(), authVersion: { increment: 1 } } });
    const token = await createPassengerSession(updated);
    const response = NextResponse.json({ success: true, passenger: publicPassenger(updated) });
    setPassengerCookie(response, token);
    if (data.rememberDevice) await setTrustedDeviceCookie(request, response, passenger.id);
    console.info("Passenger password reset completed", { passengerIdPresent: Boolean(passenger.id) });
    return response;
  } catch (error) {
    console.error("Password reset complete error", { type: error instanceof Error ? error.name : "unknown" });
    return NextResponse.json({ error: "Password reset could not be completed." }, { status: 500 });
  }
}
export const POST = withRateLimit(handler, rateLimits.passengerPasswordResetComplete);
