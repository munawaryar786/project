# PHASE 3J TWILIO WHATSAPP OTP ARCHITECTURE AUDIT

Audit mode: architecture/audit only. No source, schema, package, provider, environment, database, or production configuration was changed. No commit, push, merge, deploy, migration, seed, Prisma DB push, Twilio resource, Meta/WABA resource, or production write was performed.

## A. CURRENT OTP PROVIDER

The application currently uses the Twilio Node SDK through `lib/twilio.ts`, but it does not use Twilio Verify. It uses Twilio Programmable Messaging `client.messages.create` for SMS and WhatsApp.

The development/no-provider path returns a local `console` method without sending a provider message. The production path is enabled only when `TWILIO_ACCOUNT_SID` exists and `NODE_ENV` is `production`.

## B. CURRENT OTP GENERATION AUTHORITY

Drivo locally generates a six-digit code with `crypto.randomInt` in `lib/utils.ts`. Registration writes the plaintext code to the `OTP.code` field. Phone password-reset send still generates its code with `Math.random` and writes it to `PassengerOtp.code`.

Twilio currently transports the locally generated code; Twilio does not generate or govern the code. This is an architecture mismatch with the requested Twilio Verify target.

## C. CURRENT OTP VERIFICATION AUTHORITY

`app/api/otp/verify/route.ts` reads the latest local OTP, compares `otpRecord.code` with the submitted code, checks expiry/attempts, then atomically marks the row used and creates a local verification proof. `lib/otp.ts` has a second legacy local comparison path with a transaction.

Twilio Verify Check is not called. The current authority is the Drivo database plus local comparison, not Twilio Verify.

## D. CURRENT DELIVERY CHANNEL

Classification: `WHATSAPP` first through Programmable Messaging, then automatic `SMS` fallback. This is not Twilio Verify and is not compliant with the Phase 3J locked policy that WhatsApp is the only approved first-registration channel. Development can be `LOCAL`/console when provider configuration is absent.

## E. TWILIO SDK / API USAGE

`package.json` and `package-lock.json` contain `twilio` version `6.0.2`. It is imported only by `lib/twilio.ts`. Current calls are `client.messages.create` for SMS and WhatsApp. No `verify.v2.services(...).verifications.create` or `verificationChecks.create` usage exists. The package was not upgraded.

## F. TWILIO ENV VARIABLE NAMES

Referenced by current source: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`, and optional `TWILIO_WHATSAPP_TEMPLATE_SID`.

Not referenced by current source: `TWILIO_API_KEY`, `TWILIO_API_SECRET`, and `TWILIO_VERIFY_SERVICE_SID`. The checked-in `.env.example` does not document any Twilio variable names. Names-only inspection of the local `.env` found no Twilio variables; no values were printed.

Implementation-stage target configuration will need the approved server-side Verify credentials and `TWILIO_VERIFY_SERVICE_SID`, with the precise credential mode selected from the installed SDK/provider account. No values are present in this report.

## G. CURRENT SEND ROUTE

`POST /api/otp/send` validates booking/phone/purpose, normalizes the phone, invalidates previous unused local OTP rows, generates a local code, stores it in `OTP.code`, and calls `sendOTPWithFallback` only in production. It returns delivery method and purpose, not the code. The route is rate-limited to three requests per five minutes by an in-memory per-IP key.

The route is registration/legacy-password-setup oriented and does not call a Verify service. Booking/account state checks can reveal whether a booking exists or whether an account requires a legacy setup; this is not a fully generic Verify-style response.

## H. CURRENT VERIFY ROUTE

`POST /api/otp/verify` validates the booking and latest local OTP, rejects expiry/attempt exhaustion/mismatch, uses an atomic `updateMany` claim, creates a `PassengerVerificationProof`, and updates booking verification state. It does not call Twilio Verify Check.

The legacy `lib/otp.ts` verifier remains a second local path. Any future implementation must converge both supported registration paths on one provider authority and one local CAS state transition.

## I. PHONE NORMALIZATION

`normalizePassengerPhone` strips common formatting, accepts `+` and `00` prefixes, removes non-digits, and prepends `+` to other input. It does not safely convert a national Slovak number such as `0903 123 456` to `+421...` without an approved country-context input. It is therefore not a complete E.164 policy for multi-country production.

Phase 3J implementation must require or derive an approved country code, validate E.164 output, and keep the platform multi-country capable. No unsafe Slovakia default should be hardcoded.

## J. FIRST-TIME-ONLY BEHAVIOR

The intended first-time path is represented by registration OTP followed by proof/account setup. Existing password-bearing passengers are rejected from registration OTP with an account-exists/login-required response. Normal returning login uses password and does not require OTP.

The hidden standalone passenger OTP login UI/API remnants are not the approved returning-login path and should remain disabled or be removed only during implementation after compatibility review.

## K. PASSWORD LOGIN REGRESSION

`POST /api/passenger/login/password` accepts phone or email plus password, normalizes the identifier, uses bcrypt, returns a generic invalid-credentials response, and creates the canonical passenger session. No OTP is required for normal returning login.

## L. PASSWORD RESET REGRESSION

The Phase 3I registered-email reset flow is the approved forgot-password path and must remain email-only. The older phone reset routes still generate and deliver a local OTP through `sendOTPWithFallback`; that path conflicts with the Phase 3J requirement that WhatsApp OTP not be used for password reset. Implementation must preserve the email reset route and decide the safe deprecation/compatibility treatment of phone reset routes.

## M. RATE LIMIT / RESEND / ATTEMPT CONTROLS

Current local controls are in-memory and keyed by forwarded IP plus route scope. Registration send is three per five minutes; registration verify is five per five minutes; password-reset phone send/verify are five per fifteen minutes. Previous unused registration OTP rows are invalidated on resend. Local OTP rows have five-minute expiry and max attempts.

There is no durable per-phone limiter, no distributed limiter, and no explicit provider-aware cooldown beyond the local rate window. Twilio provider errors are converted to generic results, but WhatsApp failure currently triggers SMS fallback. Local controls must remain alongside Verify; they must not be removed because Verify has its own limits.

## N. LOGGING / SECRET EXPOSURE

OTP values are not printed by the registration route, but `lib/twilio.ts` logs full destination phone numbers and message SIDs for successful SMS/WhatsApp sends. Provider error messages are logged. The local password-reset OTP path logs only error text, not the code. Twilio credentials are not printed or returned.

The full-phone logging and provider-message logging should be masked/sanitized during implementation. Verify status/error categories should be mapped to generic user responses without exposing provider internals.

## O. CLIENT / SERVER BOUNDARY

Twilio SDK import and credential reads are server-side in `lib/twilio.ts` and server API routes. No `NEXT_PUBLIC_TWILIO_AUTH_TOKEN` or `NEXT_PUBLIC_TWILIO_API_SECRET` reference exists. Browser requests contain phone/code/business identifiers only; credentials are not sent to the client.

## P. WHATSAPP SENDER / WABA REQUIREMENTS

Production requires a Twilio WhatsApp Sender, connected WhatsApp Business Account, and Meta/Twilio sender approval/configuration. With Twilio Verify, the Verify Service and approved WhatsApp sender/template configuration should own channel delivery; the application should pass the normalized destination and `channel: "whatsapp"`, not invent a sender address.

No sender or WABA was configured by this audit.

## Q. SENDER API VERSION AUDIT

No Twilio sender-provisioning API usage was found in the repository. No old Senders API v1 dependency was found. Sender/WABA provisioning is external provider-console/configuration work.

## R. SMS FALLBACK STATUS

Automatic WhatsApp-to-SMS fallback exists in `sendOTPWithFallback` and is called by registration and phone password-reset routes. User-facing WhatsApp failure text explicitly suggests SMS. This is a Phase 3J policy mismatch because no SMS fallback is approved for first registration in this phase.

## S. PHASE 3I SCHEMA COMPATIBILITY

Existing `OTP` and `PassengerOtp` models store plaintext local codes, expiry, used state, attempts, purpose, booking/passenger identity, and reset/login attempt metadata. `PassengerVerificationProof` stores a hashed proof token and verification timestamps/state. Passenger phone verification, authVersion, sessions, and trusted devices remain compatible with Verify becoming the code authority.

For implementation, local rows should retain booking/passenger binding, challenge purpose, resend/abuse metadata, provider status/reference, and one-time local state. Plaintext provider code storage should become obsolete. A reviewed schema design is needed to make code optional or replace it with Verify challenge metadata; no schema change is proposed or made in this audit.

## T. CONCURRENCY / IDEMPOTENCY DESIGN

Proposed send design: canonical E.164 plus booking/purpose and a short cooldown/idempotency bucket should be atomically claimed locally before calling Verify, with a deterministic challenge identity recorded for audit. Double clicks must not create unbounded provider verifications.

Proposed verify design: call Verify Check, then atomically claim the local challenge/proof with `consumedAt`/verified state. Concurrent checks may both receive an approved provider response, but only one local CAS claim may create the registration proof. Account creation must use normalized-phone/email collision protection and a database uniqueness preflight/index decision before concurrent account creation is accepted.

## U. TARGET TWILIO VERIFY WHATSAPP ARCHITECTURE

A. Send OTP: `POST /api/otp/send` validates first-time registration state, produces approved E.164, applies local IP/phone/cooldown controls, then server-side calls the installed SDK's Verify v2 service with `to` and `channel: "whatsapp"`. No local OTP code is generated or sent. The database stores challenge/provider metadata and registration binding only.

B. Verify OTP: `POST /api/otp/verify` validates the challenge binding, calls Verify v2 `verificationChecks.create` with normalized phone and submitted code, accepts only provider status `approved`, then atomically consumes local challenge state and creates the existing verification proof.

C. Complete account creation: existing account route consumes the hashed proof once, handles phone/email collision safely, hashes the password, marks the passenger active/verified, associates the booking, increments legacy authVersion where applicable, and creates the canonical session.

D. Returning login: existing phone/email plus bcrypt password and canonical session flow remains unchanged; no Verify call.

E. Forgot password: registered email reset remains the sole password-reset path; no WhatsApp OTP is used for password reset.

## V. REQUIRED CODE CHANGES

Implementation phase only: add a server-side Verify client/service wrapper using the installed SDK; add names-only Verify configuration documentation; replace local registration code generation/comparison with Verify create/check; remove automatic SMS fallback from first registration; retain local abuse controls and atomic registration state; map provider errors to generic responses; mask phone/provider logging; finalize E.164 input policy; make local challenge storage provider-metadata based rather than plaintext-code based; preserve email reset; and safely deprecate or isolate phone-reset OTP routes.

No code changes were made in this audit phase.

## W. REQUIRED ENV / PROVIDER CONFIGURATION

Names-only checklist: `TWILIO_ACCOUNT_SID` and approved server credential (`TWILIO_AUTH_TOKEN` or account-approved API key/secret pair); `TWILIO_VERIFY_SERVICE_SID`; Twilio WhatsApp Sender; WABA/Meta approval; `PUBLIC_SITE_URL`/`APP_ORIGIN` for public flows; distributed rate-limit/Redis configuration; and monitoring/alerting configuration. Current `TWILIO_PHONE_NUMBER` and `TWILIO_WHATSAPP_TEMPLATE_SID` belong to the existing Programmable Messaging path and should not be silently reused as Verify configuration.

## X. REAL STAGING E2E PLAN

1. Use a new Slovak mobile number and provide an approved country code.
2. Confirm Drivo produces a valid E.164 destination.
3. Request registration OTP and verify the provider event is Twilio Verify WhatsApp, not Messaging SMS.
4. Confirm the OTP arrives in WhatsApp through the approved WABA/sender.
5. Reject an invalid code, approve the correct code, reject the same code again, and test expiry.
6. Enter email/details, create a password, receive the canonical session, and log out.
7. Return with mobile/email plus password and prove no WhatsApp OTP is requested.
8. Test double-send, resend cooldown, concurrent verify, provider timeout/auth/configuration failure, unsupported WhatsApp destination, rate limit, and generic user errors.
9. Request forgot password for a registered email and prove only the email reset flow is used.
10. Complete reset, reject the old reset link, verify old-session behavior, and log in with the new password.

## Y. RISKS / BLOCKERS

Architecture mismatches requiring implementation review: local plaintext OTP authority; no Twilio Verify create/check; Programmable Messaging instead of Verify; automatic SMS fallback; incomplete multi-country E.164 normalization; full phone/provider identifiers in logs; in-memory IP-only controls; legacy phone-reset OTP path; undocumented Twilio variables; and no durable provider challenge metadata.

These are implementation-phase blockers for the target behavior, not reasons to alter code during this audit-only gate. Production blockers include Verify Service/Sender/WABA approval, approved authentication template/provider configuration, real credentials, real Slovak WhatsApp delivery, distributed rate-limit capacity, staging concurrency evidence, and duplicate-phone/email preflight.

## Z. git status --short

```text
?? PHASE_3J_TWILIO_WHATSAPP_OTP_ARCHITECTURE.md
```

PHASE 3J ARCHITECTURE GATE: PASS