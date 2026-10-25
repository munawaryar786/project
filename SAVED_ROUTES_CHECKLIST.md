# Saved Routes: traceability and evidence checklist

## Architecture / implementation source checks (local snapshot)
- [x] Original live/VPS source snapshot reviewed and preserved
- [x] Standalone passenger-owned SavedRoute model and auto-save preference implemented in source
- [x] User ownership scope and canonical passenger auth/CSRF via shared authorization helper
- [x] First-booking Save Route / Not Now / Save Always buttons implemented
- [x] Save Always preference persisted and later eligible bookings auto-saved after committed booking creation
- [x] Explicit-only manual Children route support behind feature flag, no automatic child-route saving
- [x] No medical/child/contact/payment/price fields persisted in templates
- [x] My Saved Routes listing and toggle preference in passenger dashboard
- [x] Book Again link restores route, service, bags, passengers and general airport preference
- [x] Renaming/editing/deleting owned routes from dashboard
- [x] Fresh quote required / no auto booking, payment or stale schedule restoration
- [x] Four-language EN/SK/DE/UK copy implemented
- [x] 34 isolated behavior/source assertions run against extracted source, pass
- [x] TS/TSX syntax transpilation of changed files passed

## Release / integration verification — NOT yet complete
- [ ] Apply patch safely after exact SHA source match and archive backup
- [ ] Prisma validation and client generation in isolated workspace
- [ ] Full typecheck, lint and Next.js build with actual VPS dependencies
- [ ] Full security, pricing, dispatch, passenger-auth and localization regression suite
- [ ] Isolated MongoDB replica set: schema synchronization, indexes, transaction behavior
- [ ] Isolated API test: ownership/IDOR, CSRF/origin, saved route replay/dedupe/limit/concurrency
- [ ] User/browser E2E: guest -> account -> first booking -> save; returning user -> Book Again
- [ ] Browser accessibility: keyboard, mobile, screen reader, contrast and focus states
- [ ] Translation QA across 4 locales
- [ ] Production deployment separately approved with rollback plan and zero customer disruption
- [ ] Other Drivo Master release requirements audited/closed, not implied by Saved Routes tests
