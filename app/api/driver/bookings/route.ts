import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeDriver } from "@/lib/security/authorization";

export async function GET(request: NextRequest) {
  const auth = await authorizeDriver(request);
  if (!auth.ok) return auth.response;
  try {
    const bookings = await prisma.booking.findMany({
      where: { driverId: auth.actor.id },
      orderBy: { scheduledDate: "asc" },
      include: { earning: true },
    });
    const today = new Date().toISOString().split("T")[0];
    const active = (b: { status: string }) => !["COMPLETED", "CANCELLED"].includes(b.status);
    return NextResponse.json({
      todayBookings: bookings.filter((b) => b.scheduledDate === today && active(b)),
      upcomingBookings: bookings.filter((b) => b.scheduledDate > today && active(b)),
      completedBookings: bookings.filter((b) => ["COMPLETED", "CANCELLED"].includes(b.status)),
      totalAssigned: bookings.length,
    });
  } catch {
    return NextResponse.json({ error: "Failed to fetch bookings" }, { status: 500 });
  }
}
