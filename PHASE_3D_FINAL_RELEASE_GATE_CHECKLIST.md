# Phase 3D Final Release Gate Checklist

- [x] Read final release-gate requirements before verification.
- [x] Confirm expected branch, parent commit ancestry, and uncommitted Phase 3D boundary.
- [x] Inventory every changed/new file and classify purpose.
- [x] Audit runtime dependencies and lockfile parity.
- [x] Verify separated Next.js, Socket.IO and BullMQ/outbox processes.
- [x] Audit WebSocket transport, Origin, cookie session auth, namespaces and rooms.
- [x] Audit all socket handlers for absence of authoritative commands.
- [x] Audit every emitted payload for PII/secrets/coordinates.
- [x] Audit Redis configuration, connection ownership and failure semantics.
- [x] Audit exact Prisma schema/index changes and production synchronization impact.
- [x] Audit Outbox states, CAS claims, stale leases and all crash windows.
- [x] Audit BullMQ queues, job IDs, retries and permanent-failure handling.
- [x] Audit offer expiry scheduling, authority and DB reconciliation.
- [x] Audit decline, accept and trip lifecycle REST authority.
- [x] Audit notification model, dedupe and driver/admin API ownership.
- [x] Audit passenger decision, dashboard refetch, polling, reconnect and accessibility.
- [x] Confirm no Phase 3E/3F/3G/3H implementation.
- [x] Run Phase 3D, 3C, 3B, 3A and UX1 checks.
- [x] Run Prisma, TypeScript, lint, build and diff checks.
- [x] Prepare safe production read-only queries and staging E2E plan.
- [x] Record all real Redis/Mongo/browser/staging checks not run as prerequisites.
- [x] Leave changes uncommitted; do not push, deploy, migrate, db-push or write production data.

## Evidence boundary

Static/source checks, local Prisma validation/generation, typecheck, lint and build are the available evidence. Real Redis/TLS, Mongo race/index inspection, cross-process adapter, reverse-proxy cookies, browser reconnect/accessibility and staging end-to-end tests remain deployment prerequisites.
