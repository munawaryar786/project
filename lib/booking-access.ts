import { createHash, randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { secureCookie } from "@/lib/security/session";
import { writeBookingActivationIntent } from "@/lib/booking-activation";

// Reuse the existing hashed capability store. This purpose is never accepted as
// an OTP, registration, login or password-reset proof.
export const PUBLIC_BOOKING_ACCESS_PURPOSE = "PUBLIC_BOOKING_ACCESS";
export const BOOKING_ACCESS_TTL_MS = 24 * 60 * 60 * 1000;
type AccessDb = Pick<Prisma.TransactionClient, "passengerVerificationProof" | "booking" | "outboxEvent">;
type PublicBooking = { id: string; bookingSource?: string; passengerId?: string | null; status: string; normalizedPhone?: string | null; paymentMethod?: string };
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
export const validBookingId = (value: string) => /^[a-f0-9]{24}$/i.test(value);
export function bookingAccessCookieName(bookingId: string) {
  if (!validBookingId(bookingId)) throw new Error("INVALID_BOOKING_ID");
  return `${secureCookie() ? "__Host-" : ""}drivo-booking-access-${bookingId.toLowerCase()}`;
}
export async function createPublicBookingAccess(tx: AccessDb, booking: PublicBooking, latestExpiry?: Date, recoveryOperationId?: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Math.min(Date.now() + BOOKING_ACCESS_TTL_MS, latestExpiry?.getTime() ?? Number.POSITIVE_INFINITY));
  await tx.passengerVerificationProof.create({ data: {
    purpose: PUBLIC_BOOKING_ACCESS_PURPOSE, bookingId: booking.id,
    normalizedPhone: booking.normalizedPhone || "", proofTokenHash: hash(token), expiresAt,
    ...(recoveryOperationId ? { loginAttemptId: recoveryOperationId } : {}),
    consumedAt: null,
  } });
  return { token, expiresAt };
}
export function setPublicBookingAccessCookie(response: NextResponse, bookingId: string, grant: { token: string; expiresAt: Date }) {
  response.cookies.set({ name: bookingAccessCookieName(bookingId), value: grant.token,
    httpOnly: true, secure: secureCookie(), sameSite: "lax", path: "/", expires: grant.expiresAt });
}
export async function publicBookingAccess(request: NextRequest, booking: PublicBooking, passengerId?: string, db: AccessDb = prisma) {
  if (!validBookingId(booking.id) || booking.bookingSource === "PHONE_DISPATCH" ||
      ["CANCELLED", "COMPLETED", "NO_SHOW"].includes(booking.status)) return { allowed: false as const };
  // Ownership wins over a browser capability. A stale guest cookie can never
  // reassign a booking after it belongs to an account.
  if (booking.passengerId) return { allowed: booking.passengerId === passengerId, grantId: null };
  const token = request.cookies.get(bookingAccessCookieName(booking.id))?.value;
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return { allowed: false as const };
  const grant = await db.passengerVerificationProof.findFirst({ where: {
    proofTokenHash: hash(token), purpose: PUBLIC_BOOKING_ACCESS_PURPOSE,
    bookingId: booking.id, consumedAt: null, expiresAt: { gt: new Date() },
  } });
  return { allowed: Boolean(grant), grantId: grant?.id || null };
}
export async function bindPublicBookingOwner(tx: AccessDb, request: NextRequest, booking: PublicBooking, passengerId: string) {
  const access = await publicBookingAccess(request, booking, passengerId, tx);
  if (!access.allowed) throw new Error("BOOKING_ACCESS_DENIED");
  const changed = await tx.booking.updateMany({ where: {
    id: booking.id, status: booking.status, bookingSource: { not: "PHONE_DISPATCH" },
    ...(booking.passengerId ? { passengerId } : { OR: [{ passengerId: null }, { passengerId: { isSet: false } }] }),
  }, data: { passengerId, phoneVerified: true, passengerAuthStatus: "AUTHENTICATED", passengerAuthCompletedAt: new Date() } });
  if (changed.count !== 1) throw new Error("BOOKING_ACCESS_CONFLICT");
  if (access.grantId) {
    const consumed = await tx.passengerVerificationProof.updateMany({ where: {
      id: access.grantId, consumedAt: null, expiresAt: { gt: new Date() },
    }, data: { consumedAt: new Date() } });
    if (consumed.count !== 1) throw new Error("BOOKING_ACCESS_CONFLICT");
  }
  if (booking.paymentMethod === "CASH") await writeBookingActivationIntent(tx, booking.id);
}
