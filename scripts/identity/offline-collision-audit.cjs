"use strict";

// DO NOT EXECUTE AGAINST REAL CUSTOMER DATA WITHOUT SEPARATE PROJECT OWNER APPROVAL.
// Synthetic-fixture classifier only. No database, network, environment, or application imports.
// This file is deliberately not referenced by package.json or any automatic workflow.

const fs = require("node:fs");

const MAX_BYTES = 2 * 1024 * 1024;
const MAX_ACCOUNTS = 10000;
const E164 = /^\+[1-9][0-9]{7,14}$/;
const EMAIL = /^[^\s@]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
const ACCOUNT_KEYS = new Set([
  "fixtureTag", "rawPhone", "normalizedPhone", "canonicalPhone", "phoneVerified",
  "accountEmail", "emailEvidence", "bookingCount", "hasActiveSession",
  "hasOutstandingResetProof", "status", "bookingContactEmails",
]);

function reject() {
  throw new Error("FIXTURE_REJECTED");
}

function bucket(count) {
  if (count === 0) return "0";
  if (count < 10) return "SUPPRESSED_1_TO_9";
  if (count < 50) return "10-49";
  if (count < 100) return "50-99";
  return "100_PLUS";
}

function explicitPhoneCandidate(value) {
  if (typeof value !== "string" || value.length > 40) return null;
  const raw = value.trim();
  if (!/^[+0-9\s().-]+$/.test(raw)) return null;
  const compact = raw.replace(/[\s().-]/g, "");
  if (!/^\+?[0-9]+$/.test(compact)) return null;
  const candidate = compact.startsWith("+") ? compact : compact.startsWith("00") ? `+${compact.slice(2)}` : "";
  return E164.test(candidate) ? candidate : null;
}

function emailCandidate(value) {
  if (typeof value !== "string" || value.length > 160) return null;
  const trimmed = value.trim();
  if (!EMAIL.test(trimmed)) return null;
  return trimmed.toLowerCase(); // Current-app comparison candidate, not final approved email policy.
}

function looksNational(value) {
  if (typeof value !== "string" || value.length > 40) return false;
  const raw = value.trim();
  if (!/^[0-9\s().-]+$/.test(raw)) return false;
  const digits = raw.replace(/[\s().-]/g, "");
  return /^[0-9]{6,15}$/.test(digits) && !digits.startsWith("00");
}

function requireOptionalString(value, max) {
  if (value === undefined || value === null) return;
  if (typeof value !== "string" || value.length > max) reject();
}

function validateFixture(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload) ||
      Object.keys(payload).some((key) => !["schema", "synthetic", "accounts"].includes(key)) ||
      payload.schema !== "drivo-identity-synthetic-v1" || payload.synthetic !== true ||
      !Array.isArray(payload.accounts) || payload.accounts.length > MAX_ACCOUNTS) reject();
  for (const row of payload.accounts) {
    if (!row || typeof row !== "object" || Array.isArray(row) ||
        Object.keys(row).some((key) => !ACCOUNT_KEYS.has(key)) ||
        row.fixtureTag !== "SYNTHETIC_ONLY" ||
        typeof row.phoneVerified !== "boolean" ||
        !["UNKNOWN", "UNVERIFIED", "VERIFIED"].includes(row.emailEvidence) ||
        !["ACTIVE", "INACTIVE"].includes(row.status) ||
        !Number.isSafeInteger(row.bookingCount) || row.bookingCount < 0 || row.bookingCount > 100000 ||
        typeof row.hasActiveSession !== "boolean" || typeof row.hasOutstandingResetProof !== "boolean") reject();
    requireOptionalString(row.rawPhone, 40);
    requireOptionalString(row.normalizedPhone, 40);
    requireOptionalString(row.canonicalPhone, 20);
    requireOptionalString(row.accountEmail, 160);
    if (row.canonicalPhone && !E164.test(row.canonicalPhone)) reject();
    if (!Array.isArray(row.bookingContactEmails) || row.bookingContactEmails.length > 20 ||
        row.bookingContactEmails.some((value) => typeof value !== "string" || value.length > 160)) reject();
  }
}

function addGroup(groups, key, index, rawValue) {
  let group = groups.get(key);
  if (!group) {
    group = { members: [], variants: new Set() };
    groups.set(key, group);
  }
  group.members.push(index);
  if (rawValue) group.variants.add(rawValue);
}

function classify(payload) {
  validateFixture(payload);
  const phoneGroups = new Map();
  const emailGroups = new Map();
  const contactGroups = new Map();
  const manualReview = new Set();
  let missingNormalizedPhone = 0;
  let storedCanonicalDisagreement = 0;
  let invalidOrAmbiguousPhone = 0;
  let nationalRequiresCountryReview = 0;
  let unknownEmailEvidence = 0;
  let missingAccountEmail = 0;
  let invalidAccountEmail = 0;
  let verifiedEmailCollisionAccounts = 0;
  const conflictingEvidence = new Set();

  payload.accounts.forEach((row, index) => {
    const explicit = explicitPhoneCandidate(row.rawPhone);
    const canonical = row.canonicalPhone || explicit;
    if (row.canonicalPhone && explicit && row.canonicalPhone !== explicit) reject();
    if (!row.normalizedPhone) missingNormalizedPhone++;
    if (!canonical) {
      invalidOrAmbiguousPhone++;
      manualReview.add(index);
      if (row.phoneVerified) conflictingEvidence.add(index);
    } else {
      addGroup(phoneGroups, canonical, index, row.rawPhone);
      if (!explicit) {
        if (looksNational(row.rawPhone)) nationalRequiresCountryReview++;
        else invalidOrAmbiguousPhone++;
        manualReview.add(index);
      }
      if (row.normalizedPhone && row.normalizedPhone !== canonical) {
        storedCanonicalDisagreement++;
        manualReview.add(index);
      }
    }

    const email = emailCandidate(row.accountEmail);
    if (!row.accountEmail) missingAccountEmail++;
    if (row.accountEmail && !email) {
      invalidAccountEmail++;
      manualReview.add(index);
    }
    if (row.emailEvidence === "VERIFIED" && !email) {
      conflictingEvidence.add(index);
      manualReview.add(index);
    }
    if (row.emailEvidence !== "VERIFIED") unknownEmailEvidence++;
    if (email) addGroup(emailGroups, email, index, row.accountEmail);
    for (const key of new Set(row.bookingContactEmails.map(emailCandidate).filter(Boolean))) {
      if (key) addGroup(contactGroups, key, index, null);
    }
  });

  let phoneCollisionAccounts = 0;
  let verifiedPhoneCollisionAccounts = 0;
  let rawFormatCollisionAccounts = 0;
  let phoneCollisionGroups = 0;
  for (const group of phoneGroups.values()) {
    if (group.members.length < 2) continue;
    phoneCollisionGroups++;
    phoneCollisionAccounts += group.members.length;
    if (group.variants.size > 1) rawFormatCollisionAccounts += group.members.length;
    const verified = group.members.filter((index) => payload.accounts[index].phoneVerified);
    if (verified.length > 1) verifiedPhoneCollisionAccounts += verified.length;
    for (const index of group.members) manualReview.add(index);
  }

  let emailCollisionAccounts = 0;
  let emailCollisionGroups = 0;
  for (const group of emailGroups.values()) {
    if (group.members.length < 2) continue;
    emailCollisionGroups++;
    emailCollisionAccounts += group.members.length;
    const verified = group.members.filter((index) => payload.accounts[index].emailEvidence === "VERIFIED");
    if (verified.length > 1) verifiedEmailCollisionAccounts += verified.length;
    for (const index of group.members) manualReview.add(index);
  }

  let sharedBookingContactAccounts = 0;
  for (const group of contactGroups.values()) {
    if (group.members.length > 1) sharedBookingContactAccounts += group.members.length;
  }
  const reviewRows = [...manualReview].map((index) => payload.accounts[index]);
  return {
    reportSchema: "drivo-identity-synthetic-aggregate-v1",
    syntheticOnly: true,
    authoritativeCountryValidation: false,
    totalAccounts: bucket(payload.accounts.length),
    phoneCollisionGroups: bucket(phoneCollisionGroups),
    phoneCollisionAccounts: bucket(phoneCollisionAccounts),
    verifiedPhoneCollisionAccounts: bucket(verifiedPhoneCollisionAccounts),
    rawFormatCollisionAccounts: bucket(rawFormatCollisionAccounts),
    missingNormalizedPhone: bucket(missingNormalizedPhone),
    storedCanonicalDisagreement: bucket(storedCanonicalDisagreement),
    invalidOrAmbiguousPhone: bucket(invalidOrAmbiguousPhone),
    nationalRequiresCountryReview: bucket(nationalRequiresCountryReview),
    emailCollisionGroups: bucket(emailCollisionGroups),
    emailCollisionAccounts: bucket(emailCollisionAccounts),
    verifiedEmailCollisionAccounts: bucket(verifiedEmailCollisionAccounts),
    unknownOrUnverifiedEmailEvidence: bucket(unknownEmailEvidence),
    missingAccountEmail: bucket(missingAccountEmail),
    invalidAccountEmail: bucket(invalidAccountEmail),
    conflictingVerificationEvidence: bucket(conflictingEvidence.size),
    sharedBookingContactAccounts: bucket(sharedBookingContactAccounts),
    humanReviewRequiredAccounts: bucket(manualReview.size),
    reviewActiveAccounts: bucket(reviewRows.filter((row) => row.status === "ACTIVE").length),
    reviewAccountsWithBookings: bucket(reviewRows.filter((row) => row.bookingCount > 0).length),
    reviewAccountsWithActiveSessions: bucket(reviewRows.filter((row) => row.hasActiveSession).length),
    reviewAccountsWithOutstandingResetProofs: bucket(reviewRows.filter((row) => row.hasOutstandingResetProof).length),
  };
}

function main(args) {
  if (args.length !== 3 || args[0] !== "--synthetic-fixture" || args[2] !== "--ack-synthetic") reject();
  const file = args[1];
  if (!file || !file.toLowerCase().endsWith(".json")) reject();
  const metadata = fs.lstatSync(file);
  if (metadata.isSymbolicLink() || !metadata.isFile() || metadata.size > MAX_BYTES) reject();
  const payload = JSON.parse(fs.readFileSync(file, "utf8"));
  process.stdout.write(`${JSON.stringify(classify(payload), null, 2)}\n`);
}

if (require.main === module) {
  try {
    main(process.argv.slice(2));
  } catch {
    // Never print paths, file contents, identity values, or parser exceptions.
    process.stderr.write("Synthetic identity fixture rejected; no report produced.\n");
    process.exitCode = 1;
  }
}

module.exports = { classify };
