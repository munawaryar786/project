import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { sendOTPWithFallback } from "@/lib/twilio";

const SendSchema = z.object({
  phone: z.string().trim().min(6),
});

export async function POST(request: NextRequest) {
  const body = await request.json();
  const parsed = SendSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const phone = parsed.data.phone;
  const passenger = await prisma.passenger.findUnique({ where: { phone } });

  if (!passenger) {
    return NextResponse.json({ error: "Passenger account not found" }, { status: 404 });
  }

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  await prisma.passengerOtp.create({
    data: {
      code: otp,
      phone,
      passengerId: passenger.id,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    },
  });

  let deliveryResult = { success: true, method: "console" };
  if (process.env.TWILIO_ACCOUNT_SID && process.env.NODE_ENV === "production") {
    deliveryResult = await sendOTPWithFallback(phone, otp);
  } else {
    console.log(`Passenger login OTP for ${phone}: ${otp}`);
  }

  return NextResponse.json({
    success: true,
    method: deliveryResult.method,
    devOtp: process.env.NODE_ENV === "development" ? otp : undefined,
  });
}
