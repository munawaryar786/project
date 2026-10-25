import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { NextRequest, NextResponse } from "next/server";
import { getAuthRateLimitConnection } from "@/lib/realtime/redis";

// This legacy map remains only for non-auth/public compatibility routes. Protected
// passenger auth flows use enforceAuthRateLimit below and never fall back to it.
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

export interface RateLimitOptions {
  max: number;
  windowMs: number;
  message?: string;
  scope?: string;
}

export type AuthRateLimitIdentity = {
  dimension: string;
  value: string;
  max: number;
  windowMs: number;
};

export type AuthRateLimitResult = {
  allowed: boolean;
  unavailable: boolean;
  retryAfter: number;
  remaining: number;
  blockedDimension?: string;
};

export const AUTH_RATE_LIMIT_NAMESPACE = "drivo:auth:rate:v1";
export const AUTH_RATE_COOLDOWN_NAMESPACE = "drivo:auth:cooldown:v1";
export const AUTH_RATE_LIMIT_SECRET_ENV = "AUTH_RATE_LIMIT_KEY_SECRET";
const AUTH_RATE_LIMIT_COMMAND_TIMEOUT_MS = 1500;
const MIN_HMAC_SECRET_LENGTH = 32;

// One deterministic script performs all counters for a request and optionally
// reserves a cooldown key. It checks before mutating, so a denied dimension does
// not consume another dimension's budget. Missing TTLs are repaired atomically.
export const AUTH_RATE_LIMIT_LUA = `
local counterCount = tonumber(ARGV[1])
local argIndex = 2
local retry = 1
for i = 1, counterCount do
  local limit = tonumber(ARGV[argIndex])
  local ttl = tonumber(ARGV[argIndex + 1])
  local current = tonumber(redis.call("GET", KEYS[i]) or "0") or 0
  local pttl = redis.call("PTTL", KEYS[i])
  if current > 0 and pttl < 0 then
    redis.call("PEXPIRE", KEYS[i], ttl * 1000)
    pttl = ttl * 1000
  end
  if current >= limit then
    return {0, i, math.max(1, math.ceil(math.max(pttl, 0) / 1000)), current}
  end
  retry = math.max(retry, math.ceil(math.max(pttl, 0) / 1000))
  argIndex = argIndex + 2
end
local cooldownTtl = tonumber(ARGV[argIndex] or "0") or 0
if cooldownTtl > 0 then
  local cooldownKey = KEYS[counterCount + 1]
  local cooldownPttl = redis.call("PTTL", cooldownKey)
  if cooldownPttl >= 0 or redis.call("EXISTS", cooldownKey) == 1 then
    if cooldownPttl < 0 then
      redis.call("PEXPIRE", cooldownKey, cooldownTtl * 1000)
      cooldownPttl = cooldownTtl * 1000
    end
    return {0, counterCount + 1, math.max(1, math.ceil(math.max(cooldownPttl, 0) / 1000)), 0}
  end
  retry = math.max(retry, cooldownTtl)
end
local remaining = {}
argIndex = 2
for i = 1, counterCount do
  local limit = tonumber(ARGV[argIndex])
  local ttl = tonumber(ARGV[argIndex + 1])
  local current = tonumber(redis.call("GET", KEYS[i]) or "0") or 0
  local nextValue
  if current <= 0 then
    nextValue = 1
    redis.call("SET", KEYS[i], "1", "EX", ttl)
  else
    nextValue = redis.call("INCR", KEYS[i])
    if redis.call("PTTL", KEYS[i]) < 0 then
      redis.call("PEXPIRE", KEYS[i], ttl * 1000)
    end
  end
  remaining[i] = math.max(0, limit - nextValue)
  argIndex = argIndex + 2
end
if cooldownTtl > 0 then
  redis.call("SET", KEYS[counterCount + 1], "1", "EX", cooldownTtl, "NX")
end
return {1, retry, unpack(remaining)}
`;

function positiveInteger(value: number, fallback: number) {
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function boundedRetryAfter(value: number, maximum: number) {
  return Math.max(1, Math.min(positiveInteger(maximum, 900), Math.ceil(Number.isFinite(value) ? value : 1)));
}

function hmacSecret() {
  const secret = process.env[AUTH_RATE_LIMIT_SECRET_ENV]?.trim();
  if (!secret || secret.length < MIN_HMAC_SECRET_LENGTH) {
    throw new Error("AUTH_RATE_LIMIT_KEY_SECRET_MISSING");
  }
  return secret;
}

export function rateLimitIdentity(scope: string, canonicalValue: string) {
  if (!/^[a-z0-9-]+$/.test(scope) || !canonicalValue) throw new Error("AUTH_RATE_LIMIT_IDENTITY_INVALID");
  return createHmac("sha256", hmacSecret())
    .update(`drivo-auth-rate:v1|${scope}|${canonicalValue}`)
    .digest("hex");
}

export function buildAuthRateLimitKey(domain: string, dimension: string, canonicalValue: string) {
  if (!/^[a-z0-9-]+$/.test(domain) || !/^[a-z0-9-]+$/.test(dimension)) throw new Error("AUTH_RATE_LIMIT_SCOPE_INVALID");
  return `${AUTH_RATE_LIMIT_NAMESPACE}:${domain}:${dimension}:${rateLimitIdentity(`${domain}-${dimension}`, canonicalValue)}`;
}

export function buildAuthCooldownKey(domain: string, canonicalValue: string) {
  if (!/^[a-z0-9-]+$/.test(domain)) throw new Error("AUTH_RATE_LIMIT_SCOPE_INVALID");
  return `${AUTH_RATE_COOLDOWN_NAMESPACE}:${domain}:${rateLimitIdentity(`${domain}-cooldown`, canonicalValue)}`;
}

function normalizeIpCandidate(value: string | undefined) {
  const candidate = String(value || "").trim().replace(/^\[|\]$/g, "");
  return isIP(candidate) ? candidate : "unknown";
}

/** Resolve an IP only from a configured trusted proxy chain or framework metadata. */
export function resolveClientIp(request: NextRequest) {
  const trustCount = Number.parseInt(process.env.DRIVO_TRUSTED_PROXY_COUNT || "0", 10);
  if (Number.isInteger(trustCount) && trustCount > 0) {
    const forwarded = request.headers.get("x-forwarded-for");
    const parts = forwarded?.split(",").map((part) => part.trim()).filter(Boolean) || [];
    if (parts.length > 0) {
      const candidateIndex = Math.max(0, parts.length - trustCount - 1);
      return normalizeIpCandidate(parts[candidateIndex]);
    }
    return normalizeIpCandidate(request.headers.get("x-real-ip") || undefined);
  }
  const frameworkIp = (request as NextRequest & { ip?: string }).ip;
  return normalizeIpCandidate(frameworkIp);
}

function redisCommand<T>(operation: () => Promise<T>) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("AUTH_RATE_LIMIT_REDIS_TIMEOUT")), AUTH_RATE_LIMIT_COMMAND_TIMEOUT_MS);
  });
  return Promise.race([operation(), timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

export async function enforceAuthRateLimit(input: {
  domain: string;
  identities: AuthRateLimitIdentity[];
  cooldown?: { value: string; windowMs: number };
}): Promise<AuthRateLimitResult> {
  try {
    if (!input.identities.length || input.identities.length > 3) throw new Error("AUTH_RATE_LIMIT_POLICY_INVALID");
    const keys = input.identities.map((identity) => buildAuthRateLimitKey(input.domain, identity.dimension, identity.value));
    if (input.cooldown) keys.push(buildAuthCooldownKey(input.domain, input.cooldown.value));
    const args: string[] = [String(input.identities.length)];
    for (const identity of input.identities) {
      args.push(String(positiveInteger(identity.max, 1)), String(Math.ceil(positiveInteger(identity.windowMs, 1) / 1000)));
    }
    args.push(input.cooldown ? String(Math.ceil(positiveInteger(input.cooldown.windowMs, 1) / 1000)) : "0");
    const redis = getAuthRateLimitConnection();
    const raw = (await redisCommand(() => redis.eval(AUTH_RATE_LIMIT_LUA, keys.length, ...keys, ...args))) as unknown[];
    const status = Number(raw?.[0]);
    const retryRaw = status === 1 ? Number(raw?.[1] ?? 1) : Number(raw?.[2] ?? 1);
    const retryAfter = boundedRetryAfter(retryRaw, Math.max(...input.identities.map((identity) => identity.windowMs / 1000), input.cooldown ? input.cooldown.windowMs / 1000 : 1));
    if (status !== 1) {
      const blockedIndex = Number(raw?.[1]);
      return { allowed: false, unavailable: false, retryAfter, remaining: 0, blockedDimension: input.identities[blockedIndex - 1]?.dimension || (input.cooldown ? "cooldown" : "policy") };
    }
    const remainingValues = input.identities.map((_, index) => Number(raw?.[index + 2] ?? 0));
    return { allowed: true, unavailable: false, retryAfter, remaining: Math.min(...remainingValues) };
  } catch (error) {
    console.error("[auth.rate_limit.backend_unavailable]", { category: error instanceof Error ? error.name : "unknown" });
    return { allowed: false, unavailable: true, retryAfter: 5, remaining: 0 };
  }
}

export function authRateLimitResponse(result: AuthRateLimitResult, message = "Too many requests. Please try again later.") {
  if (result.unavailable) {
    return NextResponse.json({ success: false, code: "AUTH_RATE_LIMIT_UNAVAILABLE", error: "Please try again later." }, { status: 503 });
  }
  const retryAfter = boundedRetryAfter(result.retryAfter, 900);
  return NextResponse.json({ success: false, code: "RATE_LIMITED", error: message, retryAfter }, { status: 429, headers: { "Retry-After": String(retryAfter) } });
}

export function withDistributedIpRateLimit(
  handler: (request: NextRequest) => Promise<NextResponse>,
  options: { domain: string; max: number; windowMs: number; message?: string },
) {
  return async function distributedRateLimitedHandler(request: NextRequest) {
    const result = await enforceAuthRateLimit({
      domain: options.domain,
      identities: [{ dimension: "ip", value: resolveClientIp(request), max: options.max, windowMs: options.windowMs }],
    });
    if (!result.allowed) return authRateLimitResponse(result, options.message);
    return handler(request);
  };
}

// Legacy compatibility limiter for non-auth/public routes. Auth routes use the
// Redis-backed facade above; this helper is intentionally not a fail-open auth path.
export function consumeRateLimit(key: string, options: RateLimitOptions) {
  const now = Date.now();
  const record = rateLimitStore.get(key);
  if (record && now > record.resetTime) rateLimitStore.delete(key);
  const current = rateLimitStore.get(key) || { count: 0, resetTime: now + options.windowMs };
  current.count += 1;
  rateLimitStore.set(key, current);
  return { allowed: current.count <= options.max, retryAfter: Math.max(1, Math.ceil((current.resetTime - now) / 1000)) };
}

export function withRateLimit(
  handler: (request: NextRequest) => Promise<NextResponse>,
  options: RateLimitOptions = { max: 100, windowMs: 15 * 60 * 1000 },
) {
  return async function legacyRateLimitedHandler(request: NextRequest): Promise<NextResponse> {
    const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown";
    const key = `${ip}:${options.scope || request.nextUrl.pathname}`;
    const current = rateLimitStore.get(key) || { count: 0, resetTime: Date.now() + options.windowMs };
    current.count += 1;
    if (current.count > options.max) {
      return NextResponse.json({ error: options.message || "Too many requests. Please try again later.", retryAfter: Math.ceil((current.resetTime - Date.now()) / 1000) }, { status: 429, headers: { "Retry-After": String(Math.ceil((current.resetTime - Date.now()) / 1000)) } });
    }
    rateLimitStore.set(key, current);
    const response = await handler(request);
    response.headers.set("X-RateLimit-Limit", String(options.max));
    response.headers.set("X-RateLimit-Remaining", String(options.max - current.count));
    response.headers.set("X-RateLimit-Reset", String(current.resetTime));
    return response;
  };
}

export const rateLimits = {
  passengerRegistrationPhoneCheck: { scope: "registration_phone_check", max: 10, windowMs: 5 * 60 * 1000, message: "Too many phone checks. Please wait and try again." },
  passengerRegistrationOtpSend: { scope: "registration_otp_send", max: 3, windowMs: 5 * 60 * 1000, message: "Too many OTP requests. Please wait before requesting another OTP." },
  passengerRegistrationOtpPhone: { scope: "registration_otp_phone", max: 3, windowMs: 5 * 60 * 1000, message: "Too many OTP requests. Please wait before requesting another OTP." },
  passengerRegistrationOtpVerify: { scope: "registration_otp_verify", max: 5, windowMs: 5 * 60 * 1000, message: "Too many verification attempts. Please request a new code." },
  passengerAccountCreate: { scope: "account_create", max: 5, windowMs: 15 * 60 * 1000, message: "Too many account creation attempts. Please wait and try again." },
  passengerLoginPassword: { scope: "login_password", max: 5, windowMs: 15 * 60 * 1000, message: "Too many login attempts. Please try again later." },
  passengerLoginStepUpOtpSend: { scope: "login_step_up_otp_send", max: 5, windowMs: 5 * 60 * 1000, message: "Too many verification attempts. Please request a new code." },
  passengerLoginStepUpOtpVerify: { scope: "login_step_up_otp_verify", max: 5, windowMs: 5 * 60 * 1000, message: "Too many verification attempts. Please request a new code." },
  passengerPasswordResetEmailSend: { scope: "password_reset_email_send", max: 5, windowMs: 15 * 60 * 1000, message: "Too many password reset attempts. Please wait and try again." },
  passengerPasswordResetOtpSend: { scope: "password_reset_otp_send", max: 5, windowMs: 15 * 60 * 1000, message: "Too many password reset attempts. Please wait and try again." },
  passengerPasswordResetOtpVerify: { scope: "password_reset_otp_verify", max: 5, windowMs: 15 * 60 * 1000, message: "Too many password reset attempts. Please wait and try again." },
  passengerPasswordResetComplete: { scope: "password_reset_complete", max: 5, windowMs: 15 * 60 * 1000, message: "Too many password reset attempts. Please wait and try again." },
  auth: { scope: "login_password", max: 5, windowMs: 15 * 60 * 1000, message: "Too many login attempts. Please try again later." },
  otp: { scope: "registration_otp_send", max: 3, windowMs: 5 * 60 * 1000, message: "Too many OTP requests. Please wait before requesting another OTP." },
  standard: { max: 100, windowMs: 15 * 60 * 1000, message: "Too many requests. Please slow down." },
  public: { max: 200, windowMs: 15 * 60 * 1000, message: "Too many requests." },
};

export function cleanupExpiredRateLimits() {
  const now = Date.now();
  for (const [key, record] of rateLimitStore.entries()) if (now > record.resetTime) rateLimitStore.delete(key);
}

if (typeof global !== "undefined") setInterval(cleanupExpiredRateLimits, 10 * 60 * 1000);
