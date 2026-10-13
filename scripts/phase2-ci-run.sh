#!/usr/bin/env bash
# GitHub-hosted runner only. Every database/queue lives in this run's containers.
set -euo pipefail

[[ "${CI:-}" == "true" && "${GITHUB_ACTIONS:-}" == "true" ]]
[[ "${GITHUB_RUN_ID:-}" =~ ^[0-9]+$ && "${GITHUB_RUN_ATTEMPT:-}" =~ ^[0-9]+$ ]]
[[ -z "${DATABASE_URL:-}" && -z "${REDIS_URL:-}" ]]
for forbidden in STRIPE_SECRET_KEY STRIPE_WEBHOOK_SECRET TWILIO_ACCOUNT_SID TWILIO_AUTH_TOKEN RESEND_API_KEY SMTP_HOST SMTP_PASS; do
  [[ -z "${!forbidden:-}" ]] || { echo "FAIL forbidden provider configuration is present"; exit 1; }
done
[[ ! -f .env && ! -f .env.local ]]

suffix="${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}"
network="drivo-phase2-ci-${suffix}"
mongo="drivo-phase2-mongo-${suffix}"
redis="drivo-phase2-redis-${suffix}"
run_id="$(openssl rand -hex 8)"
activation_db="drivo_ci_activation_${run_id}"
payment_db="drivo_phase2_test_${run_id}"
phase1_db="drivo_phase1_test_${run_id}"
outbox_db="drivo_ci_outbox"

# Reviewed immutable digests of official Linux images. Downloads happen before
# the sealed runtime is created. Docker never receives repository credentials.
mongo_image='mongo:7.0.43-jammy@sha256:f71f6d0913c945096cd058557cbadf4ad435007f378d84b3c4c636c928735e72'
redis_image='redis:7.4.11-alpine@sha256:858f009f9709ce576febc734aa78b8f6d624b82571f9ddb6bda4377c833b3499'
node_image='node:22-bookworm@sha256:0e5f906573693feaa1e21057ebdcfdb5bd5021f050b2dc7c9deceb629c7da2a8'
docker pull "$mongo_image" >/dev/null
docker pull "$redis_image" >/dev/null
docker pull "$node_image" >/dev/null

created_network=0
created_mongo=0
created_redis=0
cleanup() {
  if (( created_redis )); then docker rm -f "$redis" >/dev/null 2>&1 || true; fi
  if (( created_mongo )); then docker rm -f "$mongo" >/dev/null 2>&1 || true; fi
  if (( created_network )); then docker network rm "$network" >/dev/null 2>&1 || true; fi
}
trap cleanup EXIT

! docker network inspect "$network" >/dev/null 2>&1
! docker container inspect "$mongo" >/dev/null 2>&1
! docker container inspect "$redis" >/dev/null 2>&1
docker network create --driver bridge --internal "$network" >/dev/null
created_network=1
[[ "$(docker network inspect -f '{{.Internal}}' "$network")" == "true" ]]
docker run --rm -d --name "$mongo" --network "$network" "$mongo_image" \
  mongod --replSet rs0 --bind_ip 127.0.0.1 --port 27017 --noauth --quiet >/dev/null
created_mongo=1
for _ in $(seq 1 60); do
  if docker exec "$mongo" mongosh --quiet --eval 'db.adminCommand({ping:1}).ok' 2>/dev/null | grep -qx 1; then break; fi
  sleep 1
done
docker exec "$mongo" mongosh --quiet --eval 'db.adminCommand({ping:1}).ok' | grep -qx 1
docker exec "$mongo" mongosh --quiet --eval \
  'rs.initiate({_id:"rs0",members:[{_id:0,host:"127.0.0.1:27017"}]})' >/dev/null
for _ in $(seq 1 60); do
  if docker exec "$mongo" mongosh --quiet --eval 'db.hello().isWritablePrimary' 2>/dev/null | grep -qx true; then break; fi
  sleep 1
done
docker exec "$mongo" mongosh --quiet --eval 'db.hello().isWritablePrimary' | grep -qx true

start_redis() {
  docker run --rm -d --name "$redis" --network "container:$mongo" "$redis_image" \
    redis-server --bind 127.0.0.1 --port 6379 --save '' --appendonly no >/dev/null
  created_redis=1
  for _ in $(seq 1 30); do
    if docker exec "$redis" redis-cli -h 127.0.0.1 ping 2>/dev/null | grep -qx PONG; then break; fi
    sleep 1
  done
  docker exec "$redis" redis-cli -h 127.0.0.1 ping | grep -qx PONG
}
start_redis

ci_node() {
  local db="$1"; shift
  [[ "$db" =~ ^drivo_(ci_(activation_[a-f0-9]{16}|outbox)|phase[12]_test_[a-f0-9]{16})$ ]]
  local -a args=(
    --rm --network "container:$mongo"
    --mount "type=bind,src=$GITHUB_WORKSPACE,dst=/work,readonly"
    --workdir /work --cap-drop ALL --security-opt no-new-privileges
    --env CI=true --env NODE_ENV=test
    --env DRIVO_PHASE2_CI=ISOLATED_INTERNAL_NETWORK
    --env DRIVO_CI_INTEGRATION=YES_I_AM_USING_EPHEMERAL_DB
    --env "PHASE2_CI_RUN_ID=$run_id"
    --env "DATABASE_URL=mongodb://127.0.0.1:27017/${db}?replicaSet=rs0&directConnection=true"
    --env REDIS_URL=redis://127.0.0.1:6379/0
    --env REDIS_HOST=127.0.0.1 --env REDIS_PORT=6379
    --env AUTH_SIGNING_SECRET=phase2-ci-synthetic-signing-secret-000000000
    --env CSRF_HMAC_SECRET=phase2-ci-synthetic-csrf-secret-0000000000
    --env APP_ORIGIN=http://127.0.0.1:3000
    --env DRIVO_DISPATCH_OFFER_TTL_SECONDS=3600
    --env DRIVO_DISPATCH_LOCATION_MAX_AGE_SECONDS=3600
  )
  if [[ "$db" == "$payment_db" ]]; then
    args+=(--env STRIPE_SECRET_KEY=sk_test_phase2_local_synthetic_only)
    args+=(--env STRIPE_WEBHOOK_SECRET=whsec_phase2_local_synthetic_only)
  fi
  if [[ "$db" == "$phase1_db" ]]; then
    args+=(--env "PHASE1_TEST_MONGO_URL=mongodb://127.0.0.1:27017/${db}?replicaSet=rs0")
  fi
  docker run "${args[@]}" "$node_image" "$@"
}

# Verify loopback connectivity and no external route before application imports.
ci_node "$activation_db" node node_modules/tsx/dist/cli.mjs scripts/phase2-ci-isolation-check.ts
ci_node "$activation_db" node -e \
  'const n=require("node:net");const s=n.connect({host:"1.1.1.1",port:443,timeout:1200});s.on("connect",()=>process.exit(1));s.on("timeout",()=>{s.destroy();process.exit(0)});s.on("error",()=>process.exit(0))'
for db in "$activation_db" "$outbox_db" "$payment_db" "$phase1_db"; do
  ci_node "$db" node node_modules/prisma/build/index.js db push --skip-generate
done

# Commit MongoDB intent first. Stop only this run's disposable Redis instance.
ci_node "$activation_db" node node_modules/tsx/dist/cli.mjs scripts/phase2-activation-live-integration.ts prepare-outage
docker stop "$redis" >/dev/null
created_redis=0
for _ in $(seq 1 30); do
  if ! docker container inspect "$redis" >/dev/null 2>&1; then break; fi
  sleep 1
done
! docker container inspect "$redis" >/dev/null 2>&1
ci_node "$activation_db" node node_modules/tsx/dist/cli.mjs scripts/phase2-activation-live-integration.ts assert-outage
start_redis
ci_node "$activation_db" node node_modules/tsx/dist/cli.mjs scripts/phase2-activation-live-integration.ts recover-outage
ci_node "$activation_db" node node_modules/tsx/dist/cli.mjs scripts/phase2-activation-live-integration.ts suite

# Existing real relay and fake-provider payment suites use separate test DBs.
ci_node "$outbox_db" node node_modules/tsx/dist/cli.mjs scripts/outbox-live-integration.ts
ci_node "$payment_db" node node_modules/tsx/dist/cli.mjs scripts/phase2-payment-check.ts
ci_node "$phase1_db" node scripts/phase1-containment-check.cjs
echo 'PASS disposable Phase 2 CI integration runner completed; run-owned containers will be removed'
