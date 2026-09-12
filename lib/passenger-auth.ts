import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import {
  csrfCookieName,
  createCanonicalToken,
  hashCsrfToken,
  sessionCookieName,
  setSessionCookies,
  secureCookie,
  clearActorCookies,
  SESSION_TTL_SECONDS,
  verifyCanonicalToken,
  type CanonicalSession,
} from "@/lib/security/session";
import { verifyLegacyPassengerToken } from "@/lib/security/legacy-session";
import { isAllowedOrigin } from "@/lib/env";

export const PASSENGER_COOKIE = "drivo_passenger_token";
export const PASSENGER_SESSION_COOKIE = "drivo_passenger_session";
export const PASSENGER_DEVICE_COOKIE = "drivo_passenger_device";

const SESSION_TTL_MS = SESSION_TTL_SECONDS.PASSENGER * 1000;
const DEVICE_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const OTP_PROOF_TTL_MS = 10 * 60 * 1000;

/** Normalize a user-entered phone to E.164 using explicit country context when supplied. */
export function normalizePassengerPhone(phone: string, countryCode = "+421") {
  const raw = String(phone || "").trim();
  const compact = raw.replace(/[\s().-]/g, "");
  if (!compact) return "";
  const digits = compact.replace(/\D/g, "");
  if (!digits) return "";
  if (compact.startsWith("+")) return `+${digits}`;
  if (compact.startsWith("00")) return `+${digits.slice(2)}`;

  const context = String(countryCode || "+421").replace(/[^\d]/g, "");
  const local = digits.replace(/^0+/, "");
  if (!context || !local) return "";
  return `+${context}${local}`;
}

export function isValidE164Phone(phone: string) {
  return /^\+[1-9]\d{7,14}$/.test(phone);
}

export function normalizePassengerEmail(email: string) {
  return String(email || "").trim().toLowerCase();
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

type PassengerRecord = Awaited<ReturnType<typeof prisma.passenger.findUnique>>;

export async function createPassengerSession(passenger: {
  id: string;
  status?: string;
  authVersion?: number;
}) {
  const jti = crypto.randomUUID();
  const session = await prisma.passengerSession.create({
    data: {
      passengerId: passenger.id,
      tokenHash: hashSecret(jti),
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      lastUsedAt: new Date(),
    },
  });
  return createCanonicalToken({
    sub: passenger.id,
    actor: "PASSENGER",
    role: "PASSENGER",
    ver: passenger.authVersion ?? 0,
    sid: session.id,
    jti,
  });
}

export function setPassengerCookie(
  response: NextResponse,
  session: Awaited<ReturnType<typeof createPassengerSession>>
) {
  setSessionCookies(response, "PASSENGER", session);
}

export function clearPassengerCookies(response: NextResponse) {
  clearActorCookies(response, "PASSENGER");
}

async function loadCanonicalPassenger(token: string) {
  const payload = await verifyCanonicalToken(token, "PASSENGER");
  if (!payload?.sid || !payload.jti) return null;
  const session = await prisma.passengerSession.findFirst({
    where: {
      id: payload.sid,
      passengerId: payload.sub,
      tokenHash: hashSecret(payload.jti),
      expiresAt: { gt: new Date() },
      revokedAt: null,
    },
  });
  if (!session) return null;
  const passenger = await prisma.passenger.findUnique({ where: { id: payload.sub } });
  if (!passenger || passenger.status !== "ACTIVE" || (passenger.authVersion ?? 0) !== payload.ver) return null;
  await prisma.passengerSession.update({ where: { id: session.id }, data: { lastUsedAt: new Date() } });
  return { passenger, session: payload, legacy: false as const };
}

async function loadLegacyPassenger(token: string) {
  const payload = await verifyLegacyPassengerToken(token);
  if (!payload?.id || payload.type !== "PASSENGER" || !payload.sessionId || !payload.sessionToken) return null;
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
  const passenger = await prisma.passenger.findUnique({ where: { id: payload.id } });
  if (!passenger || passenger.status !== "ACTIVE" || (passenger.authVersion ?? 0) !== 0) return null;
  await prisma.passengerSession.update({ where: { id: session.id }, data: { lastUsedAt: new Date() } });
  return { passenger, legacy: true as const };
}

async function setUpgradedCookies(session: Awaited<ReturnType<typeof createPassengerSession>>) {
  const store = await cookies();
  const secure = secureCookie();
  store.set(sessionCookieName("PASSENGER"), session.token, {
    httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: session.expiresIn,
  });
  store.set(csrfCookieName("PASSENGER"), session.csrfToken, {
    httpOnly: false, secure, sameSite: "lax", path: "/", maxAge: session.expiresIn,
  });
}

export async function getPassengerAuth(request: NextRequest) {
  const canonical = request.cookies.get(sessionCookieName("PASSENGER"))?.value;
  if (canonical) {
    return loadCanonicalPassenger(canonical);
  }
  const legacy = request.cookies.get(PASSENGER_COOKIE)?.value;
  if (!legacy) return null;
  const authenticated = await loadLegacyPassenger(legacy);
  if (!authenticated) return null;
  const upgraded = await createPassengerSession(authenticated.passenger);
  await setUpgradedCookies(upgraded);
  return { passenger: authenticated.passenger, legacy: true as const };
}

export async function getPassengerFromRequest(request: NextRequest) {
  return (await getPassengerAuth(request))?.passenger || null;
}

export async function authorizePassenger(request: NextRequest) {
  const auth = await getPassengerAuth(request);
  if (!auth) {
    return { ok: false as const, response: NextResponse.json({ error: "Authentication required" }, { status: 401 }) };
  }
  if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method.toUpperCase())) {
    if (!isAllowedOrigin(request.headers.get("origin"))) {
      return { ok: false as const, response: NextResponse.json({ error: "Request origin is not allowed" }, { status: 403 }) };
    }
    if (auth.legacy) {
      return { ok: false as const, response: NextResponse.json({ error: "Session upgraded; retry request" }, { status: 409, headers: { "X-Drivo-Session-Upgraded": "1" } }) };
    }
    const csrfCookie = request.cookies.get(csrfCookieName("PASSENGER"))?.value;
    const csrfHeader = request.headers.get("x-drivo-csrf");
    if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader || hashCsrfToken(csrfCookie) !== auth.session.csrf) {
      return { ok: false as const, response: NextResponse.json({ error: "Invalid CSRF token" }, { status: 403 }) };
    }
  }
  return { ok: true as const, actor: auth.passenger, session: "session" in auth ? auth.session : null };
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
