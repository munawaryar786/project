import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { sendWhatsAppVerification } from "@/lib/twilio";
import { isValidE164Phone, normalizePassengerPhone } from "@/lib/passenger-auth";
import { authRateLimitResponse, enforceAuthRateLimit, rateLimits, resolveClientIp } from "@/lib/rate-limit";

const PassengerOtpPurposeSchema = z.enum(["PASSENGER_REGISTRATION", "PASSENGER_LEGACY_PASSWORD_SETUP"]);
const OTPSchema = z.object({
  bookingId: z.string().min(1),
  phone: z.string().min(6),
  purpose: PassengerOtpPurposeSchema.optional().default("PASSENGER_REGISTRATION"),
});

function otpError(code: string, message: string, status = 400) {
  return NextResponse.json({ success: false, code, message, error: message }, { status });
}

async function handler(request: NextRequest) {
  try {
    const parsed = OTPSchema.safeParse(await request.json());
    if (!parsed.success) return otpError("INVALID_REQUEST", "Invalid verification request.");
    const { bookingId, purpose } = parsed.data;
    const normalizedPhone = normalizePassengerPhone(parsed.data.phone);
    if (!isValidE164Phone(normalizedPhone)) return otpError("PHONE_INVALID", "Enter a valid mobile number.");

    // Phase 3J registration_otp_phone (3 requests / 5 minutes) is now Redis-backed.
    const distributedLimit = await enforceAuthRateLimit({
      domain: "otp-send",
      identities: [
        { dimension: "ip", value: resolveClientIp(request), max: rateLimits.passengerRegistrationOtpSend.max, windowMs: rateLimits.passengerRegistrationOtpSend.windowMs },
        { dimension: "phone", value: normalizedPhone, max: rateLimits.passengerRegistrationOtpPhone.max, windowMs: rateLimits.passengerRegistrationOtpPhone.windowMs },
      ],
      cooldown: { value: `${purpose}:${normalizedPhone}`, windowMs: 30_000 },
    });
    if (!distributedLimit.allowed) return authRateLimitResponse(distributedLimit, "Too many OTP requests. Please try again later.");

    const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking) return otpError("BOOKING_NOT_FOUND", "Booking not found.", 404);
    const bookingPhone = booking.normalizedPhone || normalizePassengerPhone(`${booking.customerPhoneCode}${booking.customerPhone}`, booking.customerPhoneCode);
    if (bookingPhone !== normalizedPhone) return otpError("PHONE_MISMATCH", "Phone number does not match booking.");

    const passenger = await prisma.passenger.findFirst({ where: { OR: [{ phone: normalizedPhone }, { normalizedPhone }] }, select: { id: true, passwordHash: true } });
    if (purpose === "PASSENGER_REGISTRATION" && passenger?.passwordHash) return otpError("ACCOUNT_EXISTS_LOGIN_REQUIRED", "This phone already has a Drivo account. Please log in or reset your password.", 409);
    if (purpose === "PASSENGER_REGISTRATION" && passenger) return otpError("LEGACY_SETUP_REQUIRED", "Please verify your phone and create a password to continue.", 409);
    if (purpose === "PASSENGER_LEGACY_PASSWORD_SETUP" && !passenger) return otpError("REGISTRATION_REQUIRED", "Please verify your phone and create an account.", 404);
    if (purpose === "PASSENGER_LEGACY_PASSWORD_SETUP" && passenger?.passwordHash) return otpError("ACCOUNT_EXISTS_LOGIN_REQUIRED", "This phone already has a Drivo account. Please log in or reset your password.", 409);

    const latest = await prisma.oTP.findFirst({ where: { bookingId, phone: normalizedPhone, purpose, used: false }, orderBy: { createdAt: "desc" } });
    if (latest && Date.now() - latest.createdAt.getTime() < 30_000) return otpError("RESEND_COOLDOWN", "Please wait before requesting another code.", 429);

    const provider = await sendWhatsAppVerification(normalizedPhone);
    if (!provider.success) return otpError("PROVIDER_UNAVAILABLE", provider.error, 503);

    await prisma.oTP.updateMany({ where: { bookingId, phone: normalizedPhone, purpose, used: false }, data: { used: true } });
    await prisma.oTP.create({
      data: {
        // Legacy field retained for backward-compatible records; Twilio Verify owns the real code.
        code: "TWILIO_VERIFY",
        phone: normalizedPhone,
        purpose,
        bookingId,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    });
    await prisma.booking.update({ where: { id: bookingId }, data: { normalizedPhone, passengerAuthStatus: "PENDING_PHONE_VERIFICATION" } });

    return NextResponse.json({ success: true, message: "A WhatsApp verification code has been sent.", method: "whatsapp", channel: "whatsapp", purpose });
  } catch (error) {
    console.error("OTP send error", { type: error instanceof Error ? error.name : "unknown" });
    return otpError("OTP_SEND_FAILED", "We could not send a verification code. Please try again.", 500);
  }
}

export const runtime = "nodejs";
export const POST = handler;
