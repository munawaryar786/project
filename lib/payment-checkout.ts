import type { Booking, PaymentOperation } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createPaymentSession, getPaymentSession } from "@/lib/stripe";
import { sendDispatchPaymentLinkEmail } from "@/lib/email";
import {
  deferPaymentOperationRetry, markPaymentCreationUncertain, markPaymentOperationExpired,
  markPaymentOperationForReview,
  PAYMENT_CREATION_LEASE_MS, reservePaymentOperation, type PaymentChannel,
  publishPaymentSession,
} from "@/lib/payment-operations";

export type CheckoutResult =
  | { state: "READY"; sessionId: string; sessionUrl: string; operationId?: string; reused: boolean }
  | { state: "PROCESSING" | "PAID" | "EXPIRED" | "FAILED" | "RECONCILIATION_REQUIRED" | "LEGACY_ACTIVE" };
export type CheckoutProvider = {
  create: typeof createPaymentSession;
  get: typeof getPaymentSession;
};
const stripeProvider: CheckoutProvider = { create: createPaymentSession, get: getPaymentSession };
export type CheckoutPublisher = { publish: typeof publishPaymentSession };
const mongoPublisher: CheckoutPublisher = { publish: publishPaymentSession };

function sessionMatchesOperation(session: any, operation: PaymentOperation) {
  return session?.id === operation.providerSessionId &&
    session.metadata?.operationId === operation.id &&
    session.metadata?.operationGeneration === String(operation.generation) &&
    session.metadata?.paymentChannel === operation.channel &&
    session.metadata?.bookingId === operation.bookingId &&
    session.metadata?.bookingRef === operation.bookingRef &&
    session.amount_total === operation.amountMinor &&
    session.currency === operation.currency.toLowerCase() &&
    session.expires_at === Math.floor(operation.providerExpiresAt!.getTime() / 1000);
}

async function readyOperation(operation: PaymentOperation, providerClient: CheckoutProvider): Promise<CheckoutResult> {
  if (!operation.providerSessionId) return { state: "RECONCILIATION_REQUIRED" };
  const provider = await providerClient.get(operation.providerSessionId);
  if (!provider.success || !provider.session || !sessionMatchesOperation(provider.session, operation)) {
    return { state: "RECONCILIATION_REQUIRED" };
  }
  if (provider.session.payment_status === "paid") return { state: "PROCESSING" };
  if (provider.session.status === "expired") {
    const changed = await markPaymentOperationExpired(operation.id, operation.providerSessionId);
    return { state: changed.count ? "EXPIRED" : "PROCESSING" };
  }
  if (provider.session.status !== "open" || typeof provider.session.url !== "string") {
    return { state: "RECONCILIATION_REQUIRED" };
  }
  return { state: "READY", sessionId: provider.session.id, sessionUrl: provider.session.url, operationId: operation.id, reused: true };
}

/** Reserve in MongoDB, call Stripe only after commit, then publish with the
 * same slot generation and lease token. A stale owner never gets a URL. */
export async function createOrReusePaymentCheckout(input: {
  bookingId: string; actorId: string; channel: PaymentChannel; requestKey?: string;
}, providerClient: CheckoutProvider = stripeProvider, publisher: CheckoutPublisher = mongoPublisher, expiryRetry = false): Promise<CheckoutResult> {
  const reserved = await reservePaymentOperation(input);
  if (reserved.kind === "READY") {
    const checked = await readyOperation(reserved.operation!, providerClient);
    if (checked.state === "EXPIRED" && !expiryRetry) return createOrReusePaymentCheckout(input, providerClient, publisher, true);
    return checked;
  }
  if (reserved.kind === "RECOVER") {
    const { operation, leaseToken } = reserved;
    try {
      const provider = await providerClient.get(operation.providerSessionId!);
      if (!provider.success || !provider.session) {
        await markPaymentCreationUncertain(operation, leaseToken, operation.providerSessionId!);
        return { state: "PROCESSING" };
      }
      if (!sessionMatchesOperation(provider.session, operation)) {
        await markPaymentOperationForReview(operation.id, "PROVIDER_SESSION_BINDING_CONFLICT");
        return { state: "RECONCILIATION_REQUIRED" };
      }
      if (provider.session.payment_status === "paid") {
        // Only the signed webhook can commit payment and activation.
        await markPaymentCreationUncertain(operation, leaseToken, operation.providerSessionId!);
        return { state: "PROCESSING" };
      }
      if (provider.session.status === "expired") {
        const changed = await markPaymentOperationExpired(operation.id, operation.providerSessionId!);
        return { state: changed.count ? "EXPIRED" : "PROCESSING" };
      }
      if (provider.session.status !== "open" || typeof provider.session.url !== "string") {
        await markPaymentOperationForReview(operation.id, "PROVIDER_SESSION_STATE_UNRESOLVED");
        return { state: "RECONCILIATION_REQUIRED" };
      }
      const published = await publisher.publish({
        operation, leaseToken, sessionId: operation.providerSessionId!,
        dispatcherOperatorId: input.channel === "PHONE_DISPATCH" ? operation.actorId : undefined,
      });
      return published.published
        ? { state: "READY", sessionId: provider.session.id, sessionUrl: provider.session.url, operationId: operation.id, reused: true }
        : { state: "PROCESSING" };
    } catch {
      await markPaymentCreationUncertain(operation, leaseToken, operation.providerSessionId!).catch(() => undefined);
      console.error("[payment.checkout.recover.failed]", { code: "PROVIDER_SESSION_RECOVERY_UNAVAILABLE" });
      return { state: "PROCESSING" };
    }
  }
  if (reserved.kind !== "CREATE") return { state: reserved.kind };
  const { operation, leaseToken } = reserved;
  // The reservation's expiry is part of the immutable Stripe request. A slow
  // local handoff must not submit it after Stripe's 30-minute minimum lapses.
  if (Math.floor(operation.providerExpiresAt!.getTime() / 1000) - Math.floor(Date.now() / 1000) <= 30 * 60 + 1) {
    await markPaymentOperationForReview(operation.id, "PROVIDER_EXPIRY_NOT_SUBMITTED");
    return { state: "RECONCILIATION_REQUIRED" };
  }
  let knownSessionId: string | undefined;
  try {
    const provider = await providerClient.create({
      amount: operation.amountMinor, currency: operation.currency,
      bookingId: operation.bookingId, bookingRef: operation.bookingRef,
      customerEmail: "", customerName: "", description: `Booking ${operation.bookingRef}`,
      expiresAt: Math.floor(operation.providerExpiresAt!.getTime() / 1000),
      idempotencyKey: operation.providerRequestKey,
      operationId: operation.id, operationGeneration: operation.generation,
      paymentChannel: input.channel,
    });
    knownSessionId = provider.sessionId;
    if (!provider.sessionId || !provider.sessionUrl) throw new Error("PROVIDER_SESSION_INCOMPLETE");
    const published = await publisher.publish({
      operation, leaseToken, sessionId: provider.sessionId,
      dispatcherOperatorId: input.channel === "PHONE_DISPATCH" ? operation.actorId : undefined,
    });
    if (!published.published) return { state: "PROCESSING" };
    return { state: "READY", sessionId: provider.sessionId, sessionUrl: provider.sessionUrl, operationId: operation.id, reused: false };
  } catch {
    // Provider outcome may be unknown. Preserve any known Session ID for a
    // read-only recovery; never submit a fresh create after an ambiguous call.
    await markPaymentCreationUncertain(operation, leaseToken, knownSessionId).catch(() => undefined);
    console.error("[payment.checkout.create.failed]", { code: "PROVIDER_OUTCOME_UNKNOWN" });
    return { state: "PROCESSING" };
  }
}

/** Existing Dispatcher links created before PaymentOperation must remain
 * authoritative. Never replace an unknown legacy CREATING lease. */
export async function inspectLegacyPaymentLink(booking: Booking, providerClient: CheckoutProvider = stripeProvider): Promise<CheckoutResult | null> {
  const slot = await prisma.bookingPaymentSlot.findUnique({ where: { bookingId: booking.id } });
  if (!slot || slot.activeOperationId) return null;
  if (slot.leaseKey.startsWith("CREATING:")) return { state: "RECONCILIATION_REQUIRED" };
  if (!slot.sessionId) return null;
  const payment = await prisma.bookingPayment.findUnique({ where: { providerSessionId: slot.sessionId } });
  if (!payment || payment.bookingId !== booking.id) return { state: "RECONCILIATION_REQUIRED" };
  if (payment.status === "PAID") return { state: "PAID" };
  const provider = await providerClient.get(payment.providerSessionId);
  if (!provider.success || provider.session?.id !== payment.providerSessionId ||
      provider.session.metadata?.bookingId !== booking.id ||
      provider.session.metadata?.bookingRef !== booking.bookingRef ||
      provider.session.amount_total !== payment.amountMinor ||
      provider.session.currency !== "eur") return { state: "RECONCILIATION_REQUIRED" };
  if (provider.session.payment_status === "paid") return { state: "PROCESSING" };
  if (provider.session.status === "open" && payment.status === "PENDING" && typeof provider.session.url === "string") {
    return { state: "READY", sessionId: provider.session.id, sessionUrl: provider.session.url, reused: true };
  }
  if (provider.session.status !== "expired") return { state: "RECONCILIATION_REQUIRED" };
  await prisma.$transaction(async tx => {
    await tx.bookingPayment.updateMany({ where: { id: payment.id, status: "PENDING" }, data: { status: "EXPIRED" } });
    const cleared = await tx.bookingPaymentSlot.updateMany({ where: {
      id: slot.id, OR: [{ activeOperationId: null }, { activeOperationId: { isSet: false } }],
      sessionId: payment.providerSessionId,
    }, data: { sessionId: "", leaseKey: "" } });
    if (cleared.count !== 1) throw new Error("LEGACY_PAYMENT_SLOT_CHANGED");
  });
  return null;
}

/** Bounded worker repair after a crash between Stripe creation and local
 * publication. Unknown provider outcomes require manual reconciliation;
 * known Sessions can be retrieved without another create request. */
export async function reconcilePaymentOperationsOnce(limit = 25, providerClient: CheckoutProvider = stripeProvider) {
  const pageSize = Math.min(Math.max(limit, 1), 25);
  const cutoff = new Date(Date.now() - PAYMENT_CREATION_LEASE_MS);
  let cursor: { updatedAt: Date; id: string } | null = null;
  const visited: string[] = [];
  let recovered = 0, reviewed = 0, scanned = 0;
  // Four bounded keyset pages per run. Resolved/manual-review rows leave the
  // scan; transient failures are moved to the tail, so restarts start fairly.
  for (let page = 0; page < 4; page++) {
    const operations: PaymentOperation[] = await prisma.paymentOperation.findMany({
      where: { AND: [
        { status: { in: ["CREATING", "OUTCOME_UNKNOWN"] }, updatedAt: { lte: cutoff } },
        ...(cursor ? [{ OR: [
          { updatedAt: { gt: cursor.updatedAt } },
          { updatedAt: cursor.updatedAt, id: { gt: cursor.id } },
        ] }] : []),
        ...(visited.length ? [{ id: { notIn: visited } }] : []),
      ] },
      orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
      take: pageSize,
    });
    if (!operations.length) break;
    for (const operation of operations) {
      cursor = { updatedAt: operation.updatedAt, id: operation.id };
      visited.push(operation.id);
      scanned++;
    try {
      const booking = await prisma.booking.findUnique({ where: { id: operation.bookingId } });
      if (!booking || booking.status !== "PENDING" || booking.paymentMethod !== "CARD" ||
          (operation.channel === "PHONE_DISPATCH") !== (booking.bookingSource === "PHONE_DISPATCH")) {
        reviewed += (await markPaymentOperationForReview(operation.id, "BOOKING_NO_LONGER_PAYABLE")).count;
        continue;
      }
      const result = await createOrReusePaymentCheckout({
        bookingId: operation.bookingId, actorId: operation.actorId,
        channel: operation.channel as "PUBLIC" | "PHONE_DISPATCH",
      }, providerClient);
      if (result.state === "RECONCILIATION_REQUIRED" || result.state === "LEGACY_ACTIVE") {
        reviewed += (await markPaymentOperationForReview(operation.id, "PROVIDER_OUTCOME_UNRESOLVED")).count;
        continue;
      }
      if (result.state !== "READY") {
        if (result.state === "PROCESSING") await deferPaymentOperationRetry(operation.id);
        continue;
      }
      recovered++;
      if (operation.channel !== "PHONE_DISPATCH") continue;
      const [dispatchBooking, payment] = await Promise.all([
        prisma.booking.findUnique({ where: { id: operation.bookingId } }),
        prisma.bookingPayment.findUnique({ where: { providerSessionId: result.sessionId } }),
      ]);
      if (!dispatchBooking?.customerEmail || !payment || payment.emailStatus === "SENT") continue;
      const email = await sendDispatchPaymentLinkEmail({
        to: dispatchBooking.customerEmail, bookingRef: dispatchBooking.bookingRef,
        amount: `EUR ${(payment.amountMinor / 100).toFixed(2)}`,
        url: result.sessionUrl, expiresAt: payment.expiresAt,
        language: dispatchBooking.languagePref, paymentId: payment.id,
      }).catch(() => ({ success: false }));
      await prisma.bookingPayment.updateMany({
        where: { id: payment.id, emailStatus: { not: "SENT" } },
        data: { emailStatus: email.success ? "SENT" : "FAILED" },
      });
    } catch {
      console.error("[payment.operation.reconcile-failed]", { code: "PAYMENT_OPERATION_RETRY_FAILED" });
      await deferPaymentOperationRetry(operation.id).catch(() => undefined);
    }
    }
    if (operations.length < pageSize) break;
  }
  return { scanned, recovered, reviewed };
}
