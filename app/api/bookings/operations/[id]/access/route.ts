import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createPublicBookingAccess, PUBLIC_BOOKING_ACCESS_PURPOSE, setPublicBookingAccessCookie } from "@/lib/booking-access";
import { isAllowedOrigin } from "@/lib/env";
import { authRateLimitResponse, enforceAuthRateLimit, resolveClientIp } from "@/lib/rate-limit";
import { authorizedOperation, operationExpired, operationMode, privateResponse, validOperationId } from "@/lib/public-booking-operation";

export const runtime = "nodejs";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!isAllowedOrigin(request.headers.get("origin"))) return privateResponse(NextResponse.json({ code: "ORIGIN_REJECTED" }, { status: 403 }));
  const limit = await enforceAuthRateLimit({ domain: "public-booking-access-recovery", identities: [
    { dimension: "ip", value: resolveClientIp(request), max: 12, windowMs: 15 * 60 * 1000 },
  ] });
  if (!limit.allowed) return privateResponse(authRateLimitResponse(limit));
  const mode = operationMode();
  if (mode === "disabled" || mode === "unavailable") return privateResponse(NextResponse.json({ code: "BOOKING_RECOVERY_UNAVAILABLE" }, { status: 503 }));
  const { id } = await context.params;
  if (!validOperationId(id)) return privateResponse(NextResponse.json({ code: "BOOKING_OPERATION_UNAVAILABLE" }, { status: 404 }));
  try {
    const operation = await authorizedOperation(request, id);
    if (!operation || !["GUEST", "PASSENGER"].includes(operation.scope) || operation.state !== "CREATED" || !operation.bookingId || operationExpired(operation)) {
      return privateResponse(NextResponse.json({ code: "BOOKING_OPERATION_UNAVAILABLE" }, { status: 404 }));
    }
    const grant = await prisma.$transaction(async tx => {
      const fresh = await tx.publicBookingOperation.findUnique({ where: { id } });
      if (!fresh || fresh.revokedAt || fresh.state !== "CREATED" || fresh.bookingId !== operation.bookingId || operationExpired(fresh)) return null;
      const booking = await tx.booking.findUnique({ where: { id: fresh.bookingId! } });
      if (!booking || booking.bookingSource === "PHONE_DISPATCH" || booking.passengerId ||
          ["CANCELLED", "COMPLETED", "NO_SHOW"].includes(booking.status)) return null;
      const latestExpiry = new Date(Math.min(fresh.issuedAt.getTime(), booking.createdAt.getTime()) + 24 * 60 * 60 * 1000);
      if (latestExpiry.getTime() <= Date.now()) return null;
      const reserved = await tx.publicBookingOperation.updateMany({ where: { id, state: "CREATED",
        accessVersion: fresh.accessVersion, revokedAt: null, bookingId: booking.id },
        data: { accessVersion: { increment: 1 } } });
      if (reserved.count !== 1) return null;
      // Only earlier grants issued by this operation are replaced. The original
      // booking capability and unrelated grants are not changed.
      await tx.passengerVerificationProof.updateMany({ where: { bookingId: booking.id,
        purpose: PUBLIC_BOOKING_ACCESS_PURPOSE, loginAttemptId: id, consumedAt: null },
        data: { consumedAt: new Date() } });
      const issued = await createPublicBookingAccess(tx, booking, latestExpiry, id);
      return { bookingId: booking.id, bookingRef: booking.bookingRef, issued };
    });
    if (!grant) return privateResponse(NextResponse.json({ code: "BOOKING_OPERATION_UNAVAILABLE" }, { status: 404 }));
    const response = privateResponse(NextResponse.json({ bookingId: grant.bookingId, bookingRef: grant.bookingRef }));
    setPublicBookingAccessCookie(response, grant.bookingId, grant.issued);
    return response;
  } catch {
    return privateResponse(NextResponse.json({ code: "BOOKING_RECOVERY_UNAVAILABLE" }, { status: 503 }));
  }
}
