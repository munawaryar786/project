import { createHash, randomUUID } from "node:crypto";
import type { Booking, PaymentOperation, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hasAuthoritativeBookingPrice } from "@/lib/security/booking-price";

export const CHECKOUT_LIFETIME_MS = 30 * 60_000;
export const PAYMENT_CREATION_LEASE_MS = 45_000;
// Stripe may prune idempotency keys once they are at least 24 hours old.
// Escalate unresolved outcomes before that boundary; never create again from
// an expired lease alone.
export const PROVIDER_RETRY_LIMIT_MS = 23 * 60 * 60_000;

export type PaymentChannel = "PUBLIC" | "PHONE_DISPATCH";
export type ReservedOperation =
  | { kind: "CREATE"; operation: PaymentOperation; leaseToken: string }
  | { kind: "RECOVER"; operation: PaymentOperation; leaseToken: string }
  | { kind: "READY" | "PAID" | "PROCESSING" | "RECONCILIATION_REQUIRED" | "LEGACY_ACTIVE" | "EXPIRED" | "FAILED"; operation?: PaymentOperation };

const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const pendingSessionKey = (key: string) => `pending:${key}`;

export function paymentFareSnapshot(booking: Booking, channel: PaymentChannel) {
  if (!hasAuthoritativeBookingPrice(booking)) return null;
  const amount = booking.estimatedPrice;
  const amountMinor = typeof amount === "number" && Number.isFinite(amount) ? Math.round(amount * 100) : NaN;
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0 || amountMinor > 2_147_483_647) return null;
  if (booking.fareTotalFare != null && Math.round(booking.fareTotalFare * 100) !== amountMinor) return null;
  return { amountMinor, currency: "EUR", fareSnapshotHash: hash([booking.id, booking.bookingRef, channel, amountMinor, "EUR", booking.fareBreakdown]) };
}

function activeOperationStatus(operation: PaymentOperation, now: Date): ReservedOperation {
  if (operation.status === "PAID") return { kind: "PAID", operation };
  if (operation.status === "READY") return { kind: "READY", operation };
  if (operation.status === "EXPIRED" || operation.status === "FAILED") return { kind: operation.status, operation };
  if (operation.status === "RECONCILIATION_REQUIRED") return { kind: "RECONCILIATION_REQUIRED", operation };
  if (operation.providerRequestAt && now.getTime() - operation.providerRequestAt.getTime() >= PROVIDER_RETRY_LIMIT_MS) {
    return { kind: "RECONCILIATION_REQUIRED", operation };
  }
  return { kind: "PROCESSING", operation };
}

// MongoDB does not backfill added nullable/defaulted fields on legacy slot
// documents. Match both missing and explicit null without a data migration.
function nullableMatch<K extends "activeOperationId" | "leaseOwnerToken" | "leaseExpiresAt">(
  field: K, value: string | Date | null,
): Prisma.BookingPaymentSlotWhereInput {
  return value === null
    ? { OR: [{ [field]: null }, { [field]: { isSet: false } }] }
    : { [field]: value };
}

function slotVersionWhere(slot: {
  id: string; generation: number; activeOperationId: string | null;
  leaseOwnerToken: string | null; leaseExpiresAt?: Date | null;
}): Prisma.BookingPaymentSlotWhereInput {
  return { AND: [
    { id: slot.id },
    ...(slot.generation > 0 ? [{ generation: slot.generation }] : []),
    nullableMatch("activeOperationId", slot.activeOperationId),
    nullableMatch("leaseOwnerToken", slot.leaseOwnerToken),
    nullableMatch("leaseExpiresAt", slot.leaseExpiresAt ?? null),
  ] };
}

/** Reserves only MongoDB state. The caller must perform Stripe I/O after this
 * transaction commits. The unique booking slot is the concurrency authority. */
export async function reservePaymentOperation(input: {
  bookingId: string; channel: PaymentChannel; actorId: string; requestKey?: string;
}, now = new Date()): Promise<ReservedOperation> {
  const requestScopeKey = hash([input.channel, input.actorId, input.bookingId, input.requestKey || randomUUID()]);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        const booking = await tx.booking.findUnique({ where: { id: input.bookingId } });
        if (!booking || booking.status !== "PENDING" || booking.paymentMethod !== "CARD" ||
            (input.channel === "PHONE_DISPATCH") !== (booking.bookingSource === "PHONE_DISPATCH")) {
          throw new Error("PAYMENT_BOOKING_NOT_ELIGIBLE");
        }
        const fare = paymentFareSnapshot(booking, input.channel);
        if (!fare) throw new Error("PAYMENT_FARE_NOT_AUTHORITATIVE");
        const priorRequest = await tx.paymentOperation.findUnique({ where: { requestScopeKey } });
        let slot = await tx.bookingPaymentSlot.findUnique({ where: { bookingId: booking.id } });
        if (!slot) slot = await tx.bookingPaymentSlot.create({ data: {
          bookingId: booking.id, activeOperationId: null, generation: 0,
          leaseOwnerToken: null, leaseExpiresAt: null,
        } });
        if (priorRequest && (priorRequest.bookingId !== booking.id || priorRequest.actorId !== input.actorId ||
            priorRequest.channel !== input.channel || slot.activeOperationId !== priorRequest.id)) {
          // A superseded request key must never reveal its former URL after a
          // later booking generation has become active.
          return { kind: "EXPIRED", operation: priorRequest };
        }
        const active = slot.activeOperationId
          ? await tx.paymentOperation.findUnique({ where: { id: slot.activeOperationId } }) : null;
        if (active) {
          if (active.bookingId !== booking.id) throw new Error("PAYMENT_SLOT_BINDING_CONFLICT");
          if (active.amountMinor !== fare.amountMinor || active.fareSnapshotHash !== fare.fareSnapshotHash) {
            return { kind: "RECONCILIATION_REQUIRED", operation: active };
          }
          if (priorRequest && ["EXPIRED", "FAILED"].includes(active.status)) return activeOperationStatus(active, now);
          if (active.status === "READY" || active.status === "PAID" || active.status === "RECONCILIATION_REQUIRED") {
            return activeOperationStatus(active, now);
          }
          if (!["EXPIRED", "FAILED"].includes(active.status)) {
            if (!active.providerSessionId && ((active.providerRequestAt && now.getTime() - active.providerRequestAt.getTime() >= PROVIDER_RETRY_LIMIT_MS) ||
                (active.providerExpiresAt && active.providerExpiresAt <= now))) {
              await tx.paymentOperation.updateMany({ where: { id: active.id, status: active.status }, data: { status: "RECONCILIATION_REQUIRED", reconciliationCode: "PROVIDER_OUTCOME_UNRESOLVED" } });
              return { kind: "RECONCILIATION_REQUIRED", operation: active };
            }
            if (slot.leaseExpiresAt && slot.leaseExpiresAt > now) return { kind: "PROCESSING", operation: active };
            // A lease expiry is not proof that Stripe never created a Session.
            // A known Session can be retrieved safely; an unknown outcome cannot
            // be re-created with a now-invalid frozen 30-minute expiry.
            if (!active.providerSessionId) {
              await tx.paymentOperation.updateMany({ where: { id: active.id, status: active.status }, data: {
                status: "RECONCILIATION_REQUIRED", reconciliationCode: "PROVIDER_CREATE_OUTCOME_UNRESOLVED",
              } });
              return { kind: "RECONCILIATION_REQUIRED", operation: active };
            }
            const leaseToken = randomUUID();
            const claimed = await tx.bookingPaymentSlot.updateMany({ where: slotVersionWhere(slot), data: { leaseOwnerToken: leaseToken, leaseExpiresAt: new Date(now.getTime() + PAYMENT_CREATION_LEASE_MS) } });
            if (claimed.count !== 1) throw new Error("PAYMENT_LEASE_CONFLICT");
            await tx.paymentOperation.updateMany({ where: { id: active.id, status: active.status }, data: { status: "CREATING" } });
            return { kind: "RECOVER", operation: active, leaseToken };
          }
        } else if (slot.sessionId || slot.leaseKey) {
          // Existing Dispatcher rows predate PaymentOperation. Do not replace a
          // possibly payable legacy Session without separately verifying it.
          return { kind: "LEGACY_ACTIVE" };
        }
        const generation = slot.generation + 1;
        const providerRequestKey = randomUUID();
        const leaseToken = randomUUID();
        const operation = await tx.paymentOperation.create({ data: {
          bookingId: booking.id, bookingRef: booking.bookingRef, actorId: input.actorId, channel: input.channel,
          generation, status: "CREATING", requestScopeKey, providerRequestKey,
          providerSessionKey: pendingSessionKey(providerRequestKey),
          amountMinor: fare.amountMinor, currency: fare.currency, fareSnapshotHash: fare.fareSnapshotHash,
          // Stripe requires expires_at to be at least 30 minutes from the
          // provider request. A few seconds cover the committed DB roundtrip.
          providerRequestAt: now, providerExpiresAt: new Date(now.getTime() + CHECKOUT_LIFETIME_MS + 5_000),
        } });
        const claimed = await tx.bookingPaymentSlot.updateMany({ where: slotVersionWhere(slot), data: {
          activeOperationId: operation.id, generation, leaseOwnerToken: leaseToken,
          leaseExpiresAt: new Date(now.getTime() + PAYMENT_CREATION_LEASE_MS),
        } });
        if (claimed.count !== 1) throw new Error("PAYMENT_LEASE_CONFLICT");
        return { kind: "CREATE", operation, leaseToken };
      });
    } catch (error: any) {
      if (attempt === 2 || !["P2002", "P2034", "PAYMENT_LEASE_CONFLICT"].includes(error?.code || error?.message)) throw error;
    }
  }
  throw new Error("PAYMENT_RESERVATION_UNAVAILABLE");
}

export async function publishPaymentSession(input: {
  operation: PaymentOperation; leaseToken: string; sessionId: string; paymentId?: string | null;
  dispatcherOperatorId?: string;
}) {
  return prisma.$transaction(async (tx) => {
    const slot = await tx.bookingPaymentSlot.findUnique({ where: { bookingId: input.operation.bookingId } });
    if (!slot || slot.activeOperationId !== input.operation.id || slot.generation !== input.operation.generation || slot.leaseOwnerToken !== input.leaseToken) {
      return { published: false as const };
    }
    const operation = await tx.paymentOperation.findUnique({ where: { id: input.operation.id } });
    if (!operation || operation.status !== "CREATING") return { published: false as const };
    const changed = await tx.paymentOperation.updateMany({ where: {
      id: operation.id, status: "CREATING", providerSessionKey: operation.providerSessionKey,
      ...(operation.providerSessionId ? { providerSessionId: input.sessionId } : { OR: [{ providerSessionId: null }, { providerSessionId: { isSet: false } }] }),
    }, data: {
      status: "READY", providerSessionKey: input.sessionId, providerSessionId: input.sessionId,
      providerPaymentId: input.paymentId || null,
    } });
    if (changed.count !== 1) return { published: false as const };
    if (input.dispatcherOperatorId) {
      await tx.bookingPayment.create({ data: {
        bookingId: operation.bookingId, provider: "STRIPE", paymentMethod: "CARD", status: "PENDING",
        amountMinor: operation.amountMinor, currency: "EUR", providerSessionId: input.sessionId,
        expiresAt: operation.providerExpiresAt!, createdByDispatchOperatorId: input.dispatcherOperatorId,
        idempotencyKey: operation.requestScopeKey, operationId: operation.id,
      } });
    }
    await tx.bookingPaymentSlot.updateMany({ where: { id: slot.id, activeOperationId: operation.id, generation: operation.generation, leaseOwnerToken: input.leaseToken }, data: {
      sessionId: input.sessionId, leaseKey: input.sessionId, leaseOwnerToken: null, leaseExpiresAt: null,
    } });
    return { published: true as const };
  });
}

export async function markPaymentCreationUncertain(operation: PaymentOperation, leaseToken: string, knownSessionId?: string) {
  await prisma.$transaction(async (tx) => {
    const slot = await tx.bookingPaymentSlot.findUnique({ where: { bookingId: operation.bookingId } });
    if (!slot || slot.activeOperationId !== operation.id || slot.generation !== operation.generation || slot.leaseOwnerToken !== leaseToken) return;
    await tx.paymentOperation.updateMany({ where: { id: operation.id, status: "CREATING" }, data: {
      status: "OUTCOME_UNKNOWN", reconciliationCode: knownSessionId ? "PROVIDER_SESSION_UNPUBLISHED" : "PROVIDER_CREATE_OUTCOME_UNKNOWN",
      ...(knownSessionId ? { providerSessionKey: knownSessionId, providerSessionId: knownSessionId } : {}),
    } });
    await tx.bookingPaymentSlot.updateMany({ where: { id: slot.id, activeOperationId: operation.id, generation: operation.generation, leaseOwnerToken: leaseToken }, data: { leaseExpiresAt: new Date() } });
  });
}

/** An uncertain provider outcome is never interpreted as a failed payment.
 * Conditional status changes also leave a concurrent signed PAID webhook intact. */
export async function markPaymentOperationForReview(operationId: string, code: string) {
  return prisma.paymentOperation.updateMany({ where: {
    id: operationId, status: { in: ["CREATING", "OUTCOME_UNKNOWN"] },
  }, data: { status: "RECONCILIATION_REQUIRED", reconciliationCode: code } });
}

/** Move a transiently unavailable row behind other work without losing its
 * operation or provider evidence. The next bounded pass can retry it. */
export async function deferPaymentOperationRetry(operationId: string) {
  return prisma.paymentOperation.updateMany({ where: {
    id: operationId, status: { in: ["CREATING", "OUTCOME_UNKNOWN"] },
  }, data: { reconciliationCode: "RETRY_UNAVAILABLE", updatedAt: new Date() } });
}

export async function markPaymentOperationExpired(operationId: string, providerSessionId: string) {
  return prisma.$transaction(async tx => {
    const changed = await tx.paymentOperation.updateMany({
      where: { id: operationId, status: { in: ["READY", "CREATING", "OUTCOME_UNKNOWN"] }, providerSessionId }, data: { status: "EXPIRED" },
    });
    if (changed.count) await tx.bookingPayment.updateMany({
      where: { operationId, providerSessionId, status: "PENDING" }, data: { status: "EXPIRED" },
    });
    return changed;
  });
}
