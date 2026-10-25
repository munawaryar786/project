# HOMEPAGE SERVICE PRIORITY CHECKLIST

Baseline: phase-3h-advanced-admin-operations at 8471556 Add advanced admin operations control center.
Scope: focused public UX/content update only. No pricing, booking business logic, dispatch, driver/admin, ledger, scheduled logic, migrations, deployment, commit, or push.

| # | Audit item | Finding before implementation |
|---:|---|---|
| 1 | Current homepage hero source | app/page.tsx Hero uses hero.badge2, hero.title, hero.subtitle, and one /book CTA over the existing Drivo hero layout. |
| 2 | Homepage CTA routing | Existing CTA routes to /book without a service query; booking page already accepts ?service= and normalizes it server/client-side. |
| 3 | Homepage service cards | app/page.tsx ServicesSection renders real local images but orders Standard, Airport, Accessible, Children. |
| 4 | Booking selector component | components/booking/BookingForm.tsx owns the selector and already renders real image assets with canonical service values. |
| 5 | Existing public ordering | No canonical public priority order existed; selector followed standard, airport, accessible, children. |
| 6 | Children feature flag | isCustomerServiceEnabled() hides children whenever NEXT_PUBLIC_CHILDREN_TRANSPORT_ENABLED is false; backend/admin/driver/historical support remains separate. |
| 7 | Assisted preselection | /book?service=accessible is already normalized to accessible and passed as initialServiceType. |
| 8 | Airport preselection | /book?service=airport is already normalized to airport and passed as initialServiceType. |
| 9 | Existing image assets | Local Drivo taxi, airport, WAV, senior, and children JPEG assets exist in public/. |
| 10 | Translation architecture | Public strings use lib/i18n translations EN/SK/DE/UK through useLanguage(). |
| 11 | WAV wording/behavior | Existing WAV booking decision flow and transfer questions are in BookingForm; homepage hero must keep strong WAV wording and must not add a coming-soon hero label. |
| 12 | Responsive behavior | Existing hero and selector use responsive Tailwind layouts, focusable buttons, and image fill; the longer copy needs explicit overflow-safe checks. |

Implementation target: update only copy, ordering, CTA query links, selector presentation, and localized strings; preserve all business logic and feature-flag behavior.
