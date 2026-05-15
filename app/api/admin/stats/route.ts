import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const today = new Date().toISOString().split("T")[0];

    const [
      totalBookings,
      pendingBookings,
      confirmedBookings,
      assignedBookings,
      inProgressBookings,
      completedBookings,
      cancelledBookings,
      noShowBookings,

      totalDrivers,
      onlineDrivers,
      busyDrivers,

      searchingDispatches,
      noDriverAvailable,

      completedRides,

      recentBookings,
    ] = await Promise.all([
      prisma.booking.count(),

      prisma.booking.count({
        where: { status: "PENDING" },
      }),

      prisma.booking.count({
        where: { status: "CONFIRMED" },
      }),

      prisma.booking.count({
        where: { status: "ASSIGNED" },
      }),

      prisma.booking.count({
        where: { status: "IN_PROGRESS" },
      }),

      prisma.booking.count({
        where: { status: "COMPLETED" },
      }),

      prisma.booking.count({
        where: { status: "CANCELLED" },
      }),

      prisma.booking.count({
        where: { status: "NO_SHOW" },
      }),

      prisma.driver.count(),

      prisma.driver.count({
        where: {
          isOnline: true,
          status: "ACTIVE",
        },
      }),

      prisma.driver.count({
        where: {
          isOnTrip: true,
        },
      }),

      prisma.booking.count({
        where: {
          dispatchStatus: "SEARCHING_DRIVER",
        },
      }),

      prisma.booking.count({
        where: {
          dispatchStatus: "NO_DRIVER_AVAILABLE",
        },
      }),

      prisma.booking.findMany({
        where: {
          status: "COMPLETED",
        },
        select: {
          estimatedPrice: true,
        },
      }),

      prisma.booking.findMany({
        orderBy: {
          createdAt: "desc",
        },
        take: 10,
        include: {
          driver: true,
        },
      }),
    ]);

    // ============================================
    // TODAY BOOKINGS
    // ============================================

    const todayBookings = await prisma.booking.count({
      where: {
        scheduledDate: today,
      },
    });

    // ============================================
    // REVENUE
    // ============================================

    const totalRevenue = completedRides.reduce((sum, ride) => {
      return sum + Number(ride.estimatedPrice || 0);
    }, 0);

    const todayRevenueBookings = await prisma.booking.findMany({
      where: {
        scheduledDate: today,
        status: "COMPLETED",
      },
      select: {
        estimatedPrice: true,
      },
    });

    const todayRevenue = todayRevenueBookings.reduce((sum, ride) => {
      return sum + Number(ride.estimatedPrice || 0);
    }, 0);

    // ============================================
    // ACTIVE RIDES
    // ============================================

    const activeRides = assignedBookings + inProgressBookings;

    // ============================================
    // COMPLETION RATE
    // ============================================

    const completionRate =
      totalBookings > 0
        ? Number(((completedBookings / totalBookings) * 100).toFixed(1))
        : 0;

    console.log("═══════════════════════════════════════");
    console.log("📊 ADMIN DASHBOARD STATS");
    console.log(`📋 Total Bookings: ${totalBookings}`);
    console.log(`🆕 Pending: ${pendingBookings}`);
    console.log(`🚗 Active Rides: ${activeRides}`);
    console.log(`✅ Completed: ${completedBookings}`);
    console.log(`💶 Revenue: €${totalRevenue.toFixed(2)}`);
    console.log(`🟢 Online Drivers: ${onlineDrivers}`);
    console.log(`📡 Searching Dispatches: ${searchingDispatches}`);
    console.log("═══════════════════════════════════════");

    return NextResponse.json({
      success: true,

      // BOOKINGS
      totalBookings,
      pendingBookings,
      confirmedBookings,
      assignedBookings,
      inProgressBookings,
      completedBookings,
      cancelledBookings,
      noShowBookings,

      // DRIVERS
      totalDrivers,
      onlineDrivers,
      busyDrivers,

      // DISPATCH
      searchingDispatches,
      noDriverAvailable,

      // RIDES
      activeRides,

      // REVENUE
      totalRevenue: Number(totalRevenue.toFixed(2)),
      todayRevenue: Number(todayRevenue.toFixed(2)),

      // TODAY
      todayBookings,

      // PERFORMANCE
      completionRate,

      // RECENT DATA
      recentBookings,

      // SYSTEM
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ Admin stats error:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch admin stats",
      },
      { status: 500 }
    );
  }
}