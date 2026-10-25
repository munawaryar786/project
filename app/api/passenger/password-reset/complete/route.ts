import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { finishGuestOperationTransition } from "@/lib/public-booking-operation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createPassengerSession, hashSecret, normalizePassengerPhone, publicPassenger, setPassengerCookie, setTrustedDeviceCookie, validatePassengerPassword } from "@/lib/passenger-auth";
import { rateLimits, withDistributedIpRateLimit } from "@/lib/rate-limit";

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
    if (!parsed.success) return NextResponse.json({ error: "Validation failed", code: "PASSWORD_RESET_VALIDATION_FAILED", details: parsed.error.flatten().fieldErrors }, { status: 400 });
    const data = parsed.data;
    const passwordError = validatePassengerPassword(data.password);
    if (passwordError) return NextResponse.json({ error: passwordError, code: "PASSWORD_RESET_VALIDATION_FAILED" }, { status: 400 });

    const normalizedPhone = data.phone ? normalizePassengerPhone(data.phone) : "";
    const passwordHash = await bcrypt.hash(data.password, 12);
    const proofTokenHash = hashSecret(data.passwordResetProofToken);
    const completed = await prisma.$transaction(async tx => {
      const now = new Date();
      const purpose = normalizedPhone ? "PASSENGER_PASSWORD_RESET" : "PASSENGER_PASSWORD_RESET_EMAIL";
      const proof = await tx.passengerVerificationProof.findFirst({ where: {
        proofTokenHash, purpose, resetAttemptId: data.resetAttemptId,
        expiresAt: { gt: now }, consumedAt: null, passengerId: { isSet: true },
        ...(normalizedPhone ? { normalizedPhone } : {}),
      } });
      if (!proof?.passengerId) return null;
      const passenger = await tx.passenger.findUnique({ where: { id: proof.passengerId } });
      if (!passenger || passenger.status !== "ACTIVE" ||
          (normalizedPhone && normalizedPhone !== (passenger.normalizedPhone || normalizePassengerPhone(passenger.phone)))) return null;
      const consumed = await tx.passengerVerificationProof.updateMany({ where: {
        id: proof.id, proofTokenHash, purpose, resetAttemptId: data.resetAttemptId,
        expiresAt: { gt: now }, consumedAt: null,
      }, data: { consumedAt: now } });
      if (consumed.count !== 1) return null;
      await tx.passengerSession.updateMany({ where: { passengerId: passenger.id, OR: [{ revokedAt: null }, { revokedAt: { isSet: false } }] }, data: { revokedAt: now } });
      await tx.passengerTrustedDevice.updateMany({ where: { passengerId: passenger.id, OR: [{ revokedAt: null }, { revokedAt: { isSet: false } }] }, data: { revokedAt: now } });
      const updated = await tx.passenger.update({ where: { id: passenger.id }, data: { passwordHash, passwordResetAt: now, lastLoginAt: now, authVersion: { increment: 1 } } });
      const token = await createPassengerSession(updated, tx);
      return { updated, token };
    });
    if (!completed) return NextResponse.json({ error: "Password reset expired. Please request a new link.", code: "PASSWORD_RESET_EXPIRED" }, { status: 400 });
    const response = NextResponse.json({ success: true, passenger: publicPassenger(completed.updated) });
    setPassengerCookie(response, completed.token);
    if (data.rememberDevice) {
      try { await setTrustedDeviceCookie(request, response, completed.updated.id); }
      catch { console.error("[passenger.trusted-device.deferred]", { code: "TRUSTED_DEVICE_UNAVAILABLE" }); }
    }
    console.info("Passenger password reset completed", { passengerIdPresent: true });
    return finishGuestOperationTransition(request, response);
  } catch (error) {
    console.error("Password reset complete error", { type: error instanceof Error ? error.name : "unknown" });
    return NextResponse.json({ error: "Password reset could not be completed.", code: "SERVICE_UNAVAILABLE" }, { status: 500 });
  }
}
export const runtime = "nodejs";
export const POST = withDistributedIpRateLimit(handler, { domain: "password-reset-complete", max: rateLimits.passengerPasswordResetComplete.max, windowMs: rateLimits.passengerPasswordResetComplete.windowMs, message: rateLimits.passengerPasswordResetComplete.message });
