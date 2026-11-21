# Phase 1 payment compatibility

## CASH evidence

`Booking.cashAgreed` records the customer's agreement to pay before the trip. It is an assignment prerequisite, not evidence that money changed hands. For a current CASH trip, Driver START requires the existing explicit confirmation and atomically writes one `CashCollection` with the server-priced EUR minor amount, assigned Driver, assignment timestamp, confirmation time, and deterministic operation key. Trip START and the collection either both commit or both roll back. Earnings mark `cashCollected` true only when this record matches the booking and Driver.

Historical CASH trips without `CashCollection` have **LEGACY_UNKNOWN_UNVERIFIED** collection status. Their existing earnings and ledger entries remain historical records; neither customer consent nor a prior `DriverEarning.cashCollected` value proves actual receipt or remittance. No automatic backfill, collection, or payout adjustment is authorized.

## CARD evidence

Current public Checkout settlement requires a signed Stripe webhook with matching booking ID/reference, `payment_status=paid`, authoritative booking amount, and EUR currency. Booking confirmation, the linked `PaymentWebhookEvent` evidence, and the payment email outbox intent commit in one MongoDB transaction. The receipt stores the provider session/payment identifiers, amount, currency, and paid time. Duplicate delivery uses the unique Stripe event ID and outbox key. An independently verified retry can repair a failed or incomplete receipt; `Booking.status=CONFIRMED` alone is never payment proof.

Dispatcher CARD bookings continue to use their matching `BookingPayment` record. Previously linked public `PaymentWebhookEvent` rows from the old signed webhook flow may lack the newly optional amount/currency fields; those exact linked, processed Stripe receipts remain eligible. New enriched receipts must match the current authoritative amount and EUR currency. An unlinked event or a confirmed booking without payment evidence remains ineligible for assignment.

## Historical reconciliation, for a separately authorized Admin operation

1. Inventory historical CARD bookings read-only by booking source, status, payment method, and presence of a matching paid `BookingPayment` or linked processed Stripe webhook receipt. Classify missing evidence as **UNVERIFIED**, not paid.
2. For an individual unverified booking, an authorized financial Admin obtains genuine Stripe evidence through an approved operational process. Verify the Stripe account, session/payment identity, paid state, booking metadata/reference, exact amount, EUR currency, event timing, and absence of an already bound payment before proposing any correction.
3. Record the evidence and proposed change for review. Apply any reconciliation only through a separately approved, audited procedure with idempotency and rollback. Never infer payment from booking status, customer claims, a payment success page, or an email.

This phase provides no automatic historical mutation or Stripe contact.

## Release dependency

The application code depends on the additive `CashCollection` model and its unique booking/operation indexes, plus optional receipt fields. A future coordinated release must establish those database indexes before enabling writes to the new model. This local change does not run a production schema operation, backfill, provider call, or deployment.
