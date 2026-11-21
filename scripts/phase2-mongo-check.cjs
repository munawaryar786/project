// Disposable loopback replica set only. Never reads .env or accepts production URLs.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { MongoClient } = require("mongodb");
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
function findBinary(root) {
  if (!fs.existsSync(root)) return null;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const file = path.join(root, entry.name);
    if (entry.isFile() && entry.name === "mongod.exe") return file;
    if (entry.isDirectory()) { const found = findBinary(file); if (found) return found; }
  }
  return null;
}
async function main() {
  const binary = findBinary(path.join(os.tmpdir(), "drivo-phase1-mongo-8.0.16"));
  assert.ok(binary, "Disposable MongoDB binary unavailable; no fallback to a real database");
  const port = await new Promise(resolve => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const value = server.address().port;
      server.close(() => resolve(value));
    });
  });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "drivo-phase2-mongo-data-"));
  const child = spawn(binary, ["--bind_ip", "127.0.0.1", "--port", String(port),
    "--dbpath", dir, "--replSet", "drivoPhase2", "--logpath", path.join(dir, "mongod.log"), "--noauth"],
  { windowsHide: true, stdio: "ignore" });
  let exited = false;
  child.once("exit", () => { exited = true; });
  let client;
  try {
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      assert.ok(!exited, "Disposable MongoDB did not start");
      client = new MongoClient(`mongodb://127.0.0.1:${port}/?directConnection=true`, { serverSelectionTimeoutMS: 500 });
      try { await client.connect(); await client.db("admin").command({ ping: 1 }); break; }
      catch { await client.close(); client = null; await delay(200); }
    }
    assert.ok(client, "Disposable MongoDB unavailable");
    await client.db("admin").command({ replSetInitiate: { _id: "drivoPhase2", members: [{ _id: 0, host: `127.0.0.1:${port}` }] } });
    while (Date.now() < deadline) {
      const hello = await client.db("admin").command({ hello: 1 });
      if (hello.isWritablePrimary) break;
      await delay(200);
    }
    assert.ok((await client.db("admin").command({ hello: 1 })).isWritablePrimary, "Replica set did not elect a primary");
    const name = "drivo_phase2_test_" + crypto.randomBytes(8).toString("hex");
    const db = client.db(name);
    for (const [collection, keys] of [
      ["Booking", { bookingRef: 1 }],
      ["booking_payment_slots", { bookingId: 1 }],
      ["payment_operations", { requestScopeKey: 1 }],
      ["payment_operations", { providerRequestKey: 1 }],
      ["payment_operations", { providerSessionKey: 1 }],
      ["payment_operations", { bookingId: 1, generation: 1 }],
      ["booking_payments", { providerSessionId: 1 }],
      ["booking_payments", { idempotencyKey: 1 }],
      ["payment_webhook_events", { providerEventId: 1 }],
      ["outbox_events", { idempotencyKey: 1 }],
    ]) await db.collection(collection).createIndex(keys, { unique: true });
    const test = spawn(process.execPath, ["node_modules/tsx/dist/cli.mjs", "scripts/phase2-payment-check.ts"], {
      cwd: process.cwd(), windowsHide: true, stdio: "inherit",
      env: {
        ...process.env, NODE_ENV: "test",
        DATABASE_URL: `mongodb://127.0.0.1:${port}/${name}?replicaSet=drivoPhase2`,
        AUTH_SIGNING_SECRET: "phase2-synthetic-signing-secret-000000000000",
        CSRF_HMAC_SECRET: "phase2-synthetic-csrf-secret-000000000000000",
        APP_ORIGIN: "http://127.0.0.1:3000",
        // Synthetic local signing only; the test never calls a Stripe API.
        STRIPE_SECRET_KEY: "sk_test_phase2_local_synthetic_only", STRIPE_WEBHOOK_SECRET: "whsec_phase2_local_synthetic_only",
      },
    });
    const result = await new Promise((resolve, reject) => {
      test.once("error", reject);
      test.once("exit", resolve);
    });
    process.exitCode = result || 0;
  } finally {
    if (client) await client.close();
    if (!exited) {
      child.kill();
      await new Promise(resolve => { if (exited) return resolve(); child.once("exit", resolve); });
    }
    const root = path.resolve(os.tmpdir()) + path.sep + "drivo-phase2-mongo-data-";
    assert.ok(path.resolve(dir).startsWith(root), "Unsafe disposable test cleanup path");
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
main().catch(error => { console.error("ISOLATED_PHASE2_MONGO_FAILED:", error.message); process.exitCode = 1; });
