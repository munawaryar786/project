import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import {
  consumeVerificationProof,
  createPassengerSession,
  normalizePassengerPhone,
  publicPassenger,
  setPassengerCookie,
  setTrustedDeviceCookie,
  validatePassengerPassword,
} from "@/lib/passenger-auth";
import { prisma } from "@/lib/prisma";
import { rateLimits, withRateLimit } from "@/lib/rate-limit";

const CreateAccountSchema = z
  .object({
    bookingId: z.string().min(1),
    proofToken: z.string().min(20),
    phone: z.string().min(6),
    fullName: z.string().trim().min(2).max(120),
    email: z.string().trim().email().max(160),
    password: z.string().min(1).max(128),
    confirmPassword: z.string().min(1).max(128),
    rememberDevice: z.boolean().optional().default(true),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match.",
  });

async function handler(request: NextRequest) {
  try {
    const parsed = CreateAccountSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const data = parsed.data;
    const passwordError = validatePassengerPassword(data.password);
    if (passwordError) {
      return NextResponse.json({ error: passwordError }, { status: 400 });
    }

    const normalizedPhone = normalizePassengerPhone(data.phone);
    const proof = await consumeVerificationProof({
      proofToken: data.proofToken,
      normalizedPhone,
      purpose: "PASSENGER_REGISTRATION",
      bookingId: data.bookingId,
    });

    if (!proof) {
      return NextResponse.json(
        { error: "Phone verification expired. Please verify again." },
        { status: 400 }
      );
    }

    const booking = await prisma.booking.findUnique({ where: { id: data.bookingId } });
    if (!booking) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }

    const bookingPhone =
      booking.normalizedPhone ||
      normalizePassengerPhone(`${booking.customerPhoneCode}${booking.customerPhone}`);
    if (bookingPhone !== normalizedPhone) {
      return NextResponse.json({ error: "Phone verification does not match booking" }, { status: 400 });
    }

    const passwordHash = await bcrypt.hash(data.password, 12);
    const existing = await prisma.passenger.findFirst({
      where: {
        OR: [{ phone: normalizedPhone }, { normalizedPhone }],
      },
    });

    if (existing?.passwordHash) {
      return NextResponse.json(
        { error: "This phone already has an account. Please log in or reset your password." },
        { status: 409 }
      );
    }

    const passenger = existing
      ? await prisma.passenger.update({
          where: { id: existing.id },
          data: {
            phone: normalizedPhone,
            normalizedPhone,
            phoneVerified: true,
            phoneVerifiedAt: new Date(),
            fullName: data.fullName,
            email: data.email.toLowerCase(),
            passwordHash,
            profileCompleted: true,
            status: "ACTIVE",
            lastLoginAt: new Date(),
          },
        })
      : await prisma.passenger.create({
          data: {
            phone: normalizedPhone,
            normalizedPhone,
            phoneVerified: true,
            phoneVerifiedAt: new Date(),
            fullName: data.fullName,
            email: data.email.toLowerCase(),
            passwordHash,
            profileCompleted: true,
            status: "ACTIVE",
            lastLoginAt: new Date(),
          },
        });

    await prisma.booking.update({
      where: { id: data.bookingId },
      data: {
        passengerId: passenger.id,
        phoneVerified: true,
        normalizedPhone,
        customerEmail: data.email.toLowerCase(),
        customerName: data.fullName,
        passengerAuthStatus: "AUTHENTICATED",
        passengerAuthCompletedAt: new Date(),
      },
    });

    const token = await createPassengerSession(passenger);
    const response = NextResponse.json({
      success: true,
      passenger: publicPassenger(passenger),
    });
    setPassengerCookie(response, token);
    if (data.rememberDevice) {
      await setTrustedDeviceCookie(request, response, passenger.id);
    }

    console.log(`Passenger account created/upgraded: ${passenger.id}`);
    return response;
  } catch (error) {
    console.error("Passenger account create error:", error);
    return NextResponse.json(
      { error: "Could not create account. Please try again." },
      { status: 500 }
    );
  }
}

export const POST = withRateLimit(handler, rateLimits.auth);
