import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizedOperation, operationExpired, operationMode, privateResponse, validOperationId } from "@/lib/public-booking-operation";
import { authRateLimitResponse, enforceAuthRateLimit, resolveClientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";

async function status(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const mode = operationMode();
  if (mode === "disabled" || mode === "unavailable") return privateResponse(NextResponse.json({ code: "BOOKING_RECOVERY_UNAVAILABLE" }, { status: 503 }));
  const { id } = await context.params;
  if (!validOperationId(id)) return privateResponse(NextResponse.json({ code: "BOOKING_OPERATION_UNAVAILABLE" }, { status: 404 }));
  try {
    const operation = await authorizedOperation(request, id);
    if (!operation) return privateResponse(NextResponse.json({ code: "BOOKING_OPERATION_UNAVAILABLE" }, { status: 404 }));
    if (operationExpired(operation)) return privateResponse(NextResponse.json({ state: "EXPIRED" }, { status: 410 }));
    if (operation.state === "CREATED" && operation.bookingId) {
      const booking = await prisma.booking.findUnique({ where: { id: operation.bookingId }, select: { id: true, bookingRef: true, passengerId: true } });
      if (!booking || (operation.scope === "PASSENGER" && booking.passengerId && booking.passengerId !== operation.passengerId) ||
          (operation.scope === "GUEST" && booking.passengerId)) {
        return privateResponse(NextResponse.json({ state: "RECOVERY_UNAVAILABLE" }, { status: 503 }));
      }
      return privateResponse(NextResponse.json({ state: "CREATED", bookingId: booking.id, bookingRef: booking.bookingRef,
        guestAccessRecoveryRequired: !booking.passengerId }));
    }
    return privateResponse(NextResponse.json({ state: operation.state === "RETRYABLE" ? "RETRYABLE" : "PROCESSING" }, { status: 202 }));
  } catch {
    return privateResponse(NextResponse.json({ state: "RECOVERY_UNAVAILABLE" }, { status: 503 }));
  }
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const limit = await enforceAuthRateLimit({ domain: "public-booking-operation-status", identities: [
    { dimension: "ip", value: resolveClientIp(request), max: 40, windowMs: 15 * 60 * 1000 },
  ] });
  if (!limit.allowed) return privateResponse(authRateLimitResponse(limit));
  return status(request, context);
}
