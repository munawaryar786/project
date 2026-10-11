import { prisma } from "@/lib/prisma";
import { emailAddress, EmailError } from "./config";
import { renderTransactionalEmail } from "./templates";
import { deliverTransactionalEmail, type DeliveryStore } from "./delivery";
import { deliverEmail } from "./client";
import type { DeliveryResult, TransactionalEmail } from "./types";
import { validateTransactionalEmail } from "./schema";

const emailStore: DeliveryStore = {
  findUnique: (args) => prisma.emailDelivery.findUnique(args),
  create: (args) => prisma.emailDelivery.create(args),
  updateMany: (args) => prisma.emailDelivery.updateMany(args),
};

export async function sendTransactionalEmail(input: TransactionalEmail, options: { synchronous?: boolean } = {}): Promise<DeliveryResult> {
  try {
    input = validateTransactionalEmail(input);
    emailAddress(input.recipient); renderTransactionalEmail(input);
    if (options.synchronous) return await deliverTransactionalEmail(input, emailStore, deliverEmail);
    if (input.type === "PASSWORD_RESET") throw new EmailError("EMAIL_RESET_QUEUE_FORBIDDEN");
    const key = "email:" + input.idempotencyKey;
    await prisma.outboxEvent.upsert({ where: { idempotencyKey: key }, create: { eventType: "TRANSACTIONAL_EMAIL", aggregateType: "Email", aggregateId: input.correlationId, idempotencyKey: key, payload: input as unknown as import("@prisma/client").Prisma.InputJsonValue, state: "PENDING" }, update: {} });
    return { success: true, provider: "outbox", warning: "EMAIL_QUEUED" };
  } catch (error) {
    const code = error instanceof EmailError ? error.code : "EMAIL_ENQUEUE_FAILED";
    console.error("[email.request.failed]", { emailType: input.type, code });
    return { success: false, provider: "none", error: code };
  }
}

type ProcessingDependencies = {
  findAssignment: (bookingId: string) => Promise<{ driverId: string | null; acceptedAt: Date | null; status: string } | null>;
  findPayment?: (paymentId: string) => Promise<{ status: string; expiresAt: Date } | null>;
  recordPaymentEmail?: (paymentId: string, emailStatus: string) => Promise<void>;
  deliver: (input: TransactionalEmail) => Promise<DeliveryResult>;
};
const processingDependencies: ProcessingDependencies = {
  findAssignment: async (bookingId: string) => await prisma.booking.findUnique({ where: { id: bookingId }, select: { driverId: true, acceptedAt: true, status: true } }),
  findPayment: async (paymentId: string) => await prisma.bookingPayment.findUnique({ where: { id: paymentId }, select: { status: true, expiresAt: true } }),
  recordPaymentEmail: async (paymentId: string, emailStatus: string) => { await prisma.bookingPayment.updateMany({ where: { id: paymentId }, data: { emailStatus } }); },
  deliver: (input: TransactionalEmail) => deliverTransactionalEmail(input, emailStore, deliverEmail),
};
export async function processTransactionalEmail(input: TransactionalEmail, dependencies: ProcessingDependencies = processingDependencies): Promise<void> {
  input = validateTransactionalEmail(input);
  let paymentId: string | undefined;
  if (input.type === "PASSWORD_RESET") throw new EmailError("EMAIL_RESET_QUEUE_FORBIDDEN");
  if (input.type === "DISPATCH_PAYMENT_LINK") {
    const expiresAt = new Date(input.data.expiresAt).getTime();
    if (expiresAt <= Date.now()) return;
    paymentId = input.idempotencyKey.match(/^DISPATCH_PAYMENT_LINK:([a-f0-9]{24})$/i)?.[1];
    if (!paymentId) throw new EmailError("EMAIL_PAYMENT_ID_INVALID");
    const payment = await (dependencies.findPayment || processingDependencies.findPayment!)(paymentId);
    // A delayed retry must not send an expired, paid or superseded session.
    if (!payment || payment.status !== "PENDING" || payment.expiresAt.getTime() !== expiresAt) return;
  }
  if (input.assignment) {
    const booking = await dependencies.findAssignment(input.assignment.bookingId);
    if (!booking || booking.driverId !== input.assignment.driverId || booking.acceptedAt?.getTime() !== input.assignment.assignedAtMs || ["CANCELLED", "COMPLETED", "NO_SHOW"].includes(booking.status)) return;
  }
  const result = await dependencies.deliver(input);
  if (paymentId) await (dependencies.recordPaymentEmail || processingDependencies.recordPaymentEmail!)(paymentId, result.success ? "SENT" : "FAILED");
  if (!result.success && result.retryable) throw new EmailError(result.error || "EMAIL_TRANSIENT_FAILURE", true);
  if (!result.success) console.error("[email.delivery.failed]", { emailType: input.type, correlationId: input.correlationId, code: result.error || "EMAIL_PERMANENT_FAILURE" });
}
