import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createOpaqueToken, createVerificationProof, normalizePassengerEmail } from "@/lib/passenger-auth";
import { sendPassengerPasswordResetEmail } from "@/lib/email";
import { authRateLimitResponse, enforceAuthRateLimit, rateLimits, resolveClientIp } from "@/lib/rate-limit";
import { getSourceDomain } from "@/lib/utils";
import { isUiLocale, resolveServerLocale } from "@/lib/i18n/locale-resolution";

const Schema = z.object({ email: z.string().trim().email().max(160), locale: z.unknown().optional() });
const generic = { success: true, message: "If an account exists for this email, a password reset link has been sent." };

async function handler(request: NextRequest) {
  try {
    const parsed = Schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json(generic);
    const email = normalizePassengerEmail(parsed.data.email);
    const locale = isUiLocale(parsed.data.locale) ? parsed.data.locale : resolveServerLocale({
      cookie: request.cookies.get("drivo-language")?.value,
      acceptLanguage: request.headers.get("accept-language"),
    });
    const distributedLimit = await enforceAuthRateLimit({
      domain: "password-reset",
      identities: [
        { dimension: "ip", value: resolveClientIp(request), max: rateLimits.passengerPasswordResetEmailSend.max, windowMs: rateLimits.passengerPasswordResetEmailSend.windowMs },
        { dimension: "email", value: email, max: rateLimits.passengerPasswordResetEmailSend.max, windowMs: rateLimits.passengerPasswordResetEmailSend.windowMs },
      ],
    });
    if (!distributedLimit.allowed) return authRateLimitResponse(distributedLimit, "Too many password reset attempts. Please try again later.");
    const passenger = await prisma.passenger.findFirst({ where: { email: { equals: email, mode: "insensitive" }, passwordHash: { not: null }, status: "ACTIVE" } });
    if (!passenger) return NextResponse.json(generic);
    const resetAttemptId = createOpaqueToken(16);
    await prisma.passengerVerificationProof.updateMany({ where: { passengerId: passenger.id, purpose: "PASSENGER_PASSWORD_RESET_EMAIL", consumedAt: null }, data: { consumedAt: new Date() } });
    const proof = await createVerificationProof({ passengerId: passenger.id, normalizedPhone: passenger.normalizedPhone || passenger.phone, purpose: "PASSENGER_PASSWORD_RESET_EMAIL", resetAttemptId });
    await sendPassengerPasswordResetEmail({ to: email, resetToken: proof.proofToken, resetAttemptId, expiresAt: proof.expiresAt, sourceDomain: getSourceDomain(request), language: locale });
    return NextResponse.json(generic);
  } catch (error) {
    console.error("[email.password-reset.failed]", { code: "EMAIL_REQUEST_FAILED" });
    return NextResponse.json(generic);
  }
}

export const runtime = "nodejs";
export const POST = handler;
