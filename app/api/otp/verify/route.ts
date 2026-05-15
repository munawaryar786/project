import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/otp/verify — Verify OTP code
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    console.log("🔍 OTP VERIFY — RECEIVED:", JSON.stringify(body, null, 2));

    // Extract fields flexibly
    const bookingId = body.bookingId || body.booking_id || body.bookingRef || "";
    const phone = body.phone || body.customerPhone || "";
    const code = (body.code || body.otp || body.otpCode || "").toString();

    if (!code || code.length < 4) {
      return NextResponse.json(
        { error: "Please enter the verification code" },
        { status: 400 }
      );
    }

    // Find matching OTP in database
    const otpRecord = await prisma.oTP.findFirst({
      where: {
        bookingId: bookingId,
        code: code,
        expiresAt: { gte: new Date() },
        used: false,
      },
    });

    if (!otpRecord) {
      console.log(`❌ OTP VERIFY FAILED — No matching OTP for code: ${code}`);
      return NextResponse.json(
        { error: "Invalid or expired verification code" },
        { status: 400 }
      );
    }

    // Mark OTP as used
    await prisma.oTP.update({
      where: { id: otpRecord.id },
      data: { used: true },
    });

    // Mark booking as phone verified
    await prisma.booking.update({
      where: { id: bookingId },
      data: { phoneVerified: true },
    });

    console.log("═══════════════════════════════════════");
    console.log("✅ OTP VERIFIED — DATABASE UPDATED ✅");
    console.log(`📋 Booking: ${bookingId}`);
    console.log(`📱 Phone:   ${phone}`);
    console.log(`🔢 Code:    ${code}`);
    console.log("═══════════════════════════════════════");
// AUTO START DISPATCH AFTER OTP VERIFIED
try {
  const dispatchRes = await fetch(`${request.nextUrl.origin}/api/dispatch/start`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      bookingId,
    }),
  });

  const dispatchData = await dispatchRes.json().catch(() => null);

  if (!dispatchRes.ok) {
    console.log("⚠️ Auto dispatch failed:", dispatchData?.error || "Unknown error");
  } else {
    console.log("✅ Auto dispatch started after OTP verification");
  }
} catch (err) {
  console.error("❌ Auto dispatch error:", err);
}
    return NextResponse.json(
      {
        success: true,
        verified: true,
        message: "Phone verified successfully",
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("❌ OTP verify error:", error);
    return NextResponse.json(
      { error: "Verification failed. Please try again." },
      { status: 500 }
    );
  }
}