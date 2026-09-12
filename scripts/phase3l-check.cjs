const fs = require("node:fs");
const cp = require("node:child_process");

const read = (file) => fs.readFileSync(file, "utf8");
const files = {
  limiter: read("lib/rate-limit.ts"),
  redis: read("lib/realtime/redis.ts"),
  send: read("app/api/otp/send/route.ts"),
  verify: read("app/api/otp/verify/route.ts"),
  login: read("app/api/passenger/login/password/route.ts"),
  reset: read("app/api/passenger/password-reset/email/route.ts"),
  schema: read("prisma/schema.prisma"),
  env: read(".env.example"),
  package: read("package.json"),
  twilio: read("lib/twilio.ts"),
  email: read("lib/email.ts"),
};
let count = 0;
function check(name, condition) {
  count += 1;
  if (!condition) {
    console.error(`FAIL ${name}`);
    process.exitCode = 1;
  } else console.log(`PASS ${name}`);
}

check("canonical existing Redis client reused", files.redis.includes("getAuthRateLimitConnection") && files.limiter.includes("getAuthRateLimitConnection"));
check("no per-request Redis constructor", !files.limiter.includes("new Redis(") && !files.limiter.includes("createRedisConnection("));
check("HMAC identity helper", files.limiter.includes("createHmac") && files.limiter.includes("rateLimitIdentity"));
check("dedicated rate-limit key secret", files.limiter.includes("AUTH_RATE_LIMIT_KEY_SECRET") && files.env.includes("AUTH_RATE_LIMIT_KEY_SECRET"));
check("no JWT/Twilio/SMTP secret reuse", !files.limiter.includes("JWT_SECRET") && !files.limiter.includes("TWILIO_AUTH_TOKEN") && !files.limiter.includes("SMTP_PASS") && !files.limiter.includes("STRIPE_SECRET_KEY"));
check("OTP send distributed limit", files.send.includes("domain: \"otp-send\"") && files.send.includes("enforceAuthRateLimit"));
check("OTP send IP scope", files.send.includes('dimension: "ip"'));
check("OTP send phone scope", files.send.includes('dimension: "phone"') && files.send.includes("normalizedPhone"));
check("OTP resend cooldown", files.send.includes("cooldown:") && files.limiter.includes("AUTH_RATE_COOLDOWN_NAMESPACE"));
check("OTP verify distributed limit", files.verify.includes("domain: \"otp-verify\"") && files.verify.includes("enforceAuthRateLimit"));
check("password login distributed limit", files.login.includes("domain: \"password-login\"") && files.login.includes('dimension: "identifier"'));
check("password reset distributed limit", files.reset.includes("domain: \"password-reset\"") && files.reset.includes('dimension: "email"'));
check("normalized phone identity", files.send.includes("normalizePassengerPhone") && files.verify.includes("normalizePassengerPhone"));
check("normalized email identity", files.login.includes("normalizePassengerEmail") && files.reset.includes("normalizePassengerEmail"));
check("no plaintext phone Redis keys", files.limiter.includes("rateLimitIdentity") && !files.limiter.includes(":${normalizedPhone}"));
check("no plaintext email Redis keys", files.limiter.includes("rateLimitIdentity") && !files.limiter.includes(":${normalizedEmail}"));
check("no OTP/password/reset-token Redis values", !files.limiter.includes("otpCode") && !files.limiter.includes("passwordResetProofToken") && !files.limiter.includes("passwordHash"));
check("bounded TTL", files.limiter.includes("PEXPIRE") && files.limiter.includes('redis.call("SET", KEYS[i]'));
check("atomic Lua increment/expire", files.limiter.includes("AUTH_RATE_LIMIT_LUA") && files.limiter.includes("INCR") && files.limiter.includes("PEXPIRE"));
check("atomic cooldown NX", files.limiter.includes("\"NX\""));
check("concurrent counter integrity primitive", files.limiter.includes("redis.call(\"INCR\""));
check("multi-instance shared counter", files.redis.includes("__drivoAuthRateLimitRedis") && files.limiter.includes("AUTH_RATE_LIMIT_NAMESPACE"));
check("multi-instance shared cooldown", files.limiter.includes("AUTH_RATE_COOLDOWN_NAMESPACE") && files.limiter.includes("cooldownTtl"));
check("denied OTP send blocks Twilio", files.send.indexOf("const distributedLimit") < files.send.indexOf("const provider"));
check("denied OTP verify blocks Twilio", files.verify.indexOf("const distributedLimit") < files.verify.indexOf("const provider"));
check("denied reset blocks email", files.reset.indexOf("const distributedLimit") < files.reset.indexOf("const passenger"));
check("Redis unavailable fails closed", files.limiter.includes("unavailable: true") && files.limiter.includes("allowed: false"));
check("Redis timeout fails closed", files.limiter.includes("AUTH_RATE_LIMIT_REDIS_TIMEOUT") && files.limiter.includes("Promise.race"));
check("Lua error fails closed", files.limiter.includes("catch (error)") && files.limiter.includes("unavailable: true"));
check("429 response", files.limiter.includes("status: 429") && files.limiter.includes("RATE_LIMITED"));
check("Retry-After response", files.limiter.includes("Retry-After") && files.limiter.includes("boundedRetryAfter"));
check("enumeration-safe login", files.login.includes("genericError") && files.limiter.includes("authRateLimitResponse"));
check("enumeration-safe reset", files.reset.includes("const generic") && files.limiter.includes("AUTH_RATE_LIMIT_UNAVAILABLE"));
check("Twilio Verify WhatsApp unchanged", files.twilio.includes("channel: \"whatsapp\"") && files.send.includes("method: \"whatsapp\""));
check("no SMS fallback", !files.send.includes("sendSMSOTP") && files.twilio.includes("sendWhatsAppVerification"));
check("returning password login unchanged", files.login.includes("bcrypt.compare") && files.login.includes("stepUpRequired: false"));
check("email-only Forgot Password", files.reset.includes("password-reset/email") || files.reset.includes("sendPassengerPasswordResetEmail"));
check("no Prisma schema change", cp.execFileSync("git", ["diff", "--", "prisma/schema.prisma"], { encoding: "utf8" }).trim() === "");
check("Redis namespace isolated", files.limiter.includes("drivo:auth:rate:v1") && !files.limiter.includes("bull:") && !files.limiter.includes("socket.io"));
check("secrets not client-side", !files.limiter.includes("NEXT_PUBLIC_") && !files.env.includes("NEXT_PUBLIC_AUTH_RATE"));
check("no raw Redis credential logging", files.limiter.includes("category") && !files.limiter.includes("REDIS_URL"));
check("Node runtime compatible", files.send.includes('runtime = "nodejs"') && files.verify.includes('runtime = "nodejs"') && files.login.includes('runtime = "nodejs"') && files.reset.includes('runtime = "nodejs"'));
check("Phase 3J thresholds preserved", files.send.includes("passengerRegistrationOtpSend.max") && files.send.includes("passengerRegistrationOtpPhone.max") && files.verify.includes("passengerRegistrationOtpVerify.max") && files.login.includes("passengerLoginPassword.max") && files.reset.includes("passengerPasswordResetEmailSend.max"));
check("singleton survives hot reload", files.redis.includes("globalForDrivoRedis") && files.redis.includes("status !== \"end\""));
check("domain-separated HMAC", files.limiter.includes("drivo-auth-rate:v1|") && files.limiter.includes("${domain}-${dimension}"));
check("legacy auth routes no process-local wrapper", !read("app/api/passenger/login/otp/verify/route.ts").includes("withRateLimit") && !read("app/api/passenger/password-reset/complete/route.ts").includes("withRateLimit"));

if (process.exitCode) process.exit(1);
console.log(`PHASE3L_CHECK_COUNT=${count}`);
console.log("Phase 3L static/source checks passed; real Redis multi-instance integration is staging-only.");
