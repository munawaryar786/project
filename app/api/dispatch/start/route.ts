import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authorizeAdmin } from "@/lib/security/authorization";
import { authorizePassenger } from "@/lib/passenger-auth";
import { startAutomaticDispatch } from "@/lib/automatic-dispatch";

const DispatchSchema = z.object({ bookingId: z.string().regex(/^[a-f0-9]{24}$/i) }).strict();

export async function POST(request: NextRequest) {
  const adminAuth = await authorizeAdmin(request);
  const passengerAuth = adminAuth.ok ? null : await authorizePassenger(request);
  if (!adminAuth.ok && passengerAuth && !passengerAuth.ok) return passengerAuth.response;

  const parsed = DispatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid dispatch request", code: "INVALID_REQUEST" }, { status: 400 });

  const booking = await prisma.booking.findUnique({
    where: { id: parsed.data.bookingId },
    select: { id: true, passengerId: true },
  });
  if (!booking) return NextResponse.json({ error: "Booking not found", code: "BOOKING_NOT_FOUND" }, { status: 404 });
  if (passengerAuth?.ok && booking.passengerId !== passengerAuth.actor.id) {
    return NextResponse.json({ error: "Booking not found", code: "BOOKING_NOT_FOUND" }, { status: 404 });
  }
  const activeOffer = await prisma.rideRequest.findFirst({ where: { bookingId: booking.id, status: "PENDING", expiresAt: { gt: new Date() } }, select: { id: true } });
  if (activeOffer) return NextResponse.json({ success: true, alreadyDispatched: true, dispatch: "OFFER_PENDING" });

  const result = await startAutomaticDispatch(parsed.data.bookingId);
  if (!result.ok) {
    const status = result.code === "DISPATCH_CONFIG_MISSING" ? 409
      : result.code === "BOOKING_NOT_FOUND" ? 404
      : result.code === "DISPATCH_TRANSACTION_UNAVAILABLE" ? 503
      : 409;
    return NextResponse.json({ error: "Dispatch could not start", code: result.code }, { status });
  }

  return NextResponse.json({
    success: true,
    dispatch: result.outcome,
    offerId: result.offerId,
    dispatchStatus: result.outcome === "OFFER_CREATED" || result.outcome === "OFFER_PENDING" ? "SEARCHING_DRIVER" : result.outcome,
  });
}
