# PHASE 3I CHECKLIST

Baseline: homepage-accessibility-service-priority at 9d8db4c Prioritize accessible mobility across homepage and booking.
Scope: passenger authentication, booking communications, admin escalation, and quote reliability audit/repair only. No commit, push, deployment, migration, db push, seed, or production writes.

| # | Audit area | Existing architecture / finding |
|---:|---|---|
| 1 | Passenger model | Passenger exists with unique phone, optional normalizedPhone/email, phoneVerified, passwordHash, profileCompleted, status, authVersion. |
| 2 | Phone fields | Passenger.phone is unique; normalizedPhone is indexed and used by auth queries; centralized normalizePassengerPhone exists. |
| 3 | Verification fields | phoneVerified/phoneVerifiedAt plus PassengerVerificationProof and PassengerOtp support verification. |
| 4 | OTP implementation | PassengerOtp and legacy Booking OTP models exist; proof tokens are opaque, expiring, consumed once. |
| 5 | OTP provider | lib/twilio.ts provides SMS/WhatsApp fallback; no second provider is needed. |
| 6 | Password hashing | bcryptjs is used for account creation, login comparison, and reset. |
| 7 | Login routes/forms | Password login currently accepts normalized phone; passenger login UI and booking auth flows already exist. |
| 8 | Canonical session | lib/passenger-auth.ts creates/verifies canonical signed sessions and upgrades legacy sessions. |
| 9 | authVersion | Canonical session payload includes authVersion; reset increments it and revokes sessions/devices. |
| 10 | Reset request flow | Existing reset flow is phone + OTP based, not the required registered-email reset flow. |
| 11 | Reset completion | Existing proof/token completion is expiring, single-use, bcrypt-backed, and session-invalidating. |
| 12 | Email/account profile | Passenger email is optional in schema but account creation requires it; email uniqueness is not currently modeled. |
| 13 | SMTP/mail | lib/email.ts supports SMTP, Resend, console, and none providers with configured sender/admin recipient. |
| 14 | Email templates | booking-emails.ts contains branded HTML/text booking/admin templates; password-reset template is not present. |
| 15 | Logo assets | public Drivo logo assets exist; email template branding is text-based and can safely reference configured site/logo URL. |
| 16 | Booking lifecycle | booking creation and payment/webhook paths already confirm bookings and start dispatch through authoritative services. |
| 17 | Payment/webhook | Stripe webhook updates payment/confirmation atomically and ignores browser amounts; retries are guarded. |
| 18 | Confirmation emails | sendCustomerConfirmation/sendBookingCompletionEmails exist, but trigger/idempotency must be audited for exactly-one invoice semantics. |
| 19 | Dispatch exhausted | Phase 3C emits DISPATCH_EXHAUSTED; Phase 3D worker creates persistent admin notifications and realtime signals. |
| 20 | Outbox/BullMQ | OutboxEvent, relay, BullMQ queues, worker, and deterministic job IDs already exist. |
| 21 | Phase 3H integration | Admin operations provides safe assignment/release, audit, bounded views, alerts, and outbox visibility. |
| 22 | Quote/distance APIs | lib/booking-quote.ts and pricing-engine.ts are authoritative paths; booking distance endpoint uses calculateAuthoritativeBookingQuote. |
| 23 | Quote engine duplication | Legacy lib/pricing.ts and RouteMap estimate code also exist; they must remain non-authoritative and be covered by source checks. |
| 24 | Google route provider | lib/google-maps.ts and lib/navigation/routes.ts exist; passenger quote path must use pickup-to-destination only. |
| 25 | PricingSettings precedence | pricing-engine-config.ts loads PricingSettings defaults/overrides from Mongo. |
| 26 | PricingTier precedence | pricing-engine-config.ts loads active PricingTier rows and falls back to approved progressive defaults. |
| 27 | Assistance pricing | pricing-engine.ts contains pro-rata assistance charge and approved defaults. |
| 28 | Waiting pricing | pricing-engine.ts contains service-specific free thresholds/rates. |
| 29 | Airport/Tourism pricing | quote engine has airport optional charges; service-specific config is server-authoritative. |
| 30 | Passenger estimate | PriceEstimate/booking estimate use canonical quote response; browser amount is not trusted. |
| 31 | Stripe amount authority | checkout derives amount from authoritative quote and MAC/ownership guards. |
| 32 | Invoice/receipt | Existing confirmation/payment receipt templates exist; legal metadata is not configured as a full statutory invoice model. |
| 33 | Localization | lib/i18n LanguageContext and EN/SK/DE/UK catalogs are established. |
| 34 | Security/rate limits | canonical auth, Origin/CSRF, rate-limit scopes, masking, and generic auth errors exist; email reset needs equivalent controls. |
| 35 | Production read-only plans | UX1 and Phase 3H plans exist; Phase 3I must add a no-PII account/email/pricing/distance audit plan before implementation. |

Architecture lock:
- Reuse Passenger, PassengerOtp, PassengerVerificationProof, canonical sessions/authVersion, Twilio, lib/email.ts, existing outbox/BullMQ, Phase 3C dispatch, Phase 3H operations, and lib/booking-quote.ts.
- Add only missing email reset/invoice idempotency and notification wiring where no equivalent exists.
- Do not create AuthV2, EmailV2, PricingV2, BookingV2, a second quote engine, or a second dispatch engine.
