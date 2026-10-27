import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdminRole } from "@/lib/security/authorization";

const oid = z.string().regex(/^[a-f0-9]{24}$/i);
const update = z.discriminatedUnion("action", [
  z.object({ action: z.literal("APPROVE"), passengerId: oid,
    billingName: z.string().trim().min(2).max(160),
    billingAddress: z.string().trim().min(10).max(500),
    billingTaxId: z.string().trim().max(64).optional() }).strict(),
  z.object({ action: z.literal("REVOKE"), passengerId: oid,
    reason: z.string().trim().min(3).max(300) }).strict(),
  z.object({ action: z.literal("MARK_PAID"), invoiceId: oid,
    paymentReference: z.string().trim().min(3).max(120) }).strict(),
  z.object({ action: z.literal("VOID"), invoiceId: oid,
    reason: z.string().trim().min(3).max(300) }).strict(),
]);
const headers = { "Cache-Control": "private, no-store" };

export async function GET(request: NextRequest) {
  const auth = await requireAdminRole(request, ["SUPER_ADMIN"]);
  if (!auth.ok) return auth.response;
  const q = (request.nextUrl.searchParams.get("q") || "").trim().slice(0,80);
  try {
    const [accounts, invoices, passengers] = await Promise.all([
      prisma.invoiceBillingAccount.findMany({ orderBy: { updatedAt: "desc" }, take: 100 }),
      prisma.bookingInvoice.findMany({ orderBy: { createdAt: "desc" }, take: 100 }),
      q.length >= 3 ? prisma.passenger.findMany({
        where: { OR: [
          { phone: { contains: q } },
          { normalizedPhone: { contains: q } },
          { email: { contains: q.toLowerCase() } },
        ] },
        select: { id: true, fullName: true, email: true, phone: true, phoneVerified: true, status: true },
        take: 20,
      }) : Promise.resolve([]),
    ]);
    const ids = [...new Set([...accounts.map(x=>x.passengerId),...invoices.map(x=>x.passengerId)])];
    const owners = ids.length ? await prisma.passenger.findMany({
      where: { id: { in: ids } },
      select: { id: true, fullName: true, phone: true, email: true },
    }) : [];
    return NextResponse.json({ accounts, invoices, passengers, owners }, { headers });
  } catch {
    return NextResponse.json({ error: "Invoice management temporarily unavailable" }, { status: 503, headers });
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdminRole(request, ["SUPER_ADMIN"]);
  if (!auth.ok) return auth.response;
  const parsed = update.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ code: "INVALID_INVOICE_ACTION" }, { status: 400, headers });
  const data = parsed.data;
  try {
    const result = await prisma.$transaction(async (tx) => {
      if (data.action === "APPROVE") {
        const passenger = await tx.passenger.findUnique({ where: { id: data.passengerId },
          select: { id: true, phoneVerified: true, status: true } });
        if (!passenger || !passenger.phoneVerified || passenger.status !== "ACTIVE")
          return { ok: false as const, code: "VERIFIED_ACTIVE_PASSENGER_REQUIRED" };
        const account = await tx.invoiceBillingAccount.upsert({
          where: { passengerId: passenger.id },
          create: { passengerId: passenger.id, status: "APPROVED",
            billingName: data.billingName, billingAddress: data.billingAddress,
            billingTaxId: data.billingTaxId || null, approvedByAdminId: auth.actor.id,
            approvedAt: new Date() },
          update: { status: "APPROVED", billingName: data.billingName,
            billingAddress: data.billingAddress, billingTaxId: data.billingTaxId || null,
            approvedByAdminId: auth.actor.id, approvedAt: new Date(),
            revokedByAdminId: null, revokedAt: null },
        });
        await tx.adminAuditEvent.create({ data: {
          adminId: auth.actor.id, action: "INVOICE_APPROVED",
          targetType: "Passenger", targetId: passenger.id,
          reason: "Admin authorised invoice billing", requestId: randomUUID(), outcome: "SUCCESS",
          safeMetadata: { accountId: account.id },
        } });
        return { ok: true as const };
      }
      if (data.action === "REVOKE") {
        const changed = await tx.invoiceBillingAccount.updateMany({
          where: { passengerId: data.passengerId, status: "APPROVED" },
          data: { status: "REVOKED", revokedByAdminId: auth.actor.id, revokedAt: new Date() },
        });
        if (!changed.count) return { ok: false as const, code: "ACTIVE_APPROVAL_NOT_FOUND" };
        await tx.adminAuditEvent.create({ data: {
          adminId: auth.actor.id, action: "INVOICE_REVOKED",
          targetType: "Passenger", targetId: data.passengerId,
          reason: data.reason, requestId: randomUUID(), outcome: "SUCCESS",
        } });
        return { ok: true as const };
      }
      const invoice = await tx.bookingInvoice.findUnique({ where: { id: data.invoiceId } });
      if (!invoice || invoice.status !== "ISSUED") return { ok: false as const, code: "INVOICE_NOT_OPEN" };
      if (data.action === "MARK_PAID") {
        const changed = await tx.bookingInvoice.updateMany({
          where: { id: invoice.id, status: "ISSUED" },
          data: { status: "PAID", paidAt: new Date(), paidByAdminId: auth.actor.id,
            paymentReference: data.paymentReference },
        });
        if (!changed.count) return { ok: false as const, code: "INVOICE_NOT_OPEN" };
        await tx.adminAuditEvent.create({ data: {
          adminId: auth.actor.id, action: "INVOICE_PAID",
          targetType: "BookingInvoice", targetId: invoice.id, reason: "Payment recorded by admin",
          requestId: randomUUID(), outcome: "SUCCESS", safeMetadata: { invoiceNumber: invoice.invoiceNumber },
        } });
        return { ok: true as const };
      }
      const booking = await tx.booking.findUnique({ where: { id: invoice.bookingId }, select: { status: true } });
      if (!booking || booking.status !== "CANCELLED")
        return { ok: false as const, code: "ONLY_CANCELLED_BOOKING_CAN_VOID" };
      const changed = await tx.bookingInvoice.updateMany({
        where: { id: invoice.id, status: "ISSUED" },
        data: { status: "VOID", voidedAt: new Date(),
          voidedByAdminId: auth.actor.id, voidReason: data.reason },
      });
      if (!changed.count) return { ok: false as const, code: "INVOICE_NOT_OPEN" };
      await tx.adminAuditEvent.create({ data: {
        adminId: auth.actor.id, action: "INVOICE_VOID",
        targetType: "BookingInvoice", targetId: invoice.id, reason: data.reason,
        requestId: randomUUID(), outcome: "SUCCESS",
      } });
      return { ok: true as const };
    });
    return NextResponse.json(result, { status: result.ok ? 200 : 409, headers });
  } catch {
    return NextResponse.json({ code: "INVOICE_ACTION_UNAVAILABLE" }, { status: 503, headers });
  }
}
