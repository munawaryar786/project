import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import {
  consumeVerificationProofById,
  createPassengerSession,
  hashSecret,
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
    registrationProofToken: z.string().trim().optional().default(""),
    legacyPasswordSetupProofToken: z.string().trim().optional().default(""),
    authMode: z.enum(["REGISTER", "LEGACY_SETUP"]).optional().default("REGISTER"),
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

function proofError(code: string, message: string, status = 400) {
  return NextResponse.json({ success: false, code, message, error: message }, { status });
}

async function handler(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = CreateAccountSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const data = parsed.data;
    const isLegacySetup = data.authMode === "LEGACY_SETUP" || Boolean(data.legacyPasswordSetupProofToken);
    const proofToken = isLegacySetup ? data.legacyPasswordSetupProofToken : data.registrationProofToken;
    const expectedPurpose = isLegacySetup
      ? "PASSENGER_LEGACY_PASSWORD_SETUP"
      : "PASSENGER_REGISTRATION";

    if (!proofToken) {
      return proofError(
        "PROOF_MISSING",
        "Phone verification is missing. Please verify your number again."
      );
    }

    const passwordError = validatePassengerPassword(data.password);
    if (passwordError) {
      return NextResponse.json({ error: passwordError }, { status: 400 });
    }

    const normalizedPhone = normalizePassengerPhone(data.phone);
    const booking = await prisma.booking.findUnique({ where: { id: data.bookingId } });
    if (!booking) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }

    const bookingPhone =
      booking.normalizedPhone ||
      normalizePassengerPhone(`${booking.customerPhoneCode}${booking.customerPhone}`);
    if (bookingPhone !== normalizedPhone) {
      return proofError(
        "PROOF_PHONE_MISMATCH",
        "Phone verification could not be confirmed. Please verify again."
      );
    }

    const proof = await prisma.passengerVerificationProof.findUnique({
      where: { proofTokenHash: hashSecret(proofToken) },
    });

    if (!proof || proof.purpose !== expectedPurpose) {
      return proofError(
        "PROOF_INVALID",
        "Phone verification could not be confirmed. Please verify again."
      );
    }

    if (proof.consumedAt || proof.expiresAt.getTime() <= Date.now()) {
      return proofError(
        "PROOF_EXPIRED",
        "Phone verification expired. Please verify again."
      );
    }

    if (proof.normalizedPhone !== normalizedPhone) {
      return proofError(
        "PROOF_PHONE_MISMATCH",
        "Phone verification could not be confirmed. Please verify again."
      );
    }

    if (proof.bookingId !== data.bookingId) {
      return proofError(
        "PROOF_BOOKING_MISMATCH",
        "Phone verification could not be confirmed. Please verify again."
      );
    }

    const existing = await prisma.passenger.findFirst({
      where: {
        OR: [{ phone: normalizedPhone }, { normalizedPhone }],
      },
    });

    if (existing?.passwordHash) {
      return NextResponse.json(
        {
          success: false,
          code: "ACCOUNT_EXISTS_LOGIN_REQUIRED",
          error: "This phone already has a Drivo account. Please log in or reset your password.",
          message: "This phone already has a Drivo account. Please log in or reset your password.",
        },
        { status: 409 }
      );
    }

    if (isLegacySetup && !existing) {
      return proofError(
        "LEGACY_ACCOUNT_NOT_FOUND",
        "Phone verification could not be confirmed. Please verify again.",
        409
      );
    }

    if (!isLegacySetup && existing) {
      return NextResponse.json(
        {
          success: false,
          code: "LEGACY_SETUP_REQUIRED",
          error: "Please verify your phone and create a password to continue.",
          message: "Please verify your phone and create a password to continue.",
        },
        { status: 409 }
      );
    }

    const passwordHash = await bcrypt.hash(data.password, 12);
    const passenger = existing
      ? await prisma.passenger.update({
          where: { id: existing.id },
          data: {
            phone: normalizedPhone,
            normalizedPhone,
            phoneVerified: true,
            phoneVerifiedAt: existing.phoneVerifiedAt || new Date(),
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

    await consumeVerificationProofById(proof.id);

    const token = await createPassengerSession(passenger);
    const response = NextResponse.json({
      success: true,
      passenger: publicPassenger(passenger),
    });
    setPassengerCookie(response, token);
    if (data.rememberDevice) {
      await setTrustedDeviceCookie(request, response, passenger.id);
    }

    console.log(`Passenger account setup completed: ${passenger.id}`);
    return response;
  } catch (error) {
    console.error("Passenger account create error:", error);
    return NextResponse.json(
      { error: "Could not create account. Please try again." },
      { status: 500 }
    );
  }
}

export const POST = withRateLimit(handler, rateLimits.passengerAccountCreate);
