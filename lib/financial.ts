import { prisma } from "@/lib/prisma";

export interface DriverFinancialSummary {
  driverId: string;
  dailyEarnings: number;
  weeklyEarnings: number;
  monthlyEarnings: number;
  totalEarnings: number;
  performanceScore: number;
  averageRating: number | null;
  feedbackCount: number;
  feedbackSummary: string;
  rideCount: number;
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function startOfWeek(date: Date) {
  const day = date.getDay();
  const diff = day === 0 ? 6 : day - 1;
  const start = startOfDay(date);
  start.setDate(start.getDate() - diff);
  return start;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function toDateFromBooking(value: string | Date | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function roundMoney(value: number) {
  return Number(value.toFixed(2));
}

export async function getDriverFinancialSummary(
  driverId: string,
  now = new Date()
): Promise<DriverFinancialSummary> {
  const [earnings, completedBookings, assignedCount, cancelledCount] =
    await Promise.all([
      prisma.driverEarning.findMany({
        where: { driverId },
        orderBy: { completedAt: "desc" },
      }),
      prisma.booking.findMany({
        where: {
          driverId,
          status: "COMPLETED",
        },
        select: {
          id: true,
          scheduledDate: true,
          estimatedPrice: true,
          earning: true,
        },
      }),
      prisma.booking.count({ where: { driverId } }),
      prisma.booking.count({ where: { driverId, status: "CANCELLED" } }),
    ]);

  const earningByBooking = new Set(earnings.map((earning) => earning.bookingId));
  const fallbackEarnings = completedBookings
    .filter((booking) => !earningByBooking.has(booking.id))
    .map((booking) => ({
      amount: Number(booking.estimatedPrice || 0) * 0.8,
      completedAt: toDateFromBooking(booking.scheduledDate) || now,
    }));

  const rows = [
    ...earnings.map((earning) => ({
      amount: Number(earning.driverAmount || 0),
      completedAt: earning.completedAt,
    })),
    ...fallbackEarnings,
  ];

  const today = startOfDay(now);
  const week = startOfWeek(now);
  const month = startOfMonth(now);

  const sumSince = (date: Date) =>
    rows.reduce((sum, row) => {
      return row.completedAt >= date ? sum + row.amount : sum;
    }, 0);

  const completedCount = completedBookings.length;
  const performanceScore =
    assignedCount > 0
      ? Math.max(
          0,
          Math.min(
            100,
            Math.round(
              (completedCount / assignedCount) * 85 +
                ((assignedCount - cancelledCount) / assignedCount) * 15
            )
          )
        )
      : 0;

  return {
    driverId,
    dailyEarnings: roundMoney(sumSince(today)),
    weeklyEarnings: roundMoney(sumSince(week)),
    monthlyEarnings: roundMoney(sumSince(month)),
    totalEarnings: roundMoney(rows.reduce((sum, row) => sum + row.amount, 0)),
    performanceScore,
    averageRating: null,
    feedbackCount: 0,
    feedbackSummary: "No passenger feedback records available yet.",
    rideCount: completedCount,
  };
}

export async function getAllDriverFinancialSummaries() {
  const drivers = await prisma.driver.findMany({
    orderBy: { fullName: "asc" },
    include: {
      vehicle: true,
      bookings: {
        take: 5,
        orderBy: { createdAt: "desc" },
      },
    },
  });

  const summaries = await Promise.all(
    drivers.map(async (driver) => {
      const { passwordHash, ...safeDriver } = driver as any;
      return {
        driver: safeDriver,
        financial: await getDriverFinancialSummary(driver.id),
      };
    })
  );

  return summaries;
}
