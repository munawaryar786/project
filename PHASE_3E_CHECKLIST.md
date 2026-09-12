# Drivo Phase 3E Live Map / Navigation Checklist

## Mandatory audit before implementation
- [x] Verify clean `phase-3d-realtime-infrastructure` baseline at `5a12ddd`.
- [x] Audit driver dashboard, existing map/location code and Phase 3B trip lifecycle.
- [x] Audit Google Maps/Routes helpers, keys, distance APIs and loading patterns.
- [x] Audit Phase 3D realtime client signal/refetch integration.
- [x] Audit UX1 fare-distance authority and preserve the 136 km â†’ â‚¬125.60 regression.
- [x] Document server-authoritative navigation architecture and Phase 3F+ boundaries.

## Navigation architecture and security
- [x] Create centralized server navigation leg mapping.
- [x] Add authenticated assigned-driver navigation route API.
- [x] Derive origin/destination/leg from authoritative booking state.
- [x] Enforce exact-location privacy and no arbitrary client coordinates/destinations.
- [x] Add booking revision/state and stale-response protections.
- [x] Integrate approved Google Routes provider with server-only key handling.
- [x] Add route cost controls, max-age/deviation thresholds and safe caching.
- [x] Add controlled GPS quality/location state handling without background-tracking claims.
- [x] Preserve REST authority for ARRIVED/START/COMPLETE and Phase 3B presence.
- [x] Add safe external Google Maps fallback for assigned current leg.

## Driver map UX
- [x] Build focused reusable navigation map/status/CTA components.
- [x] Implement pickup route for ASSIGNED/CONFIRMED/DRIVER_ENROUTE.
- [x] Implement ARRIVED waiting state and server-derived waiting timer.
- [x] Implement START TRIP route switch to destination.
- [x] Implement destination route and COMPLETE cleanup/summary.
- [x] Implement rerouting/refresh thresholds and polyline/marker lifecycle.
- [x] Add ETA/distance, GPS/network status, accessibility text alternatives and mobile layout.
- [x] Preserve Assisted, Children historical and WAV operational fields without medical leakage.

## Verification and release gate
- [x] Add `npm run test:phase3e` covering required 57 navigation/security scenarios (61 static/source assertions).
- [x] Run Phase 3D, 3C, 3B, 3A and UX1 regressions.
- [x] Run diff, Prisma, typecheck, lint and build checks.
- [x] Document production env/API-key restrictions, proxy/cost/quota prerequisites.
- [x] Prepare staging E2E and read-only production checks; do not execute production changes.
- [x] Leave all Phase 3E changes uncommitted; do not push/deploy/migrate/db-push/seed.

## Evidence boundary

Static/source and local tests do not replace real mobile GPS, Google Routes quota, route failures, browser sizes, staging reverse-proxy/realtime, or production database verification. Those remain explicit prerequisites.
