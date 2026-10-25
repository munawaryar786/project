# DRIVO - HOMEPAGE + PUBLIC SERVICE PRIORITY UPDATE REPORT

## A. IMPLEMENTATION STATUS

PASS for feature-branch review. This is a focused public UX/content update on the existing Drivo architecture. No pricing, booking business logic, dispatch, driver/admin, scheduled rides, realtime, navigation, ledger, migration, deployment, commit, or push was performed.

## B. CHECKLIST

Created and completed [HOMEPAGE_SERVICE_PRIORITY_CHECKLIST.md](HOMEPAGE_SERVICE_PRIORITY_CHECKLIST.md). It audits the current hero, CTA routing, homepage cards, booking selector, ordering, feature flag, preselection, assets, translations, WAV flow, and responsive source behavior before implementation.

## C. BASELINE / BRANCH

- Branch: phase-3h-advanced-admin-operations.
- HEAD: 8471556 Add advanced admin operations control center.
- The worktree contains only this focused homepage/service-priority update on top of the approved baseline.
- No database or production operation was run.

## D. HERO FILES CHANGED

- app/page.tsx: hero CTAs and homepage service ordering.
- lib/i18n/translations/en.ts, sk.ts, de.ts, uk.ts: localized hero copy and CTA labels.
- Existing hero structure, navbar, WhatsApp block, social proof, stats, background, and visual identity remain intact.

## E. FINAL HERO COPY

English:
- Badge: Specialized Accessible Mobility & Door-to-Door Care
- H1: Accessible Mobility, Senior Assistance & Airport Transfers in Bratislava
- Subheadline: Dedicated wheelchair-accessible vehicles (WAV) and door-to-door personal assistance for seniors, ZŤP passengers, medical appointments, and airport transfers across Bratislava and surrounding regions.
- Primary CTA: Book Accessible Ride
- Secondary CTA: Book Airport Transfer

Natural localized equivalents were added for Slovak, German, and Ukrainian.

## F. CTA ROUTING / PRESELECTION

- Accessible CTA routes to /book?service=accessible.
- Airport CTA routes to /book?service=airport.
- These reuse the existing normalizeBookingService and BookingForm initialServiceType flow. No duplicate booking flow was created.

## G. HOMEPAGE SERVICE PRIORITY RESULT

Homepage cards now appear in this public priority:
1. Assisted & Accessible Transport
2. Airport Transfers
3. Standard Taxi
4. Children, only when the existing public feature flag enables it.

Standard Taxi remains available. Backend and historical service support are unchanged.

## H. BOOKING SELECTOR ORDER RESULT

components/booking/BookingForm.tsx now presents:
1. Assisted & Accessible Transport
2. Airport Transfers
3. Standard Taxi
4. Children only when isCustomerServiceEnabled permits it.

Canonical service identifiers are reused; no service types were duplicated.

## I. BOOKING SELECTOR IMAGE RESULT

The selector remains image-led with existing local assets:
- Assisted: /drivo-wav-wheelchair.jpeg
- Airport: /drivo-airport-transfer.jpeg
- Standard: /drivo-taxi-service.jpeg
- Children: existing children asset, still feature-flagged.

The generic icon is no longer the main card representation. Cards have larger image areas, readable overlay copy, selected state, aria-pressed state, and visible focus rings.

## J. CHILDREN VISIBILITY RESULT

Children Transport remains hidden from customer-facing selectors when NEXT_PUBLIC_CHILDREN_TRANSPORT_ENABLED is false through the existing isCustomerServiceEnabled() architecture. Backend, admin, driver, historical records, and compatibility logic were not removed or changed.

## K. WAV SAFETY RESULT

The approved WAV and wheelchair-transfer decision flow remains intact, including canTransferToSeat, passengerRemainsInWheelchair, wheelchair requirements, and the existing WAV note. The homepage hero uses strong WAV wording and does not introduce a coming-soon label.

## L. TRANSLATIONS

New hero badge, H1, subheadline, and CTA keys are present in EN, SK, DE, and UK through the existing localization system. No separate localization mechanism or unnecessary hardcoded public English was added.

## M. ACCESSIBILITY / RESPONSIVE RESULT

Source/layout checks pass for overflow-safe hero copy, responsive CTA stacking, image-card contrast, semantic buttons, aria-pressed state, labels, focus-visible rings, and touch-sized controls. The existing responsive breakpoints support 375px, 768px, and 1440px layouts. No real browser screenshot run was performed in this gate.

## N. UX1 / PRICING SAFETY

test:ux1 passed. The required pricing conversion 136000m -> 136 km -> EUR 125.60 remains intact. No quote, fare, assistance fee, waiting fee, Stripe amount, or distance logic was changed.

## O. PHASE 3A-3H REGRESSION RESULTS

All passed:
- Phase 3A security: passed.
- Phase 3B: 67 static + 45 isolated behavioral checks.
- Phase 3C: 59/59.
- Phase 3D: 62/62.
- Phase 3E: 61/61.
- Phase 3F: 96/96.
- Phase 3G: 109/109.
- Phase 3H: 146/146.
- Focused homepage/service-priority checks: 17/17.

The checks are static or isolated unless explicitly stated; no real production database, Redis, browser, Google, Stripe, or staging integration was used.

## P. BUILD / TYPECHECK / LINT

- git diff --check: passed with existing LF-to-CRLF warnings only.
- npx tsc --noEmit --pretty false: passed.
- npm run lint: passed.
- npm run build: passed.
- Existing middleware-to-proxy deprecation warning remains non-blocking.

## Q. FILES CHANGED

Modified:
- app/page.tsx
- components/booking/BookingForm.tsx
- lib/i18n/translations/en.ts
- lib/i18n/translations/sk.ts
- lib/i18n/translations/de.ts
- lib/i18n/translations/uk.ts
- package.json

Added:
- HOMEPAGE_SERVICE_PRIORITY_CHECKLIST.md
- scripts/homepage-priority-check.cjs

No files were deleted.

## R. git status --short

The expected uncommitted status is the seven modified files and two added files listed in section Q. No commit, push, merge, or deployment was performed.

HOMEPAGE / SERVICE PRIORITY COMMIT GATE: PASS
