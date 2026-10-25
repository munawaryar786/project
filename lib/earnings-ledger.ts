import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { calculateBookingFinancialBreakdown } from "@/lib/commission-engine";
import { parseMarketDateTime, SCHEDULED_MARKET_CONFIG } from "@/lib/scheduled-marketplace";
import { writeOutboxEvent } from "@/lib/outbox";

export const LEDGER_ENTRY_TYPES = {
  TRIP_EARNING: "TRIP_EARNING",
  ADJUSTMENT_CREDIT: "ADJUSTMENT_CREDIT",
  ADJUSTMENT_DEBIT: "ADJUSTMENT_DEBIT",
  REVERSAL: "REVERSAL",
} as const;
export const LEDGER_CURRENCY = "EUR";
export const TRIP_EARNING_KEY = (bookingId: string) => `trip-earning:${bookingId}`;

export function toMinorUnits(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const minor = Math.round((value + Number.EPSILON) * 100);
  return Number.isSafeInteger(minor) ? minor : null;
}
export function fromMinorUnits(value: number | null | undefined) { return typeof value === "number" ? value / 100 : 0; }

export type LedgerAmounts = { grossAmountMinor: number; commissionAmountMinor: number; netAmountMinor: number; currency: string; commissionRate: number; commissionSource: string; commissionSourceId: string | null };
export async function calculateLedgerAmounts(booking: any, db: Prisma.TransactionClient = prisma): Promise<LedgerAmounts> {
  const financial = await calculateBookingFinancialBreakdown({ driverId: booking.driverId, fleetId: booking.driver?.fleetId || null, serviceType: booking.serviceType, fareTotalFare: booking.fareTotalFare, estimatedPrice: booking.estimatedPrice }, db);
  const grossAmountMinor = toMinorUnits(financial.totalFare);
  const commissionAmountMinor = toMinorUnits(financial.platformCommission);
  const netAmountMinor = toMinorUnits(financial.driverEarnings);
  if (grossAmountMinor === null || commissionAmountMinor === null || netAmountMinor === null || grossAmountMinor < 0 || commissionAmountMinor < 0 || netAmountMinor < 0 || grossAmountMinor - commissionAmountMinor !== netAmountMinor) throw new Error("LEDGER_MONEY_INVARIANT_FAILED");
  return { grossAmountMinor, commissionAmountMinor, netAmountMinor, currency: LEDGER_CURRENCY, commissionRate: financial.commissionPercentageUsed, commissionSource: financial.commissionSource, commissionSourceId: financial.commissionSourceId };
}

export async function postTripEarningLedger(bookingId: string, db: Prisma.TransactionClient = prisma) {
  const booking = await db.booking.findUnique({ where: { id: bookingId }, include: { driver: true } });
  if (!booking || booking.status !== "COMPLETED" || !booking.driverId) return { ok: false as const, code: "TRIP_NOT_COMPLETED" };
  const idempotencyKey = TRIP_EARNING_KEY(bookingId);
  const existing = await db.driverLedgerEntry.findUnique({ where: { idempotencyKey } });
  if (existing) return { ok: true as const, created: false, entry: existing };
  const amounts = await calculateLedgerAmounts(booking, db);
  const effectiveAt = new Date();
  const entry = await db.driverLedgerEntry.create({ data: { driverId: booking.driverId, bookingId, entryType: LEDGER_ENTRY_TYPES.TRIP_EARNING, currency: amounts.currency, grossAmountMinor: amounts.grossAmountMinor, commissionAmountMinor: amounts.commissionAmountMinor, netAmountMinor: amounts.netAmountMinor, referenceType: "BOOKING", referenceId: bookingId, idempotencyKey, descriptionCode: "COMPLETED_TRIP_EARNING", metadata: { bookingRef: booking.bookingRef, paymentMethod: booking.paymentMethod, commissionRate: amounts.commissionRate, commissionSource: amounts.commissionSource, commissionSourceId: amounts.commissionSourceId }, effectiveAt } });
  await writeOutboxEvent(db, { eventType: "DRIVER_LEDGER_ENTRY_POSTED", aggregateType: "DriverLedgerEntry", aggregateId: entry.id, idempotencyKey: `ledger-posted:${bookingId}`, payload: { bookingId, driverId: booking.driverId, ledgerEntryId: entry.id, entryType: LEDGER_ENTRY_TYPES.TRIP_EARNING, currency: amounts.currency, netAmountMinor: amounts.netAmountMinor } });
  return { ok: true as const, created: true, entry };
}

function localDateKey(date: Date, timeZone: string) { return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date); }
function shiftDateKey(key: string, days: number) { const d = new Date(`${key}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); }
export function periodBounds(period: "today" | "week" | "month", now = new Date(), timeZone = SCHEDULED_MARKET_CONFIG.timezone) {
  const key = localDateKey(now, timeZone); const day = new Date(`${key}T00:00:00Z`); const mondayOffset = (day.getUTCDay() + 6) % 7;
  const startKey = period === "today" ? key : period === "week" ? shiftDateKey(key, -mondayOffset) : `${key.slice(0, 7)}-01`;
  const endKey = shiftDateKey(startKey, period === "today" ? 1 : period === "week" ? 7 : 32);
  const endMonth = period === "month" ? `${key.slice(0, 7)}-01` : endKey;
  const start = parseMarketDateTime(startKey, "00:00:00", timeZone); const end = parseMarketDateTime(period === "month" ? shiftDateKey(endMonth, 32).slice(0, 7) + "-01" : endKey, "00:00:00", timeZone);
  return { gte: start || now, lt: end || new Date(now.getTime() + 86400000) };
}
export function validateDateRange(from: string | null, to: string | null, timeZone = SCHEDULED_MARKET_CONFIG.timezone) {
  if (!from && !to) return {};
  if (!from || !to || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) throw new Error("INVALID_DATE_RANGE");
  const start = parseMarketDateTime(from, "00:00:00", timeZone); const next = parseMarketDateTime(shiftDateKey(to, 1), "00:00:00", timeZone);
  if (!start || !next || next.getTime() - start.getTime() > 93 * 86400000) throw new Error("INVALID_DATE_RANGE");
  return { gte: start, lt: next };
}

export async function listDriverLedger(driverId: string, options: { from?: string | null; to?: string | null; limit?: number; cursor?: string } = {}) {
  const limit = Math.min(Math.max(options.limit || 25, 1), 100); const range = validateDateRange(options.from || null, options.to || null);
  const rows = await prisma.driverLedgerEntry.findMany({ where: { driverId, ...(Object.keys(range).length ? { effectiveAt: range } : {}) }, orderBy: [{ effectiveAt: "desc" }, { id: "desc" }], take: limit + 1, ...(options.cursor ? { skip: 1, cursor: { id: options.cursor } } : {}) });
  const hasMore = rows.length > limit; const entries = hasMore ? rows.slice(0, limit) : rows;
  return { entries, nextCursor: hasMore ? entries[entries.length - 1]?.id || null : null };
}

export async function summarizeDriverLedger(driverId: string, now = new Date()) {
  const periods = { today: periodBounds("today", now), week: periodBounds("week", now), month: periodBounds("month", now) };
  const [all, today, week, month] = await Promise.all(["all", "today", "week", "month"].map((period) => prisma.driverLedgerEntry.groupBy({ by: ["currency"], where: { driverId, ...(period === "all" ? {} : { effectiveAt: periods[period as keyof typeof periods] }) }, _sum: { netAmountMinor: true }, _count: { _all: true } })));
  const map = (rows: any[]) => Object.fromEntries(rows.map((row) => [row.currency, { netAmountMinor: row._sum.netAmountMinor || 0, entryCount: row._count._all }]));
  return { today: map(today), week: map(week), month: map(month), all: map(all) };
}