# DRIVO Phase 3J Implementation Checklist

## Baseline and safety

- [x] Verified baseline branch `phase-3i-auth-booking-communications` at `05c6153`.
- [x] Created feature branch `phase-3j-twilio-whatsapp-auth-recovery`.
- [x] Preserved the completed architecture audit.
- [x] Kept the work uncommitted, unpushed, unmerged, and undeployed.
- [x] Did not change production Twilio, Meta/WABA, SMTP, MongoDB, credentials, or provider setup.

## Twilio Verify and first-time phone verification

- [x] Added server-only `TWILIO_VERIFY_SERVICE_SID` configuration documentation.
- [x] Added a Twilio Verify v2 WhatsApp send wrapper.
- [x] Added a Twilio Verify v2 verification-check wrapper.
- [x] Made `channel: "whatsapp"` explicit.
- [x] Removed local OTP generation from the active registration route.
- [x] Removed local OTP comparison from the active verification route.
- [x] Retained only non-secret challenge metadata; the actual Verify code is never stored.
- [x] Removed registration WhatsApp-to-SMS fallback.
- [x] Added safe provider errors for invalid number, delivery failure, timeout/rate-limit/configuration failure, invalid code, and expiry.
- [x] Added E.164 validation with explicit multi-country context and Slovak `+421` default.
- [x] Added per-IP and per-phone send limits, resend cooldown, verification limits, and atomic replay claims.
- [x] Preserved server-side verification proofs and atomic account handoff.
- [x] Preserved normalized phone collision checks and duplicate-account protection.

## Returning login

- [x] Audited the actual phone/email password-login route and UI.
- [x] Added canonical email normalization and case-insensitive lookup.
- [x] Added canonical phone normalization and legacy-format fallback lookup.
- [x] Preserved bcrypt comparison, generic failure responses, rate limiting, canonical session, authVersion, CSRF, and secure cookies.
- [x] Removed the returning-login UI OTP mode.
- [x] Added accessible Mobile or Email and Password labels/feedback.
- [x] Kept first-time verification directed through the booking registration flow.
- [x] Preserved legacy valid passenger compatibility.

## Forgot Password and reset security

- [x] Kept public Forgot Password request email-only and enumeration-safe.
- [x] Preserved secure reset email delivery, hashed proof, expiry, and one-time consumption.
- [x] Isolated legacy phone-reset endpoints as deprecated non-issuing compatibility endpoints.
- [x] Preserved a server-only legacy proof completion branch for old records; the normal UI cannot reach it.
- [x] Preserved secure bcrypt reset, session/trusted-device revocation, authVersion increment, and post-reset login.
- [x] Preserved mobile and email login after reset through canonical password login.
- [x] Kept reset UI free of phone/SMS/WhatsApp OTP controls.

## Compatibility and regressions

- [x] Preserved Phase 3I booking invoice, no-driver escalation, EmailDelivery idempotency, and reset email behavior.
- [x] Preserved booking pricing, distance, assistance, waiting, Stripe, Children flag, WAV, and homepage priority behavior.
- [x] Preserved accessibility and existing localization architecture.
- [x] Added `scripts/phase3j-check.cjs` and `npm run test:phase3j`.
- [x] Added deterministic source assertions for the reported login and reset bugs.
- [x] Ran the Phase 3J, Phase 3I, homepage, 3H, 3G, 3F, 3E, 3D, 3C, 3B, 3A, and UX1 gates.
- [x] Ran `npx prisma validate` and `npx prisma generate` only.
- [x] Ran diff check, typecheck, lint, and production build.
- [x] Documented honest local/static test scope and real staging plans/prerequisites.

## Known deployment prerequisites

- [ ] Real staging Twilio Verify WhatsApp delivery with a new Slovak number.
- [ ] Production Redis-backed rate limiting or an explicit deployment decision for the current process-memory limiter.
- [ ] Production read-only duplicate phone/email preflight and any required index review.
- [ ] SMTP delivery/Gmail rendering and Mongo concurrency validation in staging.
