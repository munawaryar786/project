# PHASE 3J FINAL RELEASE CHECKLIST

## Scope and safety

- [x] Current branch is `phase-3j-twilio-whatsapp-auth-recovery`.
- [x] Branch ancestry contains `05c6153`.
- [x] Work remains uncommitted and unpushed.
- [x] No merge, deployment, migration, Prisma push, seed, production write, or Twilio Console change was performed.
- [x] Complete changed/new file inventory is recorded in the final report.

## Twilio Verify authority

- [x] Active registration send path reaches `sendWhatsAppVerification`.
- [x] Send wrapper calls Twilio Verify v2 `verifications.create`.
- [x] Active registration path does not call local OTP generation.
- [x] Active registration path does not use Programmable Messaging as OTP authority.
- [x] Active registration path requests `channel: "whatsapp"`.
- [x] No active registration WhatsApp-to-SMS fallback remains.
- [x] Active verification reaches `checkWhatsAppVerification`.
- [x] Verify wrapper calls `verificationChecks.create`.
- [x] Only provider status `approved` can create Drivo verification state.
- [x] Provider errors are generic and sanitized.
- [x] Twilio account, auth, and Verify Service configuration are server-only.
- [x] No `NEXT_PUBLIC_*` Twilio secret is present.
- [x] No actual secret values were printed or added.

## Local OTP and storage audit

- [x] Active registration does not generate a second OTP.
- [x] Active registration does not compare a submitted code against Mongo.
- [x] Active registration persists only the `TWILIO_VERIFY` metadata sentinel and challenge state.
- [x] No OTP is placed in cookies, localStorage, sessionStorage, URLs, logs, or responses.
- [x] `lib/utils.ts` `generateOTP` is classified unused legacy code.
- [x] `lib/twilio.ts` `sendSMSOTP`/`messages.create` is classified isolated unused legacy delivery code.
- [x] Legacy `PassengerOtp` and `OTP` schema fields are retained without active authority.
- [x] Historical architecture reports are classified documentation, not runtime authority.
- [x] Phone password-reset send/verify endpoints are deprecated non-issuing compatibility shims.

## Normalization and account lookup

- [x] Normalization is centralized in `normalizePassengerPhone`.
- [x] E.164 output is validated.
- [x] `+421` is the explicit primary-market default.
- [x] Slovak local leading-zero input is supported.
- [x] Whitespace, punctuation, `+`, and `00` forms are handled.
- [x] Explicit country context keeps the algorithm multi-country capable.
- [x] Registration, booking resolution, and returning login use the same normalizer.
- [x] Legacy formatted phone lookup compares canonical values safely.
- [x] Existing accounts do not route to registration solely due formatting.
- [x] Email normalization trims and case-normalizes consistently.
- [x] Phone and email collision checks do not silently merge accounts.

## Login and registration security

- [x] Returning mobile plus password resolves the passenger and creates a canonical session without OTP.
- [x] Returning email plus password trims/case-normalizes and creates a canonical session without OTP.
- [x] Invalid identifier/password responses are generic.
- [x] Login uses bcrypt and preserves authVersion, secure cookies, CSRF, and origin policy.
- [x] Login brute-force rate limiting is present and documented as process-local.
- [x] Browser-controlled `verified=true` is not an account-create authority.
- [x] Account creation requires a server-side, short-lived, single-use verification proof.
- [x] Verify replay is prevented by an atomic metadata claim.
- [x] Account-create replay/race is prevented by atomic proof consumption and phone uniqueness/application checks.
- [x] Legacy active passengers are not forced through new WhatsApp OTP for login.

## Forgot Password and reset

- [x] Passenger Forgot Password UI requests a registered email only.
- [x] Reset request response is enumeration-safe.
- [x] Legacy phone reset endpoints cannot be reached by the current Forgot Password UI.
- [x] Reset token/proof is cryptographically opaque, hashed at rest, expiring, scoped, and single-use.
- [x] Reset token and password values are not logged.
- [x] Completion resolves the passenger safely and hashes the new password with bcrypt.
- [x] Completion invalidates the proof atomically.
- [x] Completion revokes sessions/trusted devices and increments authVersion.
- [x] Old password fails after reset according to Phase 3A policy.
- [x] New mobile and email password login paths remain available without OTP.
- [x] Reset completion does not send the user into first-time WhatsApp verification.

## Protection and regression gates

- [x] IP, normalized-phone, resend-cooldown, Verify-attempt, login, and reset-request controls are present.
- [x] Process-memory rate-limit behavior and multi-instance gap are documented.
- [x] CSRF/origin/session protections remain intact.
- [x] Modified login UI has labels, focusable controls, keyboard operation, alert/status feedback, and touch-sized buttons.
- [x] New public strings remain compatible with the existing translation architecture.
- [x] Phase 3J focused checks pass: 42/42.
- [x] Phase 3I regression passes: 84/84.
- [x] Homepage regression passes: 17/17.
- [x] Phase 3H regression passes: 146/146.
- [x] Phase 3G regression passes: 109/109.
- [x] Phase 3F regression passes: 96/96.
- [x] Phase 3E regression passes: 61/61.
- [x] Phase 3D regression passes: 62/62.
- [x] Phase 3C regression passes: 59/59.
- [x] Phase 3B regression passes: 67 static plus 45 isolated behavioral checks.
- [x] Phase 3A security regression passes.
- [x] UX1 regression passes, including pricing/Children/WAV checks.
- [x] Prisma validation and generation pass without schema synchronization.
- [x] TypeScript, lint, diff, and build gates pass.

## Honest staging and deployment prerequisites

- [x] Real Twilio/WhatsApp testing is explicitly classified as not run.
- [x] Real returning-login and reset-email staging plans are prepared.
- [x] Multi-instance Redis rate-limit validation plan is prepared.
- [x] Production duplicate-phone/email, sender, Verify SID, SMTP, Mongo race, backup, and rollback prerequisites are documented.
- [ ] Real Twilio Verify API delivery test.
- [ ] Real Slovak +421 WhatsApp delivery test.
- [ ] Multi-instance durable Redis rate-limit test.
