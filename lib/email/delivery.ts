import { emailAddress, emailHeader, EmailError, providerFailure } from "./config";
import { renderTransactionalEmail } from "./templates";
import type { DeliveryResult, RenderedEmail, TransactionalEmail } from "./types";
import type { Prisma } from "@prisma/client";

export const MAX_EMAIL_ATTEMPTS = 4;
export const EMAIL_LEASE_MS = 120_000;
export type DeliveryRecord = { status: string; attempts: number; updatedAt: Date; recipient: string };
export type DeliveryStore = {
  findUnique(args: { where: { logicalKey: string } }): Promise<DeliveryRecord | null>;
  create(args: { data: { logicalKey: string; kind: string; recipient: string } }): Promise<DeliveryRecord>;
  updateMany(args: { where: Prisma.EmailDeliveryWhereInput; data: Prisma.EmailDeliveryUpdateManyMutationInput }): Promise<{ count: number }>;
};
export type EmailTransport = (message: RenderedEmail & { to: string; idempotencyKey: string }) => Promise<DeliveryResult>;

// Provider calls have a shorter hard deadline than this persistent ownership lease.
export async function deliverTransactionalEmail(input: TransactionalEmail, store: DeliveryStore, transport: EmailTransport, env: Readonly<Record<string, string | undefined>> = process.env): Promise<DeliveryResult> {
  let recipient: string; let rendered: RenderedEmail;
  try { recipient = emailAddress(input.recipient); rendered = renderTransactionalEmail(input, env); emailHeader(rendered.subject); }
  catch (error) { const failure = providerFailure(error); return { success: false, provider: "none", error: failure.code, retryable: false }; }
  const logicalKey = input.idempotencyKey;
  let record = await store.findUnique({ where: { logicalKey } });
  if (!record) {
    try { record = await store.create({ data: { logicalKey, kind: input.type, recipient } }); }
    catch { record = await store.findUnique({ where: { logicalKey } }); }
  }
  if (!record) throw new EmailError("EMAIL_RECORD_UNAVAILABLE", true);
  if (record.status === "SENT") return { success: true, provider: "none", warning: "EMAIL_ALREADY_SENT" };
  if (record.status === "FAILED") return { success: false, provider: "none", error: "EMAIL_ATTEMPTS_EXHAUSTED", retryable: false };
  if (record.attempts >= MAX_EMAIL_ATTEMPTS) {
    if (record.status === "PROCESSING" && +record.updatedAt >= Date.now() - EMAIL_LEASE_MS) throw new EmailError("EMAIL_DELIVERY_BUSY", true);
    await store.updateMany({ where: { logicalKey, status: record.status, attempts: record.attempts }, data: { status: "FAILED", lastError: "EMAIL_ATTEMPTS_EXHAUSTED" } });
    return { success: false, provider: "none", error: "EMAIL_ATTEMPTS_EXHAUSTED", retryable: false };
  }
  if (record.recipient !== recipient) return { success: false, provider: "none", error: "EMAIL_RECIPIENT_CHANGED", retryable: false };
  const stale = new Date(Date.now() - EMAIL_LEASE_MS);
  const claimed = await store.updateMany({ where: { logicalKey, attempts: { lt: MAX_EMAIL_ATTEMPTS }, OR: [{ status: { in: ["PENDING", "RETRY"] } }, { status: "PROCESSING", updatedAt: { lt: stale } }] }, data: { status: "PROCESSING", attempts: { increment: 1 } } });
  if (claimed.count !== 1) throw new EmailError("EMAIL_DELIVERY_BUSY", true);
  const owned = await store.findUnique({ where: { logicalKey } });
  if (!owned || owned.status !== "PROCESSING") throw new EmailError("EMAIL_CLAIM_LOST", true);
  const attempt = owned.attempts;
  const started = Date.now();
  let result: DeliveryResult;
  try { result = await transport({ ...rendered, to: recipient, idempotencyKey: logicalKey }); }
  catch (error) { const failure = providerFailure(error); result = { success: false, provider: "none", error: failure.code, retryable: failure.retryable }; }
  if (result.error && !/^EMAIL_[A-Z0-9_]{1,70}$/.test(result.error)) result = { ...result, error: "EMAIL_PROVIDER_FAILED" };
  const retryable = !result.success && result.retryable === true && attempt < MAX_EMAIL_ATTEMPTS;
  await store.updateMany({ where: { logicalKey, status: "PROCESSING", attempts: attempt }, data: result.success ? { status: "SENT", sentAt: new Date(), lastError: null } : { status: retryable ? "RETRY" : "FAILED", lastError: result.error || "EMAIL_PROVIDER_FAILED" } });
  console.info("[email.delivery]", { emailType: input.type, correlationId: input.correlationId, attempt, provider: result.provider, status: result.success ? "SENT" : retryable ? "RETRY" : "FAILED", code: result.error, durationMs: Date.now() - started });
  return { ...result, retryable };
}
