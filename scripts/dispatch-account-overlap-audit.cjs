"use strict";

/**
 * READ ONLY production readiness audit.
 * Admin and DispatchOperator use separate authenticators. A matching email
 * suggests an overlap, NOT proof of shared identity or authorization to link.
 * Never prints names, addresses, login credentials or account IDs.
 * No database writes, no Redis access and no changes to auth.
 */
const fs = require("node:fs");
const path = require("node:path");
const { parse } = require("dotenv");

const folder = path.resolve(process.argv[2] || process.cwd());
const env = {};
for (const filename of [".env", ".env.production", ".env.local", ".env.production.local"]) {
  const file = path.join(folder, filename);
  if (fs.existsSync(file)) Object.assign(env, parse(fs.readFileSync(file)));
}
Object.assign(env, process.env);

async function main() {
  console.log("===== DISPATCH STAFF / OPERATOR IDENTITY AUDIT (READ ONLY) =====");
  console.log("AUTHENTICATION MODELS: AdminUser + DispatchOperator are separate");
  if (!env.DATABASE_URL) throw new Error("DB_MISSING");
  process.env.DATABASE_URL = env.DATABASE_URL;
  const { PrismaClient } = require("@prisma/client");
  const db = new PrismaClient();
  try {
    const [staff, operators] = await Promise.all([
      db.adminUser.findMany({ select: { email: true, role: true } }),
      db.dispatchOperator.findMany({ select: { email: true, status: true } }),
    ]);
    const staffRoles = new Map();
    for (const row of staff) {
      const role = ["SUPER_ADMIN", "DISPATCHER"].includes(row.role) ? row.role : "OTHER";
      staffRoles.set(role, (staffRoles.get(role) || 0) + 1);
    }
    const operatorStates = new Map();
    for (const row of operators) {
      const status = ["ACTIVE", "DISABLED"].includes(row.status) ? row.status : "OTHER";
      operatorStates.set(status, (operatorStates.get(status) || 0) + 1);
    }
    const normalized = value => String(value || "").trim().toLowerCase();
    const operatorEmails = new Set(operators.map(row => normalized(row.email)));
    const matchedStaff = staff.filter(row => normalized(row.email) && operatorEmails.has(normalized(row.email)));
    const missingDispatchAccess = staff.filter(row =>
      row.role === "DISPATCHER" && !operatorEmails.has(normalized(row.email))
    );

    console.log("ADMIN STAFF ACCOUNTS:", staff.length);
    for (const [role, count] of [...staffRoles].sort()) console.log("ADMIN ROLE", role, count);
    console.log("DEDICATED DISPATCH OPERATOR ACCOUNTS:", operators.length);
    for (const [state, count] of [...operatorStates].sort()) console.log("DISPATCH OPERATOR", state, count);
    console.log("STAFF EMAIL OVERLAP WITH OPERATOR MODEL:", matchedStaff.length);
    console.log("ADMIN DISPATCHER ROLE WITHOUT MATCHING OPERATOR EMAIL:", missingDispatchAccess.length);
    console.log("IMPORTANT: Matching email alone cannot establish verified identity or permission to link accounts");
    console.log("AUDIT: COMPLETE; NO ACCOUNT CHANGES, AUTH ACTIONS OR DATABASE WRITES");
  } finally {
    await db.$disconnect();
  }
}
main().catch(error => {
  console.error("AUDIT: FAILED", error?.message === "DB_MISSING" ? "DATABASE_URL_MISSING" : "DB_READ_UNAVAILABLE");
  process.exitCode = 1;
});
