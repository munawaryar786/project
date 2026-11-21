import { randomUUID } from "node:crypto";
import { assignAdminDriver } from "@/lib/admin-operations";
import { authorizeAdmin, authorizeBookingOperationsAdmin } from "@/lib/security/authorization";
import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { scheduleScheduledRideJobs } from "@/lib/scheduled-marketplace";
import {
  calculateBookingFinancialBreakdown,
} from "@/lib/commission-engine";

const AdminBookingPatchSchema = z.object({
  bookingId: z.string().regex(/^[a-f0-9]{24}$/i),
  status: z.enum(["PENDING", "CONFIRMED", "ASSIGNED", "DRIVER_ENROUTE", "IN_PROGRESS", "COMPLETED", "CANCELLED", "NO_SHOW"]).optional(),
  driverId: z.string().regex(/^[a-f0-9]{24}$/i).optional(),
  requestId: z.string().uuid().optional(),
  reason: z.string().trim().min(3).max(500).optional(),
}).strict();

const adminBookingInclude = {
  driver: { omit: { passwordHash: true, authVersion: true } },
  earning: true,
  passenger: {
    omit: { passwordHash: true, authVersion: true },
    include: {
      bookings: {
        select: { id: true },
      },
    },
  },
} satisfies Prisma.BookingInclude;

const bookingFinancialInclude = {
  driver: { omit: { passwordHash: true, authVersion: true } },
  earning: true,
} satisfies Prisma.BookingInclude;

type AdminBookingWithRelations = Prisma.BookingGetPayload<{
  include: typeof adminBookingInclude;
}>;

type BookingWithFinancialRelations = Prisma.BookingGetPayload<{
  include: typeof bookingFinancialInclude;
}>;

type BookingForFinancialBreakdown =
  | AdminBookingWithRelations
  | BookingWithFinancialRelations;

async function withFinancialBreakdown(
  booking: BookingForFinancialBreakdown | null | undefined
) {
  if (!booking) return null;

  const { earning, driver } = booking;

  if (earning) {
    return {
      ...booking,
      financialBreakdown: {
        totalFare: Number(earning.totalFare || 0),
        platformCommission: Number(earning.platformAmount || 0),
        platformEarnings: Number(earning.platformAmount || 0),
        driverEarnings: Number(earning.driverAmount || 0),
        serviceType: booking.serviceType || "UNKNOWN",
        commissionPercentageUsed: Number(earning.commissionRate || 0),
        commissionSource: "EARNING",
        commissionSourceId: earning.id,
      },
    };
  }

  const financialBreakdown = await calculateBookingFinancialBreakdown({
    driverId: booking.driverId,
    fleetId: null,
    serviceType: booking.serviceType,
    fareTotalFare: booking.fareTotalFare,
    estimatedPrice: booking.estimatedPrice,
  });

  return {
    ...booking,
    financialBreakdown,
  };
}

export async function GET(request: NextRequest) {
  const auth = await authorizeAdmin(request);
  if (!auth.ok) return auth.response;
  try {
    const bookings = await prisma.booking.findMany({
      orderBy: { createdAt: "desc" },
      include: adminBookingInclude,
      take: 100,
    });
    const bookingsWithFinancials = (
      await Promise.all(bookings.map(withFinancialBreakdown))
    ).filter((booking) => booking !== null);

    return NextResponse.json({
      success: true,
      bookings: bookingsWithFinancials,
      total: bookingsWithFinancials.length,
    });
  } catch (error) {
    console.error("Ã¢ÂÅ’ Admin bookings fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch bookings" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await authorizeBookingOperationsAdmin(request);
  if (!auth.ok) return auth.response;
  const parsed = AdminBookingPatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid booking update" }, { status: 400 });
  const { bookingId, driverId, status } = parsed.data;
  if (!driverId || (status && status !== "ASSIGNED")) return NextResponse.json({ error: "Use an authoritative booking action", code: "STATUS_ACTION_REQUIRES_DOMAIN_ENDPOINT" }, { status: 409 });
  const requestId = parsed.data.requestId || randomUUID();
  const result = await assignAdminDriver({ bookingId, driverId, requestId, reason: parsed.data.reason || "Assignment from Admin booking desk" }, auth.actor.id);
  if (!result.ok) return NextResponse.json({ error: "Driver assignment was not allowed", code: result.code }, { status: 409 });
  try { await scheduleScheduledRideJobs(bookingId); }
  catch { console.error("[admin.bookings.scheduled-reminders.schedule-failed]", { code: "SCHEDULED_REMINDER_ENQUEUE_FAILED" }); }
  let booking: BookingForFinancialBreakdown | null = null;
  try {
    const committed = await prisma.booking.findUnique({ where: { id: bookingId }, include: bookingFinancialInclude });
    booking = await withFinancialBreakdown(committed);
  } catch { console.error("[admin.bookings.assignment.response-deferred]", { code: "ASSIGNMENT_RESPONSE_READ_FAILED" }); }
  return NextResponse.json({ success: true, booking, requestId }, { headers: { "Cache-Control": "private, no-store" } });
}
