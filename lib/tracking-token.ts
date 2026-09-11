import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { getServerEnvironment } from "@/lib/env";

const TOKEN_TTL_SECONDS = 24 * 60 * 60;

function signature(payload: string) {
  return createHmac("sha256", getServerEnvironment().csrfHmacSecret)
    .update(`drivo-tracking:${payload}`)
    .digest("base64url");
}

export function createTrackingToken(bookingId: string, now = Date.now()) {
  const expiresAt = Math.floor(now / 1000) + TOKEN_TTL_SECONDS;
  const payload = `${bookingId}.${expiresAt}.${randomBytes(12).toString("base64url")}`;
  return `${payload}.${signature(payload)}`;
}

export function verifyTrackingToken(token: string, bookingId: string, now = Date.now()) {
  const parts = token.split(".");
  if (parts.length !== 4) return false;
  const [tokenBookingId, expiresRaw, nonce, supplied] = parts;
  if (tokenBookingId !== bookingId || !nonce || Number(expiresRaw) <= Math.floor(now / 1000)) return false;
  const expected = signature(`${tokenBookingId}.${expiresRaw}.${nonce}`);
  const left = Buffer.from(supplied);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}
