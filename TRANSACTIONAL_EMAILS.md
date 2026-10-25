# Transactional email operations

Existing SMTP transport and Resend SDK are reused; no package, schema, migration,
queue name, production configuration or service deployment is changed.

`lib/email.ts` preserves the public helper API. `lib/email/types.ts` and
`schema.ts` define/validate an allowlisted registry. All messages have localized
HTML and text. The existing `EmailDelivery` table supplies unique logical keys,
atomic claims, attempt counts and delivery evidence. The existing outbox worker
processes email intents with its existing bounded concurrency. Email jobs use
bounded exponential queue backoff (30/60/120/240/480 seconds, six queue attempts),
allowing recovery of a crashed sender's two-minute lease. Other realtime events
retain their original retry cadence. Creation/assignment/payment email intents commit with the domain
transaction. SMTP is never called inside those transactions.

Password reset remains synchronous and account-enumeration-safe. Reset tokens
are never placed in outbox payloads or Redis IDs. Dispatch payment-link mail
remains synchronous to preserve the operator's actual `emailSent` result;
transient failures also enqueue a bounded retry. Queued does not mean delivered.
The approved 30-minute Checkout expiration is unchanged.

Configuration names (values must not be logged):

- SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_SECURE
- SMTP_FROM / EMAIL_FROM (sender; separate from recipients)
- EMAIL_REPLY_TO (optional; validated)
- RESEND_API_KEY (existing alternative provider)
- APP_ORIGIN (preferred trusted origin; HTTPS required in production)
- Existing origin aliases: NEXT_PUBLIC_SITE_URL, PUBLIC_SITE_URL, APP_URL,
  NEXT_PUBLIC_BASE_URL
- ADMIN_BOOKING_EMAIL (dedicated booking mailbox), with legacy
  BOOKING_NOTIFICATION_EMAIL / ADMIN_EMAIL fallbacks

Before rollout, ensure the existing Admin booking recipient setting points to
the Project Owner's dedicated booking mailbox. Do not replace sender credentials
with the recipient. Missing recipient configuration fails explicitly; there is
no hardcoded recipient fallback. No configuration values were inspected or changed locally.
The existing realtime/outbox worker must run; no additional worker is required.

Provider deadlines: 10-second SMTP connect/TLS handshake, 30-second idle socket,
60-second SMTP send/Resend request. SMTP authentication requires verified TLS.
Maximum four delivery attempts; permanent rejection fails immediately. An atomic
two-minute processing lease allows recovery after a crashed sender. Delivery
records retain SENT/FAILED evidence using existing database storage. No automatic
purge of dedupe evidence is introduced. Completed queue jobs retain the existing
1,000-job cap; email failure jobs also use a 1,000-job cap, while durable database
failure evidence remains available. Other queues/events retain their original policy.

Replayed creation/assignment events reuse independent passenger/Admin delivery
keys. Assignment messages re-check committed ownership immediately before
delivery, suppressing messages for former Drivers and terminal bookings.

SMTP cannot provide absolute exactly-once delivery across the boundary between
provider acceptance and recording SENT: a crash in that interval can make a
recovered attempt ambiguous. Resend uses a hashed provider idempotency key;
its provider retention window also limits that guarantee. SENT records prevent
ordinary replay, reconciliation and worker-restart duplicates. Never describe
provider acceptance as proof that a recipient read or received the message.

No cancellation, Driver onboarding/security or trip-completion email is added:
no existing authoritative email hook was found for those categories. Existing
card payment receipts are preserved. Driver scheduled reminders remain persisted
notifications/realtime only; their timing and readiness behavior are unchanged.

Run `npm run test:email` for deterministic tests. Provider delivery and persistence
are replaced in tests; tests never send real mail or access a database.
