import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/driver/bookings?driverId=xxx
 * Get driver's assigned bookings
 */
export async function GET(request: NextRequest) {
  try {
    const driverId = request.nextUrl.searchParams.get("driverId");

    if (!driverId) {
      return NextResponse.json(
        { error: "Driver ID required" },
        { status: 400 }
      );
    }

    const bookings = await prisma.booking.findMany({
      where: { driverId },
      orderBy: { scheduledDate: "asc" },
    });

    const today = new Date().toISOString().split("T")[0];

    const todayBookings = bookings.filter(
      (b: any) =>
        b.scheduledDate === today &&
        b.status !== "COMPLETED" &&
        b.status !== "CANCELLED"
    );

    const upcomingBookings = bookings.filter(
      (b: any) =>
        b.scheduledDate > today &&
        b.status !== "COMPLETED" &&
        b.status !== "CANCELLED"
    );

    const completedBookings = bookings.filter(
      (b: any) =>
        b.status === "COMPLETED" ||
        b.status === "CANCELLED"
    );

    return NextResponse.json({
      todayBookings,
      upcomingBookings,
      completedBookings,
      totalAssigned: bookings.length,
    });
  } catch (error) {
    console.error("❌ Driver bookings error:", error);

    return NextResponse.json(
      { error: "Failed to fetch bookings" },
      { status: 500 }
    );
  }
}