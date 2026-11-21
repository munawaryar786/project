import type { Prisma } from "@prisma/client";

export const CASH_COLLECTION_CURRENCY = "EUR";
export const CASH_COLLECTION_STATUS = "COLLECTED";
export const CASH_COLLECTION_SOURCE = "DRIVER_TRIP_START";

type CashBooking = {
  id: string;
  driverId?: string | null;
  acceptedAt?: Date | null;
  paymentMethod?: string | null;
  fareTotalFare?: number | null;
  estimatedPrice?: number | null;
};

export function cashCollectionOperationKey(bookingId: string) {
  return `cash-collection:${bookingId}`;
}

export function authoritativeCashAmountMinor(booking: CashBooking) {
  const value = booking.fareTotalFare ?? booking.estimatedPrice;
  const amountMinor = typeof value === "number" && Number.isFinite(value)
    ? Math.round((value + Number.EPSILON) * 100)
    : null;
  return amountMinor !== null && Number.isSafeInteger(amountMinor) && amountMinor > 0 && amountMinor <= 2_147_483_647
    ? amountMinor
    : null;
}

export function isMatchingCashCollection(
  collection: { driverId: string; amountMinor: number; currency: string; status: string; operationKey: string; assignmentAcceptedAt: Date | null } | null,
  booking: CashBooking,
  driverId: string,
) {
  const amountMinor = authoritativeCashAmountMinor(booking);
  const assignmentAcceptedAtMs = booking.acceptedAt?.getTime() ?? null;
  const recordedAssignmentMs = collection?.assignmentAcceptedAt?.getTime() ?? null;
  return Boolean(collection && amountMinor !== null && booking.driverId === driverId &&
    collection.driverId === driverId && collection.amountMinor === amountMinor &&
    collection.currency === CASH_COLLECTION_CURRENCY && collection.status === CASH_COLLECTION_STATUS &&
    collection.operationKey === cashCollectionOperationKey(booking.id) &&
    recordedAssignmentMs === assignmentAcceptedAtMs);
}

export async function hasVerifiedCashCollection(
  booking: CashBooking,
  db: Pick<Prisma.TransactionClient, "cashCollection">,
) {
  if (booking.paymentMethod !== "CASH" || !booking.driverId) return false;
  const collection = await db.cashCollection.findUnique({ where: { bookingId: booking.id } });
  return isMatchingCashCollection(collection, booking, booking.driverId);
}

export async function recordCashCollectionForTripStart(
  booking: CashBooking,
  driverId: string,
  confirmedAt: Date,
  db: Pick<Prisma.TransactionClient, "cashCollection">,
) {
  if (booking.paymentMethod !== "CASH" || booking.driverId !== driverId) {
    throw new Error("CASH_COLLECTION_BOOKING_MISMATCH");
  }
  const amountMinor = authoritativeCashAmountMinor(booking);
  if (amountMinor === null) throw new Error("CASH_COLLECTION_AMOUNT_INVALID");
  const existing = await db.cashCollection.findUnique({ where: { bookingId: booking.id } });
  if (existing) {
    if (!isMatchingCashCollection(existing, booking, driverId)) throw new Error("CASH_COLLECTION_CONFLICT");
    return { collection: existing, created: false as const };
  }
  const collection = await db.cashCollection.create({ data: {
    bookingId: booking.id,
    driverId,
    amountMinor,
    currency: CASH_COLLECTION_CURRENCY,
    status: CASH_COLLECTION_STATUS,
    source: CASH_COLLECTION_SOURCE,
    assignmentAcceptedAt: booking.acceptedAt || null,
    confirmedAt,
    operationKey: cashCollectionOperationKey(booking.id),
  } });
  return { collection, created: true as const };
}

export function cashCollectionReportingStatus(paymentMethod: string, verified: boolean) {
  if (paymentMethod !== "CASH") return "NOT_APPLICABLE" as const;
  return verified ? "VERIFIED_COLLECTED" as const : "LEGACY_UNKNOWN_UNVERIFIED" as const;
}
