import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAllowedOrigin } from "@/lib/env";
import {
  csrfCookieName, hashCsrfToken, sessionCookieName, verifyCanonicalToken,
  type Actor, type CanonicalSession,
} from "@/lib/security/session";

type Authorized<T> = { ok: true; actor: T; session: CanonicalSession };
type Rejected = { ok: false; response: NextResponse };
export type AuthorizationResult<T> = Authorized<T> | Rejected;
const unsafeMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function reject(status: number, error: string): Rejected {
  return { ok: false, response: NextResponse.json({ error }, { status }) };
}

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function validateMutationSecurity(request: NextRequest, actor: Actor, session: CanonicalSession) {
  if (!unsafeMethods.has(request.method.toUpperCase())) return null;
  if (!isAllowedOrigin(request.headers.get("origin"))) return reject(403, "Request origin is not allowed");
  const cookie = request.cookies.get(csrfCookieName(actor))?.value;
  const header = request.headers.get("x-drivo-csrf");
  if (!cookie || !header || !safeEqual(cookie, header) || !safeEqual(hashCsrfToken(cookie), session.csrf)) {
    return reject(403, "Invalid CSRF token");
  }
  return null;
}

async function canonicalRequest(request: NextRequest, actor: Actor) {
  const token = request.cookies.get(sessionCookieName(actor))?.value;
  return token ? verifyCanonicalToken(token, actor) : null;
}

export async function authorizeDriver(request: NextRequest): Promise<AuthorizationResult<any>> {
  const session = await canonicalRequest(request, "DRIVER");
  if (!session) return reject(401, "Authentication required");
  const driver = await prisma.driver.findUnique({ where: { id: session.sub } });
  if (!driver || driver.status !== "ACTIVE" || (driver.authVersion ?? 0) !== session.ver) {
    return reject(401, "Authentication required");
  }
  return validateMutationSecurity(request, "DRIVER", session) || { ok: true, actor: driver, session };
}

export async function authorizeAdmin(request: NextRequest): Promise<AuthorizationResult<any>> {
  const session = await canonicalRequest(request, "ADMIN");
  if (!session) return reject(401, "Authentication required");
  const admin = await prisma.adminUser.findUnique({ where: { id: session.sub } });
  if (!admin || !admin.role || (admin.authVersion ?? 0) !== session.ver) {
    return reject(401, "Authentication required");
  }
  return validateMutationSecurity(request, "ADMIN", session) || { ok: true, actor: admin, session };
}

export async function requireAdminRole(request: NextRequest, roles: string[]) {
  const auth = await authorizeAdmin(request);
  if (!auth.ok) return auth;
  return roles.includes(auth.actor.role) ? auth : reject(403, "Insufficient permissions");
}
