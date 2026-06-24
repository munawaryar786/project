import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { createToken, verifyToken } from "@/lib/auth";

export const PASSENGER_COOKIE = "drivo_passenger_token";
export const PASSENGER_SESSION_COOKIE = "drivo_passenger_session";
export const PASSENGER_DEVICE_COOKIE = "drivo_passenger_device";

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DEVICE_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const OTP_PROOF_TTL_MS = 10 * 60 * 1000;

type PassengerTokenPayload = {
  id?: string;
  phone?: string;
  type?: string;
  sessionId?: string;
};

export function normalizePassengerPhone(phone: string) {
  const compact = phone.replace(/[\s().-]/g, "");
  if (!compact) return "";
  if (compact.startsWith("+")) return `+${compact.slice(1).replace(/\D/g, "")}`;
  if (compact.startsWith("00")) return `+${compact.slice(2).replace(/\D/g, "")}`;
  return `+${compact.replace(/\D/g, "")}`;
}

export function hashSecret(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function createOpaqueToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function validatePassengerPassword(password: string) {
  if (password.length < 12) return "Password must be at least 12 characters.";
  if (password.length > 128) return "Password must be 128 characters or fewer.";
  if (password.trim().length === 0) return "Password cannot be blank.";
  return "";
}

export async function createPassengerSession(passenger: {
  id: string;
  phone: string;
  email?: string | null;
}) {
  const rawSessionToken = createOpaqueToken();
  const session = await prisma.passengerSession.create({
    data: {
      passengerId: passenger.id,
      tokenHash: hashSecret(rawSessionToken),
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      lastUsedAt: new Date(),
    },
  });

  return createToken({
    id: passenger.id,
    phone: passenger.phone,
    email: passenger.email || undefined,
    type: "PASSENGER",
    sessionId: session.id,
    sessionToken: rawSessionToken,
  });
}

export function setPassengerCookie(response: NextResponse, token: string) {
  response.cookies.set({
    name: PASSENGER_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export function clearPassengerCookies(response: NextResponse) {
  for (const name of [PASSENGER_COOKIE, PASSENGER_SESSION_COOKIE]) {
    response.cookies.set({
      name,
      value: "",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
  }
}

export async function getPassengerFromRequest(request: NextRequest) {
  const token = request.cookies.get(PASSENGER_COOKIE)?.value;
  if (!token) return null;

  const payload = (await verifyToken(token)) as (PassengerTokenPayload & {
    sessionToken?: string;
  }) | null;
  if (!payload?.id || payload.type !== "PASSENGER" || !payload.sessionId || !payload.sessionToken) {
    return null;
  }

  const session = await prisma.passengerSession.findFirst({
    where: {
      id: payload.sessionId,
      passengerId: payload.id,
      tokenHash: hashSecret(payload.sessionToken),
      expiresAt: { gt: new Date() },
      revokedAt: null,
    },
  });

  if (!session) return null;

  await prisma.passengerSession.update({
    where: { id: session.id },
    data: { lastUsedAt: new Date() },
  });

  return prisma.passenger.findUnique({
    where: { id: payload.id },
  });
}

export async function revokePassengerSessions(passengerId: string) {
  await prisma.passengerSession.updateMany({
    where: { passengerId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function verifyTrustedDevice(request: NextRequest, passengerId: string) {
  const deviceToken = request.cookies.get(PASSENGER_DEVICE_COOKIE)?.value;
  if (!deviceToken) return false;

  const device = await prisma.passengerTrustedDevice.findFirst({
    where: {
      passengerId,
      deviceTokenHash: hashSecret(deviceToken),
      expiresAt: { gt: new Date() },
      revokedAt: null,
    },
  });

  if (!device) return false;

  await prisma.passengerTrustedDevice.update({
    where: { id: device.id },
    data: { lastUsedAt: new Date() },
  });

  return true;
}

export async function setTrustedDeviceCookie(
  request: NextRequest,
  response: NextResponse,
  passengerId: string
) {
  const deviceToken = createOpaqueToken();
  await prisma.passengerTrustedDevice.create({
    data: {
      passengerId,
      deviceTokenHash: hashSecret(deviceToken),
      expiresAt: new Date(Date.now() + DEVICE_TTL_MS),
      lastUsedAt: new Date(),
      userAgent: request.headers.get("user-agent")?.slice(0, 240) || null,
    },
  });

  response.cookies.set({
    name: PASSENGER_DEVICE_COOKIE,
    value: deviceToken,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(DEVICE_TTL_MS / 1000),
  });
}

type VerificationProofInput = {
  proofToken: string;
  normalizedPhone: string;
  purpose: string;
  bookingId?: string | null;
  passengerId?: string | null;
  loginAttemptId?: string | null;
  resetAttemptId?: string | null;
};

export async function createVerificationProof(input: {
  passengerId?: string | null;
  normalizedPhone: string;
  purpose: string;
  bookingId?: string | null;
  loginAttemptId?: string | null;
  resetAttemptId?: string | null;
}) {
  const proofToken = createOpaqueToken();
  const expiresAt = new Date(Date.now() + OTP_PROOF_TTL_MS);
  await prisma.passengerVerificationProof.create({
    data: {
      proofTokenHash: hashSecret(proofToken),
      passengerId: input.passengerId || null,
      normalizedPhone: input.normalizedPhone,
      purpose: input.purpose,
      bookingId: input.bookingId || null,
      loginAttemptId: input.loginAttemptId || null,
      resetAttemptId: input.resetAttemptId || null,
      expiresAt,
    },
  });
  return { proofToken, expiresAt };
}

export async function findVerificationProof(input: VerificationProofInput) {
  return prisma.passengerVerificationProof.findFirst({
    where: {
      proofTokenHash: hashSecret(input.proofToken),
      normalizedPhone: input.normalizedPhone,
      purpose: input.purpose,
      expiresAt: { gt: new Date() },
      consumedAt: null,
      ...(input.bookingId ? { bookingId: input.bookingId } : {}),
      ...(input.passengerId ? { passengerId: input.passengerId } : {}),
      ...(input.loginAttemptId ? { loginAttemptId: input.loginAttemptId } : {}),
      ...(input.resetAttemptId ? { resetAttemptId: input.resetAttemptId } : {}),
    },
  });
}

export async function consumeVerificationProofById(proofId: string) {
  const consumed = await prisma.passengerVerificationProof.updateMany({
    where: { id: proofId, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  return consumed.count > 0;
}

export async function consumeVerificationProof(input: VerificationProofInput) {
  const proof = await findVerificationProof(input);

  if (!proof) return null;

  const consumed = await consumeVerificationProofById(proof.id);
  if (!consumed) return null;

  return proof;
}

export function publicPassenger(passenger: {
  id: string;
  phone: string;
  normalizedPhone?: string | null;
  phoneVerified: boolean;
  fullName?: string | null;
  email?: string | null;
  profileCompleted: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}) {
  return {
    id: passenger.id,
    phone: passenger.phone,
    normalizedPhone: passenger.normalizedPhone || passenger.phone,
    phoneVerified: passenger.phoneVerified,
    fullName: passenger.fullName || "",
    email: passenger.email || "",
    profileCompleted: passenger.profileCompleted,
    createdAt: passenger.createdAt,
    updatedAt: passenger.updatedAt,
  };
}
