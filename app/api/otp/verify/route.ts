import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  createVerificationProof,
  normalizePassengerPhone,
} from "@/lib/passenger-auth";
import { rateLimits, withRateLimit } from "@/lib/rate-limit";

function otpError(code: string, message: string, status = 400) {
  return NextResponse.json({ success: false, code, message, error: message }, { status });
}

async function handler(request: NextRequest) {
  try {
    const body = await request.json();
    const bookingId = String(body.bookingId || body.booking_id || "");
    const code = String(body.code || body.otp || body.otpCode || "").trim();

    if (!bookingId || code.length !== 6) {
      return otpError("OTP_INVALID", "Invalid verification code.");
    }

    const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking) {
      return otpError("BOOKING_NOT_FOUND", "Booking not found", 404);
    }

    const normalizedPhone =
      booking.normalizedPhone ||
      normalizePassengerPhone(`${booking.customerPhoneCode}${booking.customerPhone}`);

    const otpRecord = await prisma.oTP.findFirst({
      where: {
        bookingId,
        phone: normalizedPhone,
        purpose: "PASSENGER_REGISTRATION",
        used: false,
      },
      orderBy: { createdAt: "desc" },
    });

    if (!otpRecord) {
      return otpError("OTP_INVALID", "Invalid verification code.");
    }

    if (otpRecord.expiresAt.getTime() <= Date.now()) {
      return otpError("OTP_EXPIRED", "Verification code expired. Please request a new code.");
    }

    if (otpRecord.attempts >= otpRecord.maxAttempts || otpRecord.code !== code) {
      await prisma.oTP.update({
        where: { id: otpRecord.id },
        data: { attempts: { increment: 1 } },
      });
      return otpError("OTP_INVALID", "Invalid verification code.");
    }

    const passenger = await prisma.passenger.findUnique({
      where: { phone: normalizedPhone },
    });

    let proof: { proofToken: string; expiresAt: Date };
    try {
      proof = await createVerificationProof({
        passengerId: passenger?.id || null,
        normalizedPhone,
        purpose: "PASSENGER_REGISTRATION",
        bookingId,
      });
    } catch (error) {
      console.error("Passenger registration proof creation failed:", error);
      return otpError(
        "PROOF_CREATE_FAILED",
        "Verification could not be completed. Please request a new code.",
        500
      );
    }

    if (!proof.proofToken) {
      return otpError(
        "PROOF_CREATE_FAILED",
        "Verification could not be completed. Please request a new code.",
        500
      );
    }

    await prisma.oTP.update({
      where: { id: otpRecord.id },
      data: { used: true },
    });

    await prisma.booking.update({
      where: { id: bookingId },
      data: {
        phoneVerified: true,
        normalizedPhone,
        passengerAuthStatus: "ACCOUNT_SETUP_REQUIRED",
      },
    });

    console.log("OTP verify returned proof: yes");

    return NextResponse.json({
      success: true,
      verified: true,
      accountSetupRequired: true,
      existingPasswordAccount: Boolean(passenger?.passwordHash),
      registrationProofToken: proof.proofToken,
      proofExpiresAt: proof.expiresAt.toISOString(),
      normalizedPhone,
      bookingId,
      phoneVerified: true,
      email: booking.customerEmail || "",
      message: "Phone verified successfully",
    });
  } catch (error) {
    console.error("OTP verify error:", error);
    return NextResponse.json(
      { success: false, code: "OTP_VERIFY_FAILED", message: "Verification failed. Please try again.", error: "Verification failed. Please try again." },
      { status: 500 }
    );
  }
}

export const POST = withRateLimit(handler, rateLimits.passengerRegistrationOtpVerify);
