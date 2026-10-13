import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAllowedOrigin } from "@/lib/env";
import { authorizePassenger } from "@/lib/passenger-auth";
import { authRateLimitResponse, enforceAuthRateLimit, resolveClientIp } from "@/lib/rate-limit";
import { MAX_GUEST_OPERATIONS, MAX_PASSENGER_OPERATIONS, OPERATION_CLEANUP_MS,
  OPERATION_RECOVERY_MS, hasPassengerCookie, hashCredential, newOperationIdentity,
  operationCookieIds, operationMode, operationActor, privateResponse, setOperationCookie } from "@/lib/public-booking-operation";

export const runtime = "nodejs";

async function preflight(request: NextRequest) {
  if (!isAllowedOrigin(request.headers.get("origin"))) return privateResponse(NextResponse.json({ code: "ORIGIN_REJECTED" }, { status: 403 }));
  const mode = operationMode();
  if (mode === "disabled") return privateResponse(NextResponse.json({ mode }));
  if (mode === "unavailable") return privateResponse(NextResponse.json({ code: "BOOKING_RECOVERY_UNAVAILABLE" }, { status: 503 }));
  try {
    const actor = await operationActor(request);
    if (actor.kind === "INVALID_SESSION" || (hasPassengerCookie(request) && actor.kind !== "PASSENGER")) {
      return privateResponse(NextResponse.json({ code: "AUTHENTICATION_REQUIRED" }, { status: 401 }));
    }
    if (actor.kind === "PASSENGER") {
      const auth = await authorizePassenger(request);
      if (!auth.ok) return privateResponse(auth.response);
      const active = await prisma.publicBookingOperation.count({ where: { passengerId: actor.passengerId,
        state: { in: ["RESERVED", "PROCESSING", "RETRYABLE", "CREATED"] }, revokedAt: null,
        recoveryExpiresAt: { gt: new Date() } } });
      if (active >= MAX_PASSENGER_OPERATIONS) return privateResponse(NextResponse.json({ code: "BOOKING_OPERATION_LIMIT" }, { status: 429 }));
    } else if (operationCookieIds(request).length >= MAX_GUEST_OPERATIONS ||
               (request.headers.get("cookie")?.length || 0) > 6000) {
      return privateResponse(NextResponse.json({ code: "BOOKING_OPERATION_LIMIT" }, { status: 429 }));
    }
    const { id, credential } = newOperationIdentity();
    const issuedAt = new Date();
    await prisma.publicBookingOperation.create({ data: {
      id, scope: actor.kind === "PASSENGER" ? "PASSENGER" : "GUEST",
      passengerId: actor.kind === "PASSENGER" ? actor.passengerId : null,
      guestCredentialHash: actor.kind === "GUEST" ? hashCredential(credential) : null,
      requestFingerprint: null, state: "RESERVED", leaseToken: "", leaseUntil: null,
      bookingId: null, issuedAt,
      recoveryExpiresAt: new Date(issuedAt.getTime() + OPERATION_RECOVERY_MS),
      cleanupAt: new Date(issuedAt.getTime() + OPERATION_CLEANUP_MS), revokedAt: null,
    } });
    const response = privateResponse(NextResponse.json({ operationId: id, mode, expiresAt: new Date(issuedAt.getTime() + OPERATION_RECOVERY_MS).toISOString() }, { status: 201 }));
    if (actor.kind === "GUEST") setOperationCookie(response, id, credential);
    return response;
  } catch {
    return privateResponse(NextResponse.json({ code: "BOOKING_RECOVERY_UNAVAILABLE" }, { status: 503 }));
  }
}

export async function POST(request: NextRequest) {
  // Disabled rollout must preserve the old booking path's availability; it
  // cannot add a Redis dependency before returning legacy mode.
  if (operationMode() === "disabled") return preflight(request);
  const limit = await enforceAuthRateLimit({ domain: "public-booking-operation-preflight", identities: [
    { dimension: "ip", value: resolveClientIp(request), max: 12, windowMs: 15 * 60 * 1000 },
  ] });
  if (!limit.allowed) return privateResponse(authRateLimitResponse(limit));
  return preflight(request);
}
