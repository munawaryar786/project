"use strict";

// Read-only production readiness probe. Never prints Redis credentials, hosts,
// certificate contents, or the raw connection error message.
const fs = require("node:fs");
const path = require("node:path");
const Redis = require("ioredis");
const { parse } = require("dotenv");

const envDir = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();
function loadConfig() {
  const merged = {};
  // Low to high precedence for the production dotenv files. Real process
  // environment always wins, as it does in the application.
  for (const filename of [".env", ".env.production", ".env.local", ".env.production.local"]) {
    const filenamePath = path.join(envDir, filename);
    if (fs.existsSync(filenamePath)) Object.assign(merged, parse(fs.readFileSync(filenamePath)));
  }
  return { ...merged, ...process.env };
}

async function main() {
  const config = loadConfig();
  const url = config.REDIS_URL?.trim();
  const caPath = config.REDIS_CA_CERT_PATH?.trim() || null;
  console.log("===== REDIS TLS RELEASE PREFLIGHT (READ ONLY) =====");
  console.log("REDIS URL:", url ? "PRESENT" : "MISSING");
  console.log("TLS CA PATH:", caPath ? "CONFIGURED" : "NOT CONFIGURED");
  if (!url) throw new Error("REDIS_URL_MISSING");
  let hostname;
  try {
    const address = new URL(url);
    if (address.protocol !== "rediss:") throw new Error("REDIS_TLS_REQUIRED");
    hostname = address.hostname;
  } catch (error) {
    throw new Error(error.message === "REDIS_TLS_REQUIRED" ? "REDIS_TLS_REQUIRED" : "REDIS_URL_INVALID");
  }
  let ca;
  if (caPath) {
    try { ca = fs.readFileSync(caPath); }
    catch { throw new Error("REDIS_CA_FILE_UNREADABLE"); }
  }
  const client = new Redis(url, {
    tls: { servername: hostname, ...(ca ? { ca } : {}) },
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    connectTimeout: 5000,
    retryStrategy: () => null,
    enableReadyCheck: true,
    connectionName: "drivo-release-tls-preflight",
  });
  client.on("error", () => {});
  try {
    await client.connect();
    const pong = await Promise.race([
      client.ping(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("REDIS_PING_TIMEOUT")), 5000)),
    ]);
    if (pong !== "PONG") throw new Error("REDIS_PING_UNEXPECTED");
    console.log("TLS HANDSHAKE + PING: PASS");
  } catch (error) {
    const code = error?.code || error?.message;
    const safeCode = ["REDIS_PING_TIMEOUT", "REDIS_PING_UNEXPECTED", "SELF_SIGNED_CERT_IN_CHAIN",
      "UNABLE_TO_VERIFY_LEAF_SIGNATURE", "CERT_HAS_EXPIRED", "ETIMEDOUT", "ECONNREFUSED",
      "ENOTFOUND"].includes(code) ? code : "REDIS_TLS_CONNECTION_FAILED";
    throw new Error(safeCode);
  } finally {
    client.disconnect();
  }
}

main().catch(error => {
  console.error("PREFLIGHT: FAIL", error?.message || "UNKNOWN");
  process.exitCode = 1;
});
