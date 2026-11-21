import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getPassengerAuth } from "@/lib/passenger-auth";
import { secureCookie, sessionCookieName, LEGACY_COOKIES } from "@/lib/security/session";

export const OPERATION_RECOVERY_MS = 2 * 60 * 60 * 1000;
export const CREATED_RECOVERY_MS = 24 * 60 * 60 * 1000;
export const OPERATION_CLEANUP_MS = 7 * 24 * 60 * 60 * 1000;
export const OPERATION_LEASE_MS = 120 * 1000;
export const MAX_GUEST_OPERATIONS = 6;
export const MAX_PASSENGER_OPERATIONS = 12;
export const MAX_ADDITIVE_WINDOW_MS = 48 * 60 * 60 * 1000;
const COOKIE_PREFIX = `${secureCookie() ? "__Host-" : ""}drivo-booking-operation-`;
const OPAQUE_ID = /^[A-Za-z0-9_-]{43}$/;
const NO_STORE = "private, no-store";

export type OperationMode = "disabled" | "additive" | "mandatory" | "unavailable";
export function operationMode(): OperationMode {
  const value = process.env.DRIVO_PUBLIC_BOOKING_OPERATION_MODE;
  if (!value || value === "disabled") return "disabled";
  if (value !== "additive" && value !== "mandatory") return "unavailable";
  // A configured rollout with missing index attestation fails closed. It must
  // never silently accept unkeyed bookings as the legacy disabled mode.
  if (process.env.DRIVO_PUBLIC_BOOKING_OPERATION_INDEXES_VERIFIED !== "true") return "unavailable";
  if (value === "mandatory") return "mandatory";
  if (value === "additive") {
    // A missing/invalid launch timestamp cannot extend legacy compatibility.
    const raw = process.env.DRIVO_PUBLIC_BOOKING_ADDITIVE_STARTED_AT || "";
    const startedAt = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(raw) ? Date.parse(raw) : NaN;
    const now = Date.now();
    return Number.isFinite(startedAt) && startedAt <= now &&
      now - startedAt < MAX_ADDITIVE_WINDOW_MS ? "additive" : "mandatory";
  }
  return "unavailable";
}

export function validOperationId(value: unknown): value is string {
  return typeof value === "string" && OPAQUE_ID.test(value);
}
export function operationCookieName(id: string): string {
  if (!validOperationId(id)) throw new Error("INVALID_OPERATION_ID");
  return COOKIE_PREFIX + id;
}
export function operationCookieIds(request: NextRequest): string[] {
  return request.cookies.getAll().map(({ name }) => name.startsWith(COOKIE_PREFIX) ? name.slice(COOKIE_PREFIX.length) : "")
    .filter(validOperationId);
}
export function hashCredential(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => [key, stable(entry)]),
  );
  return value;
}
export function fingerprintBooking(input: unknown): string {
  return createHash("sha256").update(JSON.stringify(stable(input))).digest("hex");
}
export function newOperationIdentity() {
  return { id: randomBytes(32).toString("base64url"), credential: randomBytes(32).toString("base64url") };
}
export function setOperationCookie(response: NextResponse, id: string, credential: string) {
  response.cookies.set({ name: operationCookieName(id), value: credential, httpOnly: true,
    secure: secureCookie(), sameSite: "lax", path: "/", maxAge: CREATED_RECOVERY_MS / 1000 });
}
export function clearOperationCookies(response: NextResponse, request: NextRequest) {
  for (const id of operationCookieIds(request)) response.cookies.set({ name: operationCookieName(id), value: "",
    httpOnly: true, secure: secureCookie(), sameSite: "lax", path: "/", maxAge: 0 });
}
export function hasPassengerCookie(request: NextRequest) {
  return Boolean(request.cookies.get(sessionCookieName("PASSENGER")) ||
    LEGACY_COOKIES.PASSENGER.some(name => request.cookies.get(name)));
}
export async function operationActor(request: NextRequest) {
  const auth = await getPassengerAuth(request);
  if (auth) return { kind: "PASSENGER" as const, passengerId: auth.passenger.id };
  if (hasPassengerCookie(request)) return { kind: "INVALID_SESSION" as const };
  return { kind: "GUEST" as const };
}
export async function authorizedOperation(request: NextRequest, id: string) {
  if (!validOperationId(id)) return null;
  const operation = await prisma.publicBookingOperation.findUnique({ where: { id } });
  if (!operation || operation.revokedAt) return null;
  const actor = await operationActor(request);
  if (actor.kind === "PASSENGER" && operation.scope === "PASSENGER" && operation.passengerId === actor.passengerId) return operation;
  if (actor.kind !== "GUEST" || operation.scope !== "GUEST") return null;
  const credential = request.cookies.get(operationCookieName(id))?.value;
  if (!credential || !OPAQUE_ID.test(credential) || !operation.guestCredentialHash ||
      !/^[0-9a-f]{64}$/.test(operation.guestCredentialHash) ||
      !timingSafeEqual(Buffer.from(hashCredential(credential), "hex"), Buffer.from(operation.guestCredentialHash, "hex"))) return null;
  return operation;
}
export function recoveryDeadline(operation: { issuedAt: Date; state: string }): Date {
  return new Date(operation.issuedAt.getTime() + (operation.state === "CREATED" ? CREATED_RECOVERY_MS : OPERATION_RECOVERY_MS));
}
export function operationExpired(operation: { issuedAt: Date; state: string }, now = new Date()) {
  return recoveryDeadline(operation).getTime() <= now.getTime();
}
export function privateResponse(response: NextResponse) {
  response.headers.set("Cache-Control", NO_STORE);
  return response;
}

// Only an untouched or definitively pre-transaction-failed operation can be
// claimed. An expired PROCESSING lease is still an unknown transaction result
// and cannot be retried merely because the clock advanced.
export async function claimOperation(id: string, fingerprint: string) {
  const now = new Date();
  const token = randomUUID();
  const leaseUntil = new Date(now.getTime() + OPERATION_LEASE_MS);
  const claimed = await prisma.publicBookingOperation.updateMany({ where: {
    id, revokedAt: null, bookingId: null, recoveryExpiresAt: { gt: now },
    OR: [{ state: "RESERVED" }, { state: "RETRYABLE" }],
    AND: [{ OR: [{ requestFingerprint: null }, { requestFingerprint: fingerprint }] }],
  }, data: { state: "PROCESSING", requestFingerprint: fingerprint, leaseToken: token, leaseUntil } });
  return claimed.count === 1 ? token : null;
}

// Called only at a successful account transition. Revocation is fenced by the
// exact incoming cookie hashes; unrelated guest grants are never modified.
export async function revokeGuestOperations(request: NextRequest, db: Pick<Prisma.TransactionClient, "publicBookingOperation"> = prisma) {
  const ids = operationCookieIds(request);
  if (!ids.length) return { unresolved: false, committed: false };
  let unresolved = false;
  let committed = false;
  for (const id of ids) {
    const credential = request.cookies.get(operationCookieName(id))?.value;
    if (!credential || !OPAQUE_ID.test(credential)) continue;
    const operation = await db.publicBookingOperation.findUnique({ where: { id } });
    if (!operation || operation.scope !== "GUEST" || operation.guestCredentialHash !== hashCredential(credential)) continue;
    if (["PROCESSING", "CREATING"].includes(operation.state)) unresolved = true;
    if (operation.state === "CREATED" && operation.bookingId) committed = true;
    if (operation.state === "CREATED" && !operation.bookingId) unresolved = true;
    await db.publicBookingOperation.updateMany({ where: { id, scope: "GUEST", guestCredentialHash: hashCredential(credential), revokedAt: null },
      data: { revokedAt: new Date() } });
  }
  return { unresolved, committed };
}

// Authentication must not trap a passenger if reconciliation storage is
// temporarily unavailable. The browser credential is still cleared, and the
// caller receives a bounded warning requiring support review. A timed-out
// revocation is never represented as confirmed server-side revocation.
export async function finishGuestOperationTransition(request: NextRequest, response: NextResponse) {
  if (!operationCookieIds(request).length) return response;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      revokeGuestOperations(request),
      new Promise<null>(resolve => { timeout = setTimeout(() => resolve(null), 2500); }),
    ]);
    if (!result) {
      response.headers.set("X-Drivo-Booking-Recovery", "RECOVERY_UNAVAILABLE");
      return privateResponse(response);
    }
    if (result.committed && result.unresolved) response.headers.set("X-Drivo-Booking-Recovery", "MULTIPLE_REVIEW");
    else if (result.committed) response.headers.set("X-Drivo-Booking-Recovery", "BOOKING_CREATED");
    else if (result.unresolved) response.headers.set("X-Drivo-Booking-Recovery", "OUTCOME_UNKNOWN");
  } catch {
    response.headers.set("X-Drivo-Booking-Recovery", "RECOVERY_UNAVAILABLE");
  } finally {
    if (timeout) clearTimeout(timeout);
    clearOperationCookies(response, request);
  }
  return privateResponse(response);
}
