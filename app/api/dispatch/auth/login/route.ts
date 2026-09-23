import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createCanonicalToken, setSessionCookies } from "@/lib/security/session";
import { isAllowedOrigin } from "@/lib/env";
import { authRateLimitResponse, enforceAuthRateLimit, resolveClientIp } from "@/lib/rate-limit";
import { recordDispatchAudit } from "@/lib/dispatch-audit";

const LoginSchema = z.object({ email: z.string().trim().toLowerCase().email().max(254), password: z.string().min(1).max(128) }).strict();

export async function POST(request: NextRequest) {
  if (!isAllowedOrigin(request.headers.get("origin"))) return NextResponse.json({ error: "Request origin is not allowed" }, { status: 403 });
  const parsed = LoginSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  const limited = await enforceAuthRateLimit({ domain: "dispatch-login", identities: [
    { dimension: "ip", value: resolveClientIp(request), max: 5, windowMs: 15 * 60 * 1000 },
    { dimension: "identifier", value: parsed.data.email, max: 5, windowMs: 15 * 60 * 1000 },
  ] });
  if (!limited.allowed) return authRateLimitResponse(limited, "Too many login attempts. Please try again later.");
  try {
    const operator = await prisma.dispatchOperator.findUnique({ where: { email: parsed.data.email } });
    const valid = Boolean(operator?.status === "ACTIVE" && await bcrypt.compare(parsed.data.password, operator.passwordHash));
    if (!operator || !valid || operator.status !== "ACTIVE") {
      if (operator) await recordDispatchAudit({ actorType: "DISPATCH_OPERATOR", actorId: operator.id, action: "DISPATCH_OPERATOR_LOGIN", targetType: "DispatchOperator", targetId: operator.id, outcome: "FAILURE", safeMetadata: { reason: "INVALID_CREDENTIALS" } }).catch(() => undefined);
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }
    await prisma.dispatchOperator.update({ where: { id: operator.id }, data: { lastLoginAt: new Date() } });
    await recordDispatchAudit({ actorType: "DISPATCH_OPERATOR", actorId: operator.id, action: "DISPATCH_OPERATOR_LOGIN", targetType: "DispatchOperator", targetId: operator.id, outcome: "SUCCESS" });
    const session = await createCanonicalToken({ sub: operator.id, actor: "DISPATCH_OPERATOR", role: "DISPATCH_OPERATOR", ver: operator.authVersion });
    const response = NextResponse.json({ success: true, mustChangePassword: operator.mustChangePassword, operator: { id: operator.id, fullName: operator.fullName, email: operator.email } });
    setSessionCookies(response, "DISPATCH_OPERATOR", session);
    return response;
  } catch {
    return NextResponse.json({ error: "Authentication failed" }, { status: 500 });
  }
}
