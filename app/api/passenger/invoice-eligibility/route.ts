import { NextRequest, NextResponse } from "next/server";
import { authorizePassenger } from "@/lib/passenger-auth";
import { prisma } from "@/lib/prisma";

const headers = { "Cache-Control": "private, no-store" };

export async function GET(request: NextRequest) {
  const auth = await authorizePassenger(request);
  if (!auth.ok) return auth.response;
  if (!auth.actor.phoneVerified || auth.actor.status !== "ACTIVE")
    return NextResponse.json({ eligible: false, code: "INVOICE_NOT_APPROVED" }, { headers });
  try {
    const account = await prisma.invoiceBillingAccount.findUnique({
      where: { passengerId: auth.actor.id },
      select: { status: true, billingName: true },
    });
    return NextResponse.json({
      eligible: account?.status === "APPROVED",
      code: account?.status === "APPROVED" ? "INVOICE_APPROVED" : "INVOICE_NOT_APPROVED",
      billingName: account?.status === "APPROVED" ? account.billingName : undefined,
      termsDays: account?.status === "APPROVED" ? 30 : undefined,
    }, { headers });
  } catch {
    return NextResponse.json({ eligible: false, code: "ELIGIBILITY_UNAVAILABLE" }, { status: 503, headers });
  }
}
