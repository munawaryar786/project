import { prisma } from "./prisma";
import { generateOTP, maskPhone } from "./utils";
import { sendOTPWithFallback } from "./twilio";

/**
 * Create and store OTP for a booking
 * Production: Sends via WhatsApp with SMS fallback using Twilio
 * Development: Logs to console for testing
 */
export async function sendOTP(bookingId: string, phone: string) {
  const otpCode = generateOTP();
  
  // Set expiration to 5 minutes from now
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

  // Store OTP in OTP table
  await prisma.oTP.create({
    data: {
      code: otpCode,
      phone,
      expiresAt,
      bookingId,
    },
  });

  // Production: Send via Twilio
  if (process.env.TWILIO_ACCOUNT_SID && process.env.NODE_ENV === "production") {
    const result = await sendOTPWithFallback(phone, otpCode);
    
    if (!result.success) {
      console.error("❌ OTP delivery failed:", result.error);
      return { success: false, error: result.error, method: result.method };
    }
    
    console.log(`✅ OTP sent via ${result.method} to ${maskPhone(phone)}`);
    return result;
  }

  // Development: Log OTP to server console (GDPR: phone masked)
  console.log("=========================================");
  console.log(`📱 OTP for ${maskPhone(phone)}: ${otpCode}`);
  console.log("=========================================");

  return { success: true, method: "console" };
}

/**
 * Verify OTP for a booking
 */
export async function verifyOTP(bookingId: string, userOTP: string) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
  });

  if (!booking) {
    return { success: false, error: "Booking not found" };
  }

  if (booking.phoneVerified) {
    return { success: false, error: "Phone already verified" };
  }

  // Find the latest valid OTP for this booking
  const otpRecord = await prisma.oTP.findFirst({
    where: { 
      bookingId,
      used: false 
    },
    orderBy: { createdAt: 'desc' }
  });

  if (!otpRecord) {
    return { success: false, error: "No OTP found or already used" };
  }

  // Check expiry
  if (new Date() > otpRecord.expiresAt) {
    return { success: false, error: "OTP expired. Please request a new one." };
  }

  // Check match
  if (otpRecord.code !== userOTP) {
    return { success: false, error: "Invalid OTP code" };
  }

  // Mark OTP as used and update booking status
  await prisma.$transaction([
    prisma.oTP.update({
      where: { id: otpRecord.id },
      data: { used: true },
    }),
    prisma.booking.update({
      where: { id: bookingId },
      data: {
        phoneVerified: true,
        status: "VERIFIED",
      },
    })
  ]);

  return { success: true };
}