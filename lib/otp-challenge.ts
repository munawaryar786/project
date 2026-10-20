import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

// Explicit runtime selector; existing Verify installations keep their behavior.
export function registrationOtpProvider(): "verify" | "messaging" {
  const configured = (process.env.DRIVO_REGISTRATION_OTP_PROVIDER || "verify").trim().toLowerCase();
  if (configured !== "verify" && configured !== "messaging") throw new Error("OTP_PROVIDER_INVALID");
  return configured;
}

type ChallengeScope = { bookingId: string; phone: string; purpose: string };
type ChallengeCheck = ChallengeScope & { storedCode: string; otp: string };
const PREFIX = "MSG_HMAC_V1";
const STORED_PATTERN = /^MSG_HMAC_V1:([a-f0-9]{32}):([a-f0-9]{64})$/;

function hmacKey() {
  const secret = process.env.DRIVO_OTP_HMAC_SECRET;
  if (!secret || secret.length < 32) throw new Error("DRIVO_OTP_HMAC_SECRET_MISSING");
  return secret;
}

function signature(scope: ChallengeScope, nonce: string, otp: string) {
  // Domain-separated, context-bound HMAC; guessing six digits from DB is infeasible.
  const input = ["drivo-otp-messaging-v1", scope.bookingId, scope.phone, scope.purpose, nonce, otp].join("\0");
  return createHmac("sha256", hmacKey()).update(input).digest("hex");
}

export function createMessagingOtpChallenge(scope: ChallengeScope) {
  const otp = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const nonce = randomBytes(16).toString("hex");
  return { otp, storedCode: `${PREFIX}:${nonce}:${signature(scope, nonce, otp)}` };
}

export function verifyMessagingOtpChallenge(input: ChallengeCheck) {
  const match = STORED_PATTERN.exec(input.storedCode);
  if (!match || !/^\d{6}$/.test(input.otp)) return false;
  const expected = Buffer.from(match[2], "hex");
  const actual = Buffer.from(signature(input, match[1], input.otp), "hex");
  return timingSafeEqual(expected, actual);
}
