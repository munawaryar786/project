import { createHash, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authorizeDispatchOperator } from "@/lib/security/authorization";
import { DispatchBookingSchema, BookingCreateError, createBookingWithDrivoRules } from "@/lib/booking-creation-service";
import { normalizePassengerPhone } from "@/lib/passenger-auth";
import { withDistributedIpRateLimit } from "@/lib/rate-limit";
import { hashDispatchIdempotencyKey } from "@/lib/dispatch-invariants";

const KeySchema = z.string().uuid();
const take = 30;

export async function GET(request: NextRequest) {
  const auth = await authorizeDispatchOperator(request); if (!auth.ok) return auth.response;
  const params = request.nextUrl.searchParams;
  const q = (params.get("q") || "").trim().slice(0, 120);
  const status = params.get("status") || "";
  const mine = params.get("mine") === "true";
  const page = Math.max(0, Math.min(1000, Number.parseInt(params.get("page") || "0", 10) || 0));
  const normalizedPhone = q ? normalizePassengerPhone(q) : "";
  const where: any = { bookingSource: "PHONE_DISPATCH", ...(mine ? { createdByDispatchOperatorId: auth.actor.id } : {}), ...(status ? { status } : {}), ...(q ? { OR: [{ bookingRef: { contains: q, mode: "insensitive" } }, ...(normalizedPhone ? [{ normalizedPhone }] : [])] } : {}) };
  try {
    const bookings = await prisma.booking.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: page * take, take: take + 1, select: { id: true, bookingRef: true, status: true, dispatchStatus: true, serviceType: true, customerName: true, customerPhone: true, customerPhoneCode: true, normalizedPhone: true, customerEmail: true, pickupAddress: true, dropoffAddress: true, scheduledDate: true, scheduledTime: true, scheduledRide: true, pickupAt: true, paymentMethod: true, estimatedPrice: true, fareTotalFare: true, createdAt: true, driverId: true, createdByDispatchOperatorId: true } });
    const hasMore = bookings.length > take; const rows = bookings.slice(0, take);
    const payments = rows.length ? await prisma.bookingPayment.findMany({ where: { bookingId: { in: rows.map((booking) => booking.id) } }, orderBy: { createdAt: "desc" } }) : [];
    const paymentByBooking = new Map<string, any>(); for (const payment of payments) if (!paymentByBooking.has(payment.bookingId)) paymentByBooking.set(payment.bookingId, payment);
    return NextResponse.json({ bookings: rows.map((booking) => ({ ...booking, customerPhone: `${booking.customerPhoneCode}${booking.customerPhone}`, payment: safePayment(paymentByBooking.get(booking.id), booking.paymentMethod) })), page, hasMore }, { headers: { "Cache-Control": "private, no-store" } });
  } catch { return NextResponse.json({ error: "Could not load Dispatch bookings" }, { status: 503 }); }
}

function safePayment(payment: any, method: string) {
  if (method === "CASH") return { method, status: "PAY_ON_RIDE" };
  if (method === "INVOICE") return { method, status: "INVOICE" };
  return { method, status: payment?.status || "PENDING", expiresAt: payment?.expiresAt || null, paidAt: payment?.paidAt || null };
}

async function createPhoneBooking(request: NextRequest) {
  const auth = await authorizeDispatchOperator(request); if (!auth.ok) return auth.response;
  const idempotencyKey = KeySchema.safeParse(request.headers.get("idempotency-key"));
  if (!idempotencyKey.success) return NextResponse.json({ error: "A UUID idempotency key is required" }, { status: 400 });
  const input = await request.json().catch(() => null);
  const parsed = DispatchBookingSchema.safeParse(input);
  if (!parsed.success) return NextResponse.json({ error: "Invalid Phone Booking details", details: parsed.error.flatten().fieldErrors }, { status: 400 });
  const keyHash = hashDispatchIdempotencyKey(idempotencyKey.data);
  let requestRow: any; let leaseToken = randomUUID();
  try {
    requestRow = await prisma.dispatchBookingRequest.create({ data: { dispatchOperatorId: auth.actor.id, idempotencyKeyHash: keyHash, leaseToken, status: "PROCESSING" } });
  } catch (error: any) {
    if (error?.code !== "P2002") return NextResponse.json({ error: "Booking request could not be reserved" }, { status: 503 });
    const existing = await prisma.dispatchBookingRequest.findFirst({ where: { dispatchOperatorId: auth.actor.id, idempotencyKeyHash: keyHash } });
    if (!existing) return NextResponse.json({ error: "Booking request is being processed" }, { status: 409 });
    if (existing.bookingId) {
      const booking = await prisma.booking.findFirst({ where: { id: existing.bookingId, bookingSource: "PHONE_DISPATCH" }, select: { id: true, bookingRef: true, status: true, paymentMethod: true, estimatedPrice: true, scheduledRide: true } });
      return booking ? NextResponse.json({ success: true, duplicate: true, booking }) : NextResponse.json({ error: "Booking request result is unavailable" }, { status: 503 });
    }
    const staleBefore = new Date(Date.now() - 2 * 60 * 1000);
    if (existing.status === "PROCESSING" && existing.updatedAt < staleBefore) {
      leaseToken = randomUUID();
      const claimed = await prisma.dispatchBookingRequest.updateMany({ where: { id: existing.id, status: "PROCESSING", bookingId: null, leaseToken: existing.leaseToken, updatedAt: existing.updatedAt }, data: { leaseToken } });
      if (claimed.count === 1) requestRow = { ...existing, leaseToken };
    }
    if (!requestRow) return NextResponse.json({ success: false, processing: true, requestId: existing.id }, { status: 202 });
  }
  try {
    const result = await createBookingWithDrivoRules(request, parsed.data as any, { kind: "DISPATCH_OPERATOR", operatorId: auth.actor.id }, { requestRecordId: requestRow.id, requestLeaseToken: leaseToken });
    return NextResponse.json({ success: true, booking: { id: result.booking.id, bookingRef: result.booking.bookingRef, status: result.booking.status, dispatchStatus: result.booking.dispatchStatus, paymentMethod: result.booking.paymentMethod, estimatedPrice: result.booking.estimatedPrice, scheduledRide: result.booking.scheduledRide, fareBreakdown: result.booking.fareBreakdown } }, { status: 201 });
  } catch (error: any) {
    await prisma.dispatchBookingRequest.deleteMany({ where: { id: requestRow.id, bookingId: null, status: "PROCESSING", leaseToken } }).catch(() => undefined);
    if (error instanceof BookingCreateError) return error.response || NextResponse.json({ error: error.message, ...(error.code ? { code: error.code } : {}) }, { status: error.status });
    console.error("[dispatch.booking.create.failed]", { category: error instanceof Error ? error.name : "unknown" });
    return NextResponse.json({ error: "Phone Booking could not be created" }, { status: 503 });
  }
}

export const POST = withDistributedIpRateLimit(createPhoneBooking, { domain: "dispatch-booking-create", max: 20, windowMs: 15 * 60 * 1000 });
