// Isolated OTP regression; no real Twilio requests, Redis, or database.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const { NextResponse } = require("next/server");

Object.assign(process.env, {
  NODE_ENV: "production",
  DRIVO_REGISTRATION_OTP_PROVIDER: "messaging",
  DRIVO_OTP_HMAC_SECRET: "isolated-only-test-hmac-key-0000000000000000",
  TWILIO_ACCOUNT_SID: "AC" + "1".repeat(32),
  TWILIO_AUTH_TOKEN: "isolated-token",
  TWILIO_WHATSAPP_FROM: "whatsapp:+14155238886",
});
const phone = "+421900000001", bookingId = "333333333333333333333333";
const scope = { bookingId, phone, purpose: "PASSENGER_REGISTRATION" };

function load(relative, injections = {}) {
  const file = path.resolve(relative);
  const m = new Module(file, module);
  m.filename = file;
  m.paths = Module._nodeModulePaths(path.dirname(file));
  m.require = name => Object.hasOwn(injections, name) ? injections[name] : require(name);
  m._compile(ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText, file);
  return m.exports;
}
const challenge = load("lib/otp-challenge.ts");
const generated = challenge.createMessagingOtpChallenge(scope);
assert.match(generated.otp, /^\d{6}$/);
assert.match(generated.storedCode, /^MSG_HMAC_V1:[a-f\d]{32}:[a-f\d]{64}$/);
assert.ok(!generated.storedCode.includes(generated.otp));
assert.equal(challenge.verifyMessagingOtpChallenge({ ...scope, ...generated }), true);
assert.equal(challenge.verifyMessagingOtpChallenge({ ...scope, ...generated, otp: "not-a-code" }), false);
assert.equal(challenge.verifyMessagingOtpChallenge({ ...scope, ...generated, otp: generated.otp === "999999" ? "000000" : "999999" }), false);
assert.equal(challenge.verifyMessagingOtpChallenge({ ...scope, ...generated, phone: "+421900000002" }), false);
assert.equal(challenge.verifyMessagingOtpChallenge({ ...scope, ...generated, bookingId: "444444444444444444444444" }), false);
assert.equal(challenge.verifyMessagingOtpChallenge({ ...scope, ...generated, purpose: "PASSENGER_LEGACY_PASSWORD_SETUP" }), false);
assert.notEqual(challenge.createMessagingOtpChallenge(scope).storedCode, generated.storedCode);
const originalSecret = process.env.DRIVO_OTP_HMAC_SECRET;
delete process.env.DRIVO_OTP_HMAC_SECRET;
assert.throws(() => challenge.createMessagingOtpChallenge(scope), /DRIVO_OTP_HMAC_SECRET_MISSING/);
process.env.DRIVO_OTP_HMAC_SECRET = originalSecret;
assert.equal(challenge.registrationOtpProvider(), "messaging");
process.env.DRIVO_REGISTRATION_OTP_PROVIDER = "unrecognized";
assert.throws(() => challenge.registrationOtpProvider(), /OTP_PROVIDER_INVALID/);
process.env.DRIVO_REGISTRATION_OTP_PROVIDER = "messaging";

let twilioCalls = [], rejectSend = false;
const fakeTwilio = () => ({
  messages: { create: async request => {
    twilioCalls.push(request);
    if (rejectSend) throw { status: 403, code: 21608 };
    return { sid: "SM" + "2".repeat(32), status: "queued" };
  } },
});
const twilio = load("lib/twilio.ts", {
  twilio: { __esModule: true, default: fakeTwilio },
  "./utils": { maskPhone: () => "***0001" },
  "./i18n/locale-resolution": { isUiLocale: () => false },
});
let records = [], sentCode = "", twilioSends = 0, limitAllowed = true, available = true;
const booking = { id: bookingId, normalizedPhone: phone, passengerId: null,
  customerPhoneCode: "+421", customerPhone: "900000001", customerEmail: "test@example.invalid" };
const prisma = {
  booking: {
    findUnique: async () => booking,
    update: async ({ data }) => { Object.assign(booking, data); return booking; },
  },
  passenger: { findFirst: async () => null },
  oTP: {
    findFirst: async ({ where }) => records.slice().reverse().find(r =>
      r.bookingId === where.bookingId && r.phone === where.phone &&
      r.purpose === where.purpose && !r.used &&
      (!where.expiresAt || r.expiresAt > where.expiresAt.gt) &&
      (!where.attempts || r.attempts < where.attempts.lt)) || null,
    updateMany: async ({ where, data }) => {
      const affected = records.filter(r => (!where.id || r.id === where.id) &&
        (!where.bookingId || r.bookingId === where.bookingId) &&
        (!where.phone || r.phone === where.phone) &&
        (!where.purpose || r.purpose === where.purpose) &&
        (where.used === undefined || r.used === where.used) &&
        (!where.expiresAt || r.expiresAt > where.expiresAt.gt) &&
        (!where.attempts || r.attempts < where.attempts.lt));
      for (const r of affected) {
        if (data.used !== undefined) r.used = data.used;
        if (data.attempts?.increment) r.attempts += data.attempts.increment;
      }
      return { count: affected.length };
    },
    create: async ({ data }) => {
      const record = { id: "record" + (records.length + 1), used: false, attempts: 0, createdAt: new Date(), ...data };
      records.push(record);
      return record;
    },
  },
  $transaction: async run => run(prisma),
};
const rateLimits = new Proxy({}, { get: () => ({ max: 5, windowMs: 60_000 }) });
const mocks = {
  "@/lib/prisma": { prisma },
  "@/lib/twilio": {
    sendWhatsAppMessagingOtp: async (_phone, code) => {
      twilioSends++; sentCode = code;
      return available ? { success: true, status: "queued" } : { success: false, error: "WhatsApp unavailable." };
    },
    sendWhatsAppVerification: async () => { throw new Error("Verify should not be called in messaging mode"); },
    checkWhatsAppVerification: async () => { throw new Error("Verify should not check a Messaging HMAC"); },
  },
  "@/lib/otp-challenge": challenge,
  "@/lib/passenger-auth": {
    isValidE164Phone: value => /^\+[1-9]\d{7,14}$/.test(value),
    normalizePassengerPhone: value => value,
    getPassengerFromRequest: async () => null,
    createVerificationProof: async () => ({ proofToken: "test-proof", expiresAt: new Date(Date.now() + 5 * 60_000) }),
  },
  "@/lib/rate-limit": {
    enforceAuthRateLimit: async () => ({ allowed: limitAllowed }),
    authRateLimitResponse: () => NextResponse.json({ error: "rate limited" }, { status: 429 }),
    resolveClientIp: () => "127.0.0.1", rateLimits,
  },
  "@/lib/booking-access": { validBookingId: () => true, publicBookingAccess: async () => ({ allowed: true }) },
  "@/lib/env": { isAllowedOrigin: () => true },
  "@/lib/i18n/locale-resolution": { isUiLocale: () => true },
};
const sendRoute = load("app/api/otp/send/route.ts", mocks);
const verifyRoute = load("app/api/otp/verify/route.ts", mocks);
const request = body => ({
  headers: { get: () => "https://phase1.example" },
  json: async () => body,
});
async function main() {
  let sent = await sendRoute.POST(request({ bookingId, phone, locale: "sk" }));
  assert.equal(sent.status, 200);
  assert.equal(twilioSends, 1);
  assert.equal(records.length, 1);
  assert.match(records[0].code, /^MSG_HMAC_V1:/);
  assert.notEqual(records[0].code, sentCode);
  assert.equal((await verifyRoute.POST(request({ bookingId, code: "abc123" }))).status, 400);
  const wrong = sentCode === "999999" ? "000000" : "999999";
  assert.equal((await verifyRoute.POST(request({ bookingId, code: wrong }))).status, 400);
  assert.equal(records[0].attempts, 1);
  const verified = await verifyRoute.POST(request({ bookingId, code: sentCode }));
  assert.equal(verified.status, 200);
  assert.equal((await verified.json()).registrationProofToken, "test-proof");
  assert.equal(records[0].used, true);
  assert.equal((await verifyRoute.POST(request({ bookingId, code: sentCode }))).status, 400);
  available = false;
  assert.equal((await sendRoute.POST(request({ bookingId, phone }))).status, 503);
  assert.equal(records.length, 1, "failed Twilio requests must not create a usable OTP");
  available = true;
  limitAllowed = false;
  assert.equal((await sendRoute.POST(request({ bookingId, phone }))).status, 429);
  assert.equal(twilioSends, 2, "Redis rate limit must stop provider calls");
  limitAllowed = true;

  const transport = await twilio.sendWhatsAppMessagingOtp(phone, "123456");
  assert.equal(transport.success, true);
  assert.equal(twilioCalls.length, 1);
  assert.equal(twilioCalls[0].to, "whatsapp:" + phone);
  assert.equal(twilioCalls[0].from, "whatsapp:+14155238886");
  assert.ok(twilioCalls[0].body.includes("123456"));
  process.env.TWILIO_WHATSAPP_TEMPLATE_SID = "HX" + "a".repeat(32);
  assert.equal((await twilio.sendWhatsAppMessagingOtp(phone, "123456")).success, true);
  assert.equal(twilioCalls[1].contentSid, process.env.TWILIO_WHATSAPP_TEMPLATE_SID);
  assert.deepEqual(JSON.parse(twilioCalls[1].contentVariables), { "1": "123456" });
  assert.equal(twilioCalls[1].body, undefined);
  rejectSend = true;
  assert.equal((await twilio.sendWhatsAppMessagingOtp(phone, "123456")).success, false);
  rejectSend = false;
  delete process.env.TWILIO_WHATSAPP_FROM;
  assert.equal((await twilio.sendWhatsAppMessagingOtp(phone, "123456")).success, false);
  console.log("Messaging OTP checks passed: scoped HMAC, no plaintext storage, wrong-code/replay handling, rate limiting, WhatsApp sender/template and provider rejection.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
