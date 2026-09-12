import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { checkWhatsAppVerification } from "@/lib/twilio";
import { createVerificationProof, isValidE164Phone, normalizePassengerPhone } from "@/lib/passenger-auth";
import { authRateLimitResponse, enforceAuthRateLimit, rateLimits, resolveClientIp } from "@/lib/rate-limit";

const OTP_PURPOSES = new Set(["PASSENGER_REGISTRATION", "PASSENGER_LEGACY_PASSWORD_SETUP"]);
function otpError(code: string, message: string, status = 400) { return NextResponse.json({ success: false, code, message, error: message }, { status }); }

async function handler(request: NextRequest) {
  try {
    const body = await request.json();
    const bookingId = String(body.bookingId || body.booking_id || "");
    const code = String(body.code || body.otp || body.otpCode || "").trim();
    const purpose = OTP_PURPOSES.has(String(body.purpose)) ? String(body.purpose) : "PASSENGER_REGISTRATION";
    if (!bookingId || !/^\d{6}$/.test(code)) return otpError("OTP_INVALID", "Invalid verification code.");

    const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking) return otpError("BOOKING_NOT_FOUND", "Booking not found.", 404);
    const normalizedPhone = booking.normalizedPhone || normalizePassengerPhone(`${booking.customerPhoneCode}${booking.customerPhone}`, booking.customerPhoneCode);
    if (!isValidE164Phone(normalizedPhone)) return otpError("PHONE_INVALID", "The booking phone number is invalid.");

    const distributedLimit = await enforceAuthRateLimit({
      domain: "otp-verify",
      identities: [
        { dimension: "ip", value: resolveClientIp(request), max: rateLimits.passengerRegistrationOtpVerify.max, windowMs: rateLimits.passengerRegistrationOtpVerify.windowMs },
        { dimension: "phone", value: normalizedPhone, max: rateLimits.passengerRegistrationOtpVerify.max, windowMs: rateLimits.passengerRegistrationOtpVerify.windowMs },
      ],
    });
    if (!distributedLimit.allowed) return authRateLimitResponse(distributedLimit, "Too many verification attempts. Please request a new code.");

    const otpRecord = await prisma.oTP.findFirst({ where: { bookingId, phone: normalizedPhone, purpose, used: false, expiresAt: { gt: new Date() }, attempts: { lt: 5 } }, orderBy: { createdAt: "desc" } });
    if (!otpRecord) return otpError("OTP_EXPIRED", "Verification code expired. Please request a new code.");

    const provider = await checkWhatsAppVerification(normalizedPhone, code);
    if (!provider.success) {
      await prisma.oTP.updateMany({ where: { id: otpRecord.id, used: false }, data: { attempts: { increment: 1 } } });
      return otpError("OTP_INVALID", provider.error);
    }

    const consumed = await prisma.oTP.updateMany({ where: { id: otpRecord.id, used: false, expiresAt: { gt: new Date() }, attempts: { lt: 5 } }, data: { used: true } });
    if (consumed.count !== 1) return otpError("OTP_REPLAYED", "Verification could not be completed. Please request a new code.");

    const passenger = await prisma.passenger.findFirst({ where: { OR: [{ phone: normalizedPhone }, { normalizedPhone }] } });
    if (purpose === "PASSENGER_REGISTRATION" && passenger?.passwordHash) return otpError("ACCOUNT_EXISTS_LOGIN_REQUIRED", "This phone already has a Drivo account. Please log in or reset your password.", 409);
    if (purpose === "PASSENGER_REGISTRATION" && passenger) return otpError("LEGACY_SETUP_REQUIRED", "Please verify your phone and create a password to continue.", 409);
    if (purpose === "PASSENGER_LEGACY_PASSWORD_SETUP" && !passenger) return otpError("REGISTRATION_REQUIRED", "Please verify your phone and create an account.", 404);
    if (purpose === "PASSENGER_LEGACY_PASSWORD_SETUP" && passenger?.passwordHash) return otpError("ACCOUNT_EXISTS_LOGIN_REQUIRED", "This phone already has a Drivo account. Please log in or reset your password.", 409);

    let proof: { proofToken: string; expiresAt: Date };
    try {
      proof = await createVerificationProof({ passengerId: passenger?.id || null, normalizedPhone, purpose, bookingId });
    } catch (error) {
      console.error("Passenger auth proof creation failed", { type: error instanceof Error ? error.name : "unknown" });
      return otpError("PROOF_CREATE_FAILED", "Verification could not be completed. Please request a new code.", 500);
    }

    await prisma.booking.update({ where: { id: bookingId }, data: { phoneVerified: true, normalizedPhone, passengerAuthStatus: purpose === "PASSENGER_LEGACY_PASSWORD_SETUP" ? "LEGACY_PASSWORD_SETUP_REQUIRED" : "ACCOUNT_SETUP_REQUIRED" } });
    const base = { success: true, verified: true, proofExpiresAt: proof.expiresAt.toISOString(), normalizedPhone, bookingId, phoneVerified: true, email: booking.customerEmail || "", message: "Phone verified successfully" };
    return NextResponse.json(purpose === "PASSENGER_LEGACY_PASSWORD_SETUP" ? { ...base, legacyPasswordSetupRequired: true, legacyPasswordSetupProofToken: proof.proofToken } : { ...base, accountSetupRequired: true, registrationProofToken: proof.proofToken });
  } catch (error) {
    console.error("OTP verify error", { type: error instanceof Error ? error.name : "unknown" });
    return otpError("OTP_VERIFY_FAILED", "Verification failed. Please try again.", 500);
  }
}

export const runtime = "nodejs";
export const POST = handler;
