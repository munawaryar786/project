# Phase 3B Driver Data, State and Operational Foundation Checklist

Final evidence and limitations are recorded in PHASE_3B_FINAL_RELEASE_REPORT.md. Browser and real Mongo checks are deployment prerequisites, not completed local tests.

- [x] 01. Create/verify dedicated `phase-3b-driver-state-foundation` branch and preserve approved baseline.
- [x] 02. Audit current driver, booking, auth, location, dispatch, offers, active-trip, admin, Children, Assisted, and polling code.
- [x] 03. Preserve Phase 3A canonical driver authentication, CSRF, Origin, authorization, payment, and tracking security.
- [x] 04. Centralize authoritative driver presence semantics: OFFLINE, AVAILABLE, BUSY, and LOCATION_NOT_READY.
- [x] 05. Implement authenticated online/offline/current-presence endpoint without cancelling active trips.
- [x] 06. Implement authenticated latest-location endpoint with strict coordinates, timing, and ownership validation.
- [x] 07. Implement authenticated heartbeat/presence foundation without ride reassignment.
- [x] 08. Add or complete production booking-offer model with statuses, expiry, indexes, and uniqueness protections.
- [x] 09. Add explicit server-side offer creation service for selected driver and expiry.
- [x] 10. Enforce pre-accept privacy for addresses, contact data, payment data, identity, and medical details.
- [x] 11. Implement authenticated own-offer listing with non-actionable expired/cancelled handling.
- [x] 12. Implement authenticated own-offer decline with deterministic errors and event support.
- [x] 13. Implement reusable server-authoritative offer expiration semantics and cleanup helper.
- [x] 14. Implement atomic acceptance with fail-closed transaction/concurrency protection.
- [x] 15. Centralize conflicting-active-trip detection.
- [x] 16. Document and enforce canonical trip lifecycle transitions.
- [x] 17. Implement explicit authenticated ARRIVED, START TRIP, COMPLETE TRIP commands.
- [x] 18. Implement authenticated active-trip retrieval with post-accept operational privacy.
- [x] 19. Release driver BUSY state on completion while preserving offline intent.
- [x] 20. Preserve existing Children historical/active operational compatibility.
- [x] 21. Preserve Assisted/Senior/ZTP/WAV operational fields with minimum necessary exposure.
- [x] 22. Add transactional outbox/domain-event foundation without relay workers.
- [x] 23. Audit booking version/stale-update mechanism and document the decision.
- [x] 24. Upgrade existing driver dashboard for presence, offers, expiry, active trip, and lifecycle actions.
- [x] 25. Apply mobile-first accessibility and safe action hierarchy.
- [x] 26. Standardize machine-readable Phase 3B error contracts.
- [x] 27. Preserve multi-city/future expansion boundaries.
- [x] 28. Add isolated `test:phase3b` regression suite with static, unit and mocked behavior coverage; staging gaps documented.
- [x] 29. Run static, security, UX1, TypeScript, lint, Prisma, and build checks.
- [x] 30. Perform security and 3C+ scope audits; leave all changes uncommitted for review.
