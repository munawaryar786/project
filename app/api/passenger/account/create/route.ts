import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { finishGuestOperationTransition } from "@/lib/public-booking-operation";
import { z } from "zod";
import {
  createPassengerSession,
  hashSecret,
  normalizePassengerEmail,
  normalizePassengerPhone,
  publicPassenger,
  setPassengerCookie,
  setTrustedDeviceCookie,
  validatePassengerPassword,
} from "@/lib/passenger-auth";
import { prisma } from "@/lib/prisma";
import { authRateLimitResponse, enforceAuthRateLimit, rateLimits, resolveClientIp } from "@/lib/rate-limit";
import { bindPublicBookingOwner, publicBookingAccess, validBookingId } from "@/lib/booking-access";
import { isAllowedOrigin } from "@/lib/env";

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
  if (!isAllowedOrigin(request.headers.get("origin"))) return proofError("ORIGIN_REJECTED", "Request origin is not allowed", 403);
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
    if (!validBookingId(data.bookingId)) return proofError("BOOKING_ACCESS_DENIED", "Booking unavailable", 404);
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
    const normalizedEmail = normalizePassengerEmail(data.email);
    const distributedLimit = await enforceAuthRateLimit({ domain: "account-create", identities: [
      { dimension: "ip", value: resolveClientIp(request), max: rateLimits.passengerAccountCreate.max, windowMs: rateLimits.passengerAccountCreate.windowMs },
      { dimension: "phone", value: normalizedPhone, max: rateLimits.passengerAccountCreate.max, windowMs: rateLimits.passengerAccountCreate.windowMs },
      { dimension: "email", value: normalizedEmail, max: rateLimits.passengerAccountCreate.max, windowMs: rateLimits.passengerAccountCreate.windowMs },
    ] });
    if (!distributedLimit.allowed) return authRateLimitResponse(distributedLimit, "Too many account creation attempts. Please wait and try again.");
    const booking = await prisma.booking.findUnique({ where: { id: data.bookingId } });
    if (!booking || !(await publicBookingAccess(request, booking)).allowed) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }

    const bookingPhone =
      booking.normalizedPhone ||
      normalizePassengerPhone(`${booking.customerPhoneCode}${booking.customerPhone}`, booking.customerPhoneCode);
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

    const emailOwner = await prisma.passenger.findFirst({ where: { email: { equals: normalizedEmail, mode: "insensitive" } } });
    if (emailOwner && emailOwner.id !== existing?.id) {
      return proofError("EMAIL_ALREADY_IN_USE", "This email is already linked to another Drivo account. Please use a different email.", 409);
    }
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
    if (existing && existing.status !== "ACTIVE") return proofError("ACCOUNT_UNAVAILABLE", "Account setup is unavailable", 403);
    const completed = await prisma.$transaction(async tx => {
      const currentBooking = await tx.booking.findUnique({ where: { id: data.bookingId } });
      if (!currentBooking || !(await publicBookingAccess(request, currentBooking, undefined, tx)).allowed) throw new Error("BOOKING_ACCESS_DENIED");
      const consumed = await tx.passengerVerificationProof.updateMany({ where: {
        id: proof.id, purpose: expectedPurpose, bookingId: data.bookingId, normalizedPhone,
        consumedAt: null, expiresAt: { gt: new Date() },
      }, data: { consumedAt: new Date() } });
      if (consumed.count !== 1) throw new Error("PROOF_REPLAYED");
      if (existing) {
        const unchanged = await tx.passenger.updateMany({ where: { id: existing.id, status: "ACTIVE", OR: [{ passwordHash: null }, { passwordHash: { isSet: false } }] }, data: { lastLoginAt: new Date() } });
        if (unchanged.count !== 1) throw new Error("ACCOUNT_SETUP_CONFLICT");
      }
      const passenger = existing
      ? await tx.passenger.update({
          where: { id: existing.id },
          data: {
            phone: normalizedPhone,
            normalizedPhone,
            phoneVerified: true,
            phoneVerifiedAt: existing.phoneVerifiedAt || new Date(),
            fullName: data.fullName,
            email: normalizedEmail,
            passwordHash,
            profileCompleted: true,
            status: "ACTIVE",
            lastLoginAt: new Date(),
            authVersion: { increment: 1 },
          },
        })
      : await tx.passenger.create({
          data: {
            phone: normalizedPhone,
            normalizedPhone,
            phoneVerified: true,
            phoneVerifiedAt: new Date(),
            fullName: data.fullName,
            email: normalizedEmail,
            passwordHash,
            profileCompleted: true,
            status: "ACTIVE",
            lastLoginAt: new Date(),
          },
        });

      await bindPublicBookingOwner(tx, request, currentBooking, passenger.id);
      await tx.booking.update({
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

      await tx.passengerSession.updateMany({ where: { passengerId: passenger.id, OR: [{ revokedAt: null }, { revokedAt: { isSet: false } }] }, data: { revokedAt: new Date() } });
      const token = await createPassengerSession(passenger, tx);
      return { passenger, token };
    });
    const { passenger, token } = completed;
    const response = NextResponse.json({
      success: true,
      passenger: publicPassenger(passenger),
    });
    setPassengerCookie(response, token);
    if (data.rememberDevice) {
      try { await setTrustedDeviceCookie(request, response, passenger.id); }
      catch { console.error("[passenger.trusted-device.deferred]", { code: "TRUSTED_DEVICE_UNAVAILABLE" }); }
    }

    console.info("[passenger.account.setup.completed]");
    return finishGuestOperationTransition(request, response);
  } catch (error) {
    if (error instanceof Error && ["BOOKING_ACCESS_DENIED", "BOOKING_ACCESS_CONFLICT", "PROOF_REPLAYED", "ACCOUNT_SETUP_CONFLICT"].includes(error.message)) return proofError("ACCOUNT_SETUP_CONFLICT", "Account setup could not be completed. Sign in or restart verification.", 409);
    console.error("[passenger.account.create.failed]", { code: "ACCOUNT_CREATE_FAILED" });
    return NextResponse.json(
      { error: "Could not create account. Please try again." },
      { status: 500 }
    );
  }
}

export const runtime = "nodejs";
export const POST = handler;
