import { NextRequest, NextResponse } from "next/server";
import { authorizePassenger } from "@/lib/passenger-auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const auth = await authorizePassenger(request);
  if (!auth.ok) return auth.response;
  try {
    const invoices = await prisma.bookingInvoice.findMany({
      where: { passengerId: auth.actor.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true, invoiceNumber: true, bookingRef: true, amountMinor: true,
        currency: true, status: true, billingName: true, billingAddress: true,
        billingTaxId: true, issuedAt: true, dueAt: true, paidAt: true,
        paymentReference: true,
      },
    });
    return NextResponse.json({ success: true, invoices }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ code: "INVOICE_HISTORY_UNAVAILABLE" }, { status: 503,
      headers: { "Cache-Control": "private, no-store" } });
  }
}
