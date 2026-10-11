import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { emailAddress, emailHeader, emailOrigin, EmailError, providerFailure } from "../lib/email/config";
import { getSmtpConfig, resendDeliveryResult } from "../lib/email/client";
import { renderTransactionalEmail, EMAIL_TYPES, emailLocale, localPickup } from "../lib/email/templates";
import { validateTransactionalEmail } from "../lib/email/schema";
import { deliverTransactionalEmail, MAX_EMAIL_ATTEMPTS, EMAIL_LEASE_MS, type DeliveryStore, type DeliveryRecord } from "../lib/email/delivery";
import { processBookingEmailEvent, isCurrentEmailAssignment } from "../lib/email/booking-events";
import { processTransactionalEmail } from "../lib/email/send";
import { writeBookingAssignedEmail, writeBookingCreatedEmail, writeBookingPaymentEmail } from "../lib/email/domain";
import { outboxRetryOptions } from "../lib/outbox-relay";
import translations from "../lib/i18n/index";
import type { TransactionalEmail, BookingMail, EmailData, DeliveryResult } from "../lib/email/types";

const env = { NODE_ENV: "production", APP_ORIGIN: "https://drivo.example" };
const id = "000000000000000000000001", driverA = "000000000000000000000002", driverB = "000000000000000000000003";
const now = Date.UTC(2027, 0, 10, 8);
const realNow = Date.now;
Date.now = () => now;
const booking: BookingMail = { bookingRef: "DR-TEST", pickupAt: new Date(now + 3600000).toISOString(), marketTimezone: "Europe/Bratislava", pickupAddress: '<script>alert("x")</script>', destination: "Destination & <b>test</b>", serviceType: "STANDARD", amount: 12.5, paymentMethod: "CASH" };
const assigned = { ...booking, driverName: "Driver <img src=x>", vehicle: "Brand Model", registration: "BA-TEST" };
const fixtures: EmailData = {
  BOOKING_RECEIVED: booking, BOOKING_CONFIRMED: booking, ADMIN_BOOKING_CREATED: booking, ADMIN_ASSISTED_COPY: booking, ADMIN_NO_DRIVER: booking,
  DRIVER_CONFIRMED: assigned, ADMIN_DRIVER_CONFIRMED: assigned,
  PAYMENT_RECEIPT: { bookingRef: "DR-TEST", amount: 12.5 },
  DISPATCH_PAYMENT_LINK: { bookingRef: "DR-TEST", amount: "EUR 12.50", url: "https://checkout.stripe.com/c/pay/test", expiresAt: new Date(now + 30 * 60000).toISOString() },
  PASSWORD_RESET: { token: "PRIVATE_RESET_FIXTURE", attemptId: "reset-test", expiresAt: new Date(now + 10 * 60000).toISOString() },
};
const request = (type: keyof EmailData = "BOOKING_RECEIVED", key = "test:" + type): TransactionalEmail => ({ type, data: fixtures[type], recipient: "customer@example.invalid", locale: "sk", idempotencyKey: key, correlationId: id } as TransactionalEmail);
const capture: string[] = [];
const originalLog = console.info;
console.info = (...args) => { capture.push(JSON.stringify(args)); };
let assertions = 0;
function check(fn: () => void) { fn(); assertions++; }

function memoryStore() {
  const records = new Map<string, DeliveryRecord>();
  const store: DeliveryStore = {
    async findUnique({ where }) { const value = records.get(where.logicalKey); return value ? { ...value } : null; },
    async create({ data }) {
      if (records.has(data.logicalKey)) throw new Error("duplicate");
      const value = { status: "PENDING", attempts: 0, updatedAt: new Date(now), recipient: data.recipient };
      records.set(data.logicalKey, value); return { ...value };
    },
    async updateMany({ where, data }) {
      const row = records.get(String(where.logicalKey));
      if (!row) return { count: 0 };
      if (where.OR) {
        const stale = row.status === "PROCESSING" && +row.updatedAt < now - EMAIL_LEASE_MS;
        if (!(row.status === "PENDING" || row.status === "RETRY" || stale) || row.attempts >= MAX_EMAIL_ATTEMPTS) return { count: 0 };
      } else if (row.status !== where.status || row.attempts !== where.attempts) return { count: 0 };
      if (typeof data.status === "string") row.status = data.status;
      if (data.attempts && typeof data.attempts === "object" && "increment" in data.attempts) row.attempts += Number(data.attempts.increment);
      row.updatedAt = new Date(now);
      return { count: 1 };
    },
  };
  return { store, records };
}

async function main() {
  check(() => assert.equal(emailAddress(" customer@example.invalid "), "customer@example.invalid"));
  for (const bad of ["a@example.invalid\r\nBcc: x@test.invalid", "bad", "Name <a@example.invalid>"]) check(() => assert.throws(() => emailAddress(bad), EmailError));
  check(() => assert.throws(() => emailHeader("Drivo\nBcc: injected"), EmailError));
  check(() => assert.equal(emailOrigin(env), "https://drivo.example"));
  for (const APP_ORIGIN of ["http://drivo.example", "https://evil.example@drivo.example", "https://localhost", "https://drivo.example/path"]) check(() => assert.throws(() => emailOrigin({ ...env, APP_ORIGIN }), EmailError));
  check(() => assert.throws(() => emailOrigin({ NODE_ENV: "production" }), EmailError));
  const smtp = { SMTP_HOST: "smtp.example.invalid", SMTP_PORT: "465", SMTP_USER: "fixture", SMTP_PASS: "PRIVATE_SMTP_FIXTURE", SMTP_FROM: "Drivo <sender@example.invalid>" };
  check(() => assert.equal(getSmtpConfig(smtp)?.secure, true));
  check(() => assert.equal(getSmtpConfig({}) , null));
  check(() => assert.equal(getSmtpConfig({ ...smtp, SMTP_PASS: "" }), null));
  check(() => assert.throws(() => getSmtpConfig({ ...smtp, SMTP_PORT: "invalid" }), EmailError));
  check(() => assert.throws(() => getSmtpConfig({ ...smtp, SMTP_FROM: "x\r\nBcc: y" }), EmailError));
  check(() => assert.equal(resendDeliveryResult({ data: { id: "provider-fixture" }, error: null }).success, true));
  check(() => assert.equal(resendDeliveryResult({ data: null, error: null }).success, false, "missing provider acknowledgment is not success"));
  check(() => assert.equal(resendDeliveryResult({ data: null, error: { name: "rate_limit_exceeded" } }).retryable, true));
  check(() => assert.equal(resendDeliveryResult({ data: null, error: { name: "validation_error" } }).retryable, false));
  const keySet = Object.keys(translations.en).filter((k) => k.startsWith("email.")).sort();
  for (const locale of ["en", "sk", "de", "uk"] as const) {
    check(() => assert.deepEqual(Object.keys(translations[locale]).filter((k) => k.startsWith("email.")).sort(), keySet));
    for (const serviceType of ["STANDARD", "SENIOR", "ACCESSIBLE", "AIRPORT", "RENTAL"]) {
      const input = { ...request(), locale, data: { ...booking, serviceType } } as TransactionalEmail;
      check(() => assert.ok(renderTransactionalEmail(input, env).text.includes(translations[locale]["email.service"] + ": " + translations[locale]["service." + serviceType]), "service labels use existing locale keys rather than raw enums"));
    }
    for (const type of EMAIL_TYPES) {
      const input = { ...request(type), locale };
      const rendered = renderTransactionalEmail(input, env);
      check(() => assert.ok(rendered.subject.startsWith("Drivo") && rendered.html.includes(`<html lang="${locale}">`) && rendered.text.length > 40));
      check(() => assert.ok(!/email\.[A-Z_]+\.(title|intro)/.test(rendered.html + rendered.text)));
      check(() => assert.ok(!rendered.html.includes("<script>") && !rendered.html.includes("<img src=x>")));
      if (type === "PASSWORD_RESET") check(() => assert.ok(rendered.html.includes("https://drivo.example/passenger/reset?") && !rendered.html.includes("localhost")));
    }
  }
  check(() => assert.match(translations.uk["email.BOOKING_RECEIVED.intro"], /[\u0400-\u04ff]/));
  check(() => assert.ok(translations.sk["email.BOOKING_RECEIVED.intro"].includes("Vaša rezervácia")));
  check(() => assert.equal(emailLocale("slovak"), "sk"));
  check(() => assert.equal(emailLocale("unknown"), "sk"));
  check(() => assert.match(localPickup({ pickupAt: "2027-01-10T09:00:00Z", marketTimezone: "Europe/Bratislava" }, "en"), /10:00/));
  check(() => assert.match(localPickup({ pickupAt: "2027-07-10T09:00:00Z", marketTimezone: "Europe/Bratislava" }, "en"), /11:00/));
  check(() => assert.match(localPickup({ pickupAt: "2027-03-28T01:30:00Z", marketTimezone: "Europe/Bratislava" }, "en"), /03:30/));
  const privateInput = { ...request(), data: { ...booking, passwordHash: "PRIVATE_HASH", token: "PRIVATE_TOKEN", medicalNotes: "PRIVATE_MEDICAL", specialNotes: "PRIVATE_NOTES", accessibilityDetails: "PRIVATE_ACCESSIBILITY", dispatchAudit: "PRIVATE_AUDIT", stripeSecret: "PRIVATE_STRIPE" } };
  const validated = validateTransactionalEmail(privateInput);
  check(() => assert.ok(!JSON.stringify(validated).includes("PRIVATE_")));
  check(() => assert.ok(!JSON.stringify(renderTransactionalEmail(validated, env)).includes("PRIVATE_")));
  check(() => assert.throws(() => renderTransactionalEmail({ ...request(), data: { ...booking, bookingRef: "ref\r\nBcc: x" } } as TransactionalEmail, env), EmailError));
  check(() => assert.throws(() => renderTransactionalEmail({ ...request("DISPATCH_PAYMENT_LINK"), data: { ...fixtures.DISPATCH_PAYMENT_LINK, url: "https://attacker.invalid/pay" } } as TransactionalEmail, env), EmailError));
  check(() => assert.throws(() => validateTransactionalEmail({ ...request(), idempotencyKey: "customer@example.invalid" }), EmailError));
  check(() => assert.throws(() => validateTransactionalEmail({ ...request(), type: "UNKNOWN" }), EmailError));

  let sends = 0;
  const good = async (): Promise<DeliveryResult> => { sends++; return { success: true, provider: "test" }; };
  const memory = memoryStore();
  await deliverTransactionalEmail(request(), memory.store, good, env);
  await deliverTransactionalEmail(request(), memory.store, good, env);
  check(() => assert.equal(sends, 1, "duplicate/restarted worker does not repeat successful delivery"));
  const concurrent = memoryStore(); let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let started: () => void = () => {};
  const start = new Promise<void>((resolve) => { started = resolve; });
  const first = deliverTransactionalEmail(request(), concurrent.store, async () => { sends++; started(); await gate; return { success: true, provider: "test" }; }, env);
  await start;
  await assert.rejects(deliverTransactionalEmail(request(), concurrent.store, good, env), /EMAIL_DELIVERY_BUSY/);
  release(); await first;
  check(() => assert.equal(concurrent.records.get(request().idempotencyKey)?.attempts, 1));
  const transient = memoryStore(); let attempts = 0;
  const eventually = async (): Promise<DeliveryResult> => ++attempts < 3 ? { success: false, provider: "test", error: "EMAIL_CONNECTION_FAILED", retryable: true } : { success: true, provider: "test" };
  for (let i = 0; i < 3; i++) await deliverTransactionalEmail(request(), transient.store, eventually, env);
  check(() => assert.equal(transient.records.get(request().idempotencyKey)?.status, "SENT"));
  const permanent = memoryStore(); let rejected = 0;
  const bad = async (): Promise<DeliveryResult> => { rejected++; return { success: false, provider: "test", error: "EMAIL_SMTP_550", retryable: false }; };
  for (let i = 0; i < 5; i++) await deliverTransactionalEmail(request(), permanent.store, bad, env);
  check(() => assert.equal(rejected, 1));
  const exhausted = memoryStore(); let repeated = 0;
  for (let i = 0; i < 8; i++) await deliverTransactionalEmail(request(), exhausted.store, async () => { repeated++; return { success: false, provider: "test", retryable: true, error: "EMAIL_CONNECTION_FAILED" }; }, env);
  check(() => assert.equal(repeated, MAX_EMAIL_ATTEMPTS));
  check(() => assert.equal(exhausted.records.get(request().idempotencyKey)?.status, "FAILED"));
  const stale = memoryStore(); stale.records.set(request().idempotencyKey, { recipient: request().recipient, status: "PROCESSING", attempts: 1, updatedAt: new Date(now - EMAIL_LEASE_MS - 1) });
  await deliverTransactionalEmail(request(), stale.store, good, env);
  check(() => assert.equal(stale.records.get(request().idempotencyKey)?.status, "SENT"));
  const finalCrash = memoryStore();
  finalCrash.records.set(request().idempotencyKey, { recipient: request().recipient, status: "PROCESSING", attempts: MAX_EMAIL_ATTEMPTS, updatedAt: new Date(now - EMAIL_LEASE_MS - 1) });
  await deliverTransactionalEmail(request(), finalCrash.store, good, env);
  check(() => assert.equal(finalCrash.records.get(request().idempotencyKey)?.status, "FAILED", "crashed final attempt leaves durable failure evidence"));
  check(() => assert.equal(providerFailure({ code: "ECONNRESET", message: "PRIVATE_TOKEN" }).code, "EMAIL_CONNECTION_FAILED"));
  const retry = outboxRetryOptions("TRANSACTIONAL_EMAIL");
  check(() => assert.equal(retry.attempts, 6));
  check(() => assert.equal(retry.backoff?.type, "exponential"));
  check(() => assert.equal(retry.removeOnFail?.count, 1000, "email failures cannot grow Redis retention without bound"));
  check(() => assert.ok((retry.backoff?.delay || 0) * 7 > EMAIL_LEASE_MS, "retry window recovers a stale sender lease"));
  check(() => assert.deepEqual(outboxRetryOptions("DRIVER_OFFER_ACCEPTED"), {}, "existing realtime retry cadence unchanged"));
  await deliverTransactionalEmail(request("PASSWORD_RESET"), memoryStore().store, async () => ({ success: false, provider: "test", error: "PRIVATE_RESET_FIXTURE PRIVATE_SMTP_FIXTURE", retryable: false }), env);
  check(() => assert.ok(!capture.join("\n").includes("PRIVATE_") && !capture.join("\n").includes("customer@example.invalid") && !capture.join("\n").includes("checkout.stripe.com")));

  const queued = new Map<string, TransactionalEmail>();
  const row = { id, bookingRef: booking.bookingRef, customerEmail: request().recipient, languagePref: "slovak", status: "ASSIGNED", driverId: driverA, acceptedAt: new Date(now), scheduledRide: true, pickupAt: new Date(booking.pickupAt), pickupDate: null, pickupTime: null, scheduledDate: "2027-01-10", scheduledTime: "10:00", marketTimezone: "Europe/Bratislava", pickupAddress: booking.pickupAddress, dropoffAddress: booking.destination, serviceType: "STANDARD", fareTotalFare: 12.5, estimatedPrice: 999, paymentMethod: "CASH", driver: { fullName: "Driver A", vehiclePlate: null, vehicleType: "STANDARD", vehicle: { brand: "Brand", model: "Model", plateNumber: "BA-TEST", type: "STANDARD" } } };
  const deps = { findBooking: async () => row, adminRecipient: () => "admin@example.invalid", enqueue: async (input: TransactionalEmail) => { queued.set(input.idempotencyKey, input); return { success: true, provider: "test" }; } };
  const event = { eventType: "BOOKING_EMAIL_ASSIGNED", aggregateId: id, payload: { driverId: driverA, assignedAtMs: now } };
  await processBookingEmailEvent({ ...event, eventType: "BOOKING_EMAIL_CREATED" }, deps);
  await processBookingEmailEvent(event, deps);
  await processBookingEmailEvent(event, deps);
  check(() => assert.equal(queued.size, 4, "independent passenger/admin creation and assignment deliveries"));
  check(() => assert.equal((queued.get("BOOKING_RECEIVED:" + id)?.data as BookingMail).amount, 12.5, "stored authoritative fare, no recalculation"));
  const oldMessage = queued.get("DRIVER_CONFIRMED:" + id + ":" + driverA + ":" + now)!;
  row.driverId = driverB; row.acceptedAt = new Date(now + 1);
  await processBookingEmailEvent(event, deps);
  await processBookingEmailEvent({ ...event, payload: { driverId: driverB, assignedAtMs: now + 1 } }, deps);
  check(() => assert.equal(queued.size, 6, "replacement assignment has a distinct identity"));
  let delivered = 0;
  const processing = { findAssignment: async () => row, deliver: async () => { delivered++; return { success: true, provider: "test" }; } };
  await processTransactionalEmail(oldMessage, processing);
  check(() => assert.equal(delivered, 0, "pending email for Driver A is suppressed after reassignment"));
  const fresh = queued.get("DRIVER_CONFIRMED:" + id + ":" + driverB + ":" + (now + 1))!;
  await processTransactionalEmail(fresh, processing);
  check(() => assert.equal(delivered, 1));
  for (const status of ["CANCELLED", "COMPLETED", "NO_SHOW"]) {
    row.status = status; await processTransactionalEmail(fresh, processing);
    check(() => assert.equal(delivered, 1));
  }
  check(() => assert.equal(isCurrentEmailAssignment({ driverId: null, acceptedAt: null, status: "CONFIRMED" }, event.payload), false));
  row.status = "PENDING"; row.customerEmail = "";
  const before = queued.size;
  await processBookingEmailEvent({ ...event, eventType: "BOOKING_EMAIL_CREATED" }, deps);
  check(() => assert.equal(queued.size, before, "missing email safely skips passenger; Admin remains deduped"));
  row.customerEmail = "invalid-address";
  await processBookingEmailEvent({ ...event, eventType: "BOOKING_EMAIL_CREATED" }, deps);
  check(() => assert.equal(queued.size, before, "invalid historical customer email does not block Admin delivery"));
  row.customerEmail = request().recipient;
  const customerOnly: TransactionalEmail[] = [];
  await assert.rejects(processBookingEmailEvent({ ...event, eventType: "BOOKING_EMAIL_CREATED" }, { ...deps, adminRecipient: () => { throw new EmailError("EMAIL_ADMIN_RECIPIENT_MISSING"); }, enqueue: async (input) => { customerOnly.push(input); return { success: true, provider: "test" }; } }), /EMAIL_ADMIN_RECIPIENT_UNAVAILABLE/);
  check(() => assert.deepEqual(customerOnly.map((input) => input.type), ["BOOKING_RECEIVED"], "missing Admin configuration does not block customer delivery"));
  await processBookingEmailEvent({ ...event, eventType: "BOOKING_EMAIL_PAYMENT", payload: { paymentId: "payment-fixture", amount: 12.5 } }, deps);
  check(() => assert.ok(queued.has("BOOKING_CONFIRMATION_INVOICE:" + row.bookingRef), "legacy SENT key remains authoritative after deployment"));
  const legacySent = memoryStore();
  const legacyInvoice = queued.get("BOOKING_CONFIRMATION_INVOICE:" + row.bookingRef)!;
  legacySent.records.set(legacyInvoice.idempotencyKey, { recipient: legacyInvoice.recipient, status: "SENT", attempts: 1, updatedAt: new Date(now) });
  const sendCount = sends;
  await deliverTransactionalEmail(legacyInvoice, legacySent.store, good, env);
  check(() => assert.equal(sends, sendCount, "previously sent invoice is not re-sent by the new service"));
  const paymentLink = { ...request("DISPATCH_PAYMENT_LINK"), idempotencyKey: "DISPATCH_PAYMENT_LINK:" + id } as TransactionalEmail;
  let recordedEmailStatus = "";
  const linkDeps = { ...processing, findPayment: async () => ({ status: "PENDING", expiresAt: new Date(now + 30 * 60000) }), recordPaymentEmail: async (_id: string, status: string) => { recordedEmailStatus = status; } };
  const deliveredBeforeLink = delivered;
  await processTransactionalEmail(paymentLink, linkDeps);
  check(() => assert.equal(delivered, deliveredBeforeLink + 1));
  check(() => assert.equal(recordedEmailStatus, "SENT", "asynchronous delivery updates the operator's persisted emailed status"));
  for (const status of ["PAID", "CANCELLED", "EXPIRED"]) {
    await processTransactionalEmail(paymentLink, { ...linkDeps, findPayment: async () => ({ status, expiresAt: new Date(now + 30 * 60000) }) });
    check(() => assert.equal(delivered, deliveredBeforeLink + 1, "obsolete payment session is not emailed"));
  }
  await assert.rejects(processBookingEmailEvent({ ...event, eventType: "BOOKING_EMAIL_CREATED" }, { ...deps, enqueue: async () => ({ success: false, provider: "test" }) }), /EMAIL_ENQUEUE_FAILED/);
  await assert.rejects(processTransactionalEmail(request(), { ...processing, deliver: async () => ({ success: false, provider: "test", retryable: true, error: "EMAIL_CONNECTION_FAILED" }) }), /EMAIL_CONNECTION_FAILED/);

  const intents: { eventType: string; payload: unknown; idempotencyKey: string }[] = [];
  const tx = { outboxEvent: { create: async ({ data }: { data: typeof intents[number] }) => { intents.push(data); return data; } } };
  await writeBookingCreatedEmail(tx, id); await writeBookingAssignedEmail(tx, id, driverB, new Date(now + 1)); await writeBookingPaymentEmail(tx, id, "payment-fixture", 12.5);
  check(() => assert.deepEqual(intents.map((x) => x.eventType), ["BOOKING_EMAIL_CREATED", "BOOKING_EMAIL_ASSIGNED", "BOOKING_EMAIL_PAYMENT"]));
  check(() => assert.ok(!JSON.stringify(intents).includes("customer@example.invalid") && !JSON.stringify(intents).includes("PRIVATE_")));
  for (const file of ["lib/driver-operations.ts", "lib/scheduled-marketplace.ts", "lib/admin-operations.ts", "app/api/admin/bookings/route.ts"]) check(() => assert.ok(readFileSync(file, "utf8").includes("await writeBookingAssignedEmail(tx,")));
  const transport = readFileSync("lib/email/client.ts", "utf8");
  check(() => assert.ok(transport.includes("EMAIL_TLS_REQUIRED") && !transport.includes("rejectUnauthorized: false") && transport.includes("AbortSignal.timeout(60_000)") && transport.includes("EMAIL_CONNECTION_TIMEOUT")));
  check(() => assert.ok(readFileSync("lib/realtime/queues.ts", "utf8").includes('type: "exponential"')));
  check(() => assert.ok(!readFileSync("app/api/passenger/password-reset/email/route.ts", "utf8").includes("error.message")));
  console.info = originalLog; Date.now = realNow;
  console.log(`Transactional email checks passed (${assertions} grouped assertions): all templates/locales, privacy, URLs, configuration, concurrency, bounded retries, assignment/reassignment, payment intents and mocked delivery.`);
}
main().catch((error) => { console.info = originalLog; Date.now = realNow; console.error(error); process.exitCode = 1; });
