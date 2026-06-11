import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  createPassengerSession,
  publicPassenger,
  setPassengerCookie,
} from "@/lib/passenger-auth";

const VerifySchema = z.object({
  phone: z.string().trim().min(6),
  otpCode: z.string().trim().min(4),
});

export async function POST(request: NextRequest) {
  const body = await request.json();
  const parsed = VerifySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const otp = await prisma.passengerOtp.findFirst({
    where: {
      phone: parsed.data.phone,
      code: parsed.data.otpCode,
      expiresAt: { gte: new Date() },
      used: false,
    },
    include: { passenger: true },
  });

  if (!otp) {
    return NextResponse.json({ error: "Invalid or expired verification code" }, { status: 400 });
  }

  await prisma.passengerOtp.update({
    where: { id: otp.id },
    data: { used: true },
  });

  const passenger = await prisma.passenger.update({
    where: { id: otp.passengerId },
    data: { phoneVerified: true },
  });

  const token = await createPassengerSession(passenger);
  const response = NextResponse.json({
    success: true,
    passenger: publicPassenger(passenger),
  });
  setPassengerCookie(response, token);

  return response;
}
