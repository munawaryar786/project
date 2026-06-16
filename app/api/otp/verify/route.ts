import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  createVerificationProof,
  normalizePassengerPhone,
} from "@/lib/passenger-auth";
import { rateLimits, withRateLimit } from "@/lib/rate-limit";

async function handler(request: NextRequest) {
  try {
    const body = await request.json();
    const bookingId = String(body.bookingId || body.booking_id || "");
    const code = String(body.code || body.otp || body.otpCode || "").trim();

    if (!bookingId || code.length !== 6) {
      return NextResponse.json(
        { error: "Please enter the verification code" },
        { status: 400 }
      );
    }

    const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }

    const normalizedPhone =
      booking.normalizedPhone ||
      normalizePassengerPhone(`${booking.customerPhoneCode}${booking.customerPhone}`);

    const otpRecord = await prisma.oTP.findFirst({
      where: {
        bookingId,
        phone: normalizedPhone,
        purpose: "PASSENGER_REGISTRATION",
        expiresAt: { gte: new Date() },
        used: false,
      },
      orderBy: { createdAt: "desc" },
    });

    if (!otpRecord || otpRecord.code !== code || otpRecord.attempts >= otpRecord.maxAttempts) {
      if (otpRecord) {
        await prisma.oTP.update({
          where: { id: otpRecord.id },
          data: { attempts: { increment: 1 } },
        });
      }
      return NextResponse.json(
        { error: "Invalid or expired verification code" },
        { status: 400 }
      );
    }

    await prisma.oTP.update({
      where: { id: otpRecord.id },
      data: { used: true },
    });

    const passenger = await prisma.passenger.findUnique({
      where: { phone: normalizedPhone },
    });
    const proofToken = await createVerificationProof({
      passengerId: passenger?.id || null,
      normalizedPhone,
      purpose: "PASSENGER_REGISTRATION",
      bookingId,
    });

    await prisma.booking.update({
      where: { id: bookingId },
      data: {
        phoneVerified: true,
        normalizedPhone,
        passengerAuthStatus:
          passenger?.passwordHash ? "ACCOUNT_SETUP_REQUIRED" : "ACCOUNT_SETUP_REQUIRED",
      },
    });

    return NextResponse.json({
      success: true,
      verified: true,
      accountSetupRequired: true,
      existingPasswordAccount: Boolean(passenger?.passwordHash),
      proofToken,
      phone: normalizedPhone,
      email: booking.customerEmail || "",
      message: "Phone verified successfully",
    });
  } catch (error) {
    console.error("OTP verify error:", error);
    return NextResponse.json(
      { error: "Verification failed. Please try again." },
      { status: 500 }
    );
  }
}

export const POST = withRateLimit(handler, rateLimits.otp);
