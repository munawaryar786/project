import { prisma } from "@/lib/prisma";
import { fromMinorUnits, summarizeDriverLedger } from "@/lib/earnings-ledger";

export interface DriverFinancialSummary {
  driverId: string;
  currency: string;
  dailyEarnings: number;
  weeklyEarnings: number;
  monthlyEarnings: number;
  totalEarnings: number;
  currencyTotals: Record<string, { today: number; week: number; month: number; total: number }>;
  performanceScore: number;
  averageRating: number | null;
  feedbackCount: number;
  feedbackSummary: string;
  rideCount: number;
}

export async function getDriverFinancialSummary(driverId: string, now = new Date()): Promise<DriverFinancialSummary> {
  const [summary, completedCount, assignedCount, cancelledCount] = await Promise.all([
    summarizeDriverLedger(driverId, now),
    prisma.booking.count({ where: { driverId, status: "COMPLETED" } }),
    prisma.booking.count({ where: { driverId } }),
    prisma.booking.count({ where: { driverId, status: "CANCELLED" } }),
  ]);
  const currencies = new Set([...Object.keys(summary.all), ...Object.keys(summary.today), ...Object.keys(summary.week), ...Object.keys(summary.month)]);
  const currencyTotals = Object.fromEntries([...currencies].map((currency) => [currency, { today: fromMinorUnits(summary.today[currency]?.netAmountMinor), week: fromMinorUnits(summary.week[currency]?.netAmountMinor), month: fromMinorUnits(summary.month[currency]?.netAmountMinor), total: fromMinorUnits(summary.all[currency]?.netAmountMinor) }]));
  const eur = currencyTotals.EUR || { today: 0, week: 0, month: 0, total: 0 };
  const performanceScore = assignedCount > 0 ? Math.max(0, Math.min(100, Math.round((completedCount / assignedCount) * 85 + ((assignedCount - cancelledCount) / assignedCount) * 15))) : 0;
  return { driverId, currency: "EUR", dailyEarnings: eur.today, weeklyEarnings: eur.week, monthlyEarnings: eur.month, totalEarnings: eur.total, currencyTotals, performanceScore, averageRating: null, feedbackCount: 0, feedbackSummary: "No passenger feedback records available yet.", rideCount: completedCount };
}

export async function getAllDriverFinancialSummaries() {
  const drivers = await prisma.driver.findMany({ orderBy: { fullName: "asc" }, include: { vehicle: true, bookings: { take: 5, orderBy: { createdAt: "desc" } } } });
  return Promise.all(drivers.map(async (driver) => { const { passwordHash, ...safeDriver } = driver as any; return { driver: safeDriver, financial: await getDriverFinancialSummary(driver.id) }; }));
}