import { prisma } from "./prisma";
import { checkWhatsAppVerification, sendWhatsAppMessagingOtp, sendWhatsAppVerification } from "./twilio";
import { createMessagingOtpChallenge, registrationOtpProvider, verifyMessagingOtpChallenge } from "./otp-challenge";
import { isValidE164Phone, normalizePassengerPhone } from "./passenger-auth";

/** Compatibility helper for booking callers; Twilio Verify owns the code. */
export async function sendOTP(bookingId: string, phone: string) {
  const normalizedPhone = normalizePassengerPhone(phone);
  if (!isValidE164Phone(normalizedPhone)) return { success: false, error: "Invalid phone number.", method: "whatsapp" };
  const scope = { bookingId, phone: normalizedPhone, purpose: "PASSENGER_REGISTRATION" };
  const challenge = registrationOtpProvider() === "messaging" ? createMessagingOtpChallenge(scope) : null;
  const result = challenge ? await sendWhatsAppMessagingOtp(normalizedPhone, challenge.otp) : await sendWhatsAppVerification(normalizedPhone);
  if (!result.success) return { success: false, error: result.error, method: "whatsapp" };
  await prisma.oTP.updateMany({ where: { bookingId, phone: normalizedPhone, used: false }, data: { used: true } });
  await prisma.oTP.create({ data: { code: challenge?.storedCode ?? "TWILIO_VERIFY", phone: normalizedPhone, expiresAt: new Date(Date.now() + 10 * 60 * 1000), bookingId } });
  return { success: true, method: "whatsapp" };
}

export async function verifyOTP(bookingId: string, userOTP: string) {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) return { success: false, error: "Booking not found" };
  if (booking.phoneVerified) return { success: false, error: "Phone already verified" };
  const phone = booking.normalizedPhone || normalizePassengerPhone(`${booking.customerPhoneCode}${booking.customerPhone}`, booking.customerPhoneCode);
  const otpRecord = await prisma.oTP.findFirst({ where: { bookingId, phone, used: false, expiresAt: { gt: new Date() }, attempts: { lt: 5 } }, orderBy: { createdAt: "desc" } });
  if (!otpRecord) return { success: false, error: "No OTP found or already used" };
  const result = otpRecord.code === "TWILIO_VERIFY"
    ? await checkWhatsAppVerification(phone, userOTP)
    : verifyMessagingOtpChallenge({
        storedCode: otpRecord.code, bookingId, phone,
        purpose: otpRecord.purpose || "PASSENGER_REGISTRATION", otp: userOTP,
      })
      ? { success: true as const, status: "approved" }
      : { success: false as const, error: "Invalid or expired verification code." };
  if (!result.success) {
    await prisma.oTP.updateMany({ where: { id: otpRecord.id, used: false, attempts: { lt: 5 } }, data: { attempts: { increment: 1 } } });
    return { success: false, error: result.error };
  }
  const claimed = await prisma.oTP.updateMany({ where: { id: otpRecord.id, used: false, expiresAt: { gt: new Date() }, attempts: { lt: 5 } }, data: { used: true } });
  if (claimed.count !== 1) return { success: false, error: "Verification could not be completed" };
  await prisma.booking.update({ where: { id: bookingId }, data: { phoneVerified: true, status: "VERIFIED" } });
  return { success: true };
}
