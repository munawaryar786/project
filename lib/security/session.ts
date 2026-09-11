import { createHash, randomBytes, randomUUID } from "crypto";
import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import type { NextResponse } from "next/server";
import { getServerEnvironment } from "@/lib/env";

export const ACTORS = ["PASSENGER", "DRIVER", "ADMIN"] as const;
export type Actor = (typeof ACTORS)[number];

export const SESSION_TTL_SECONDS: Record<Actor, number> = {
  PASSENGER: 7 * 24 * 60 * 60,
  DRIVER: 12 * 60 * 60,
  ADMIN: 8 * 60 * 60,
};

export type CanonicalSession = JWTPayload & {
  sub: string;
  actor: Actor;
  role: string;
  ver: number;
  jti: string;
  csrf: string;
  sid?: string;
};

export function sessionCookieName(actor: Actor) {
  const name = `drivo-${actor.toLowerCase()}-session`;
  return process.env.NODE_ENV === "production" ? `__Host-${name}` : name;
}

export function csrfCookieName(actor: Actor) {
  const name = `drivo-${actor.toLowerCase()}-csrf`;
  return process.env.NODE_ENV === "production" ? `__Host-${name}` : name;
}

export const LEGACY_COOKIES: Record<Actor, string[]> = {
  PASSENGER: ["drivo_passenger_token", "drivo_passenger_session"],
  DRIVER: ["drivo_driver_token"],
  ADMIN: ["drivo_admin_token"],
};

export function hashCsrfToken(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function signingKey() {
  return new TextEncoder().encode(getServerEnvironment().authSigningSecret);
}

export async function createCanonicalToken(input: {
  sub: string; actor: Actor; role: string; ver: number; sid?: string;
  jti?: string; csrfToken?: string;
}) {
  const jti = input.jti || randomUUID();
  const csrfToken = input.csrfToken || randomBytes(32).toString("base64url");
  const expiresIn = SESSION_TTL_SECONDS[input.actor];
  const token = await new SignJWT({
    actor: input.actor, role: input.role, ver: input.ver,
    csrf: hashCsrfToken(csrfToken), ...(input.sid ? { sid: input.sid } : {}),
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(input.sub).setJti(jti).setIssuer("drivo").setAudience("drivo-web")
    .setIssuedAt().setExpirationTime(`${expiresIn}s`).sign(signingKey());
  return { token, csrfToken, jti, expiresIn };
}

export async function verifyCanonicalToken(token: string, expectedActor?: Actor) {
  try {
    const { payload } = await jwtVerify(token, signingKey(), {
      algorithms: ["HS256"], issuer: "drivo", audience: "drivo-web",
      requiredClaims: ["sub", "jti", "iat", "exp", "actor", "role", "ver", "csrf"],
    });
    if (!payload.sub || !payload.jti || !ACTORS.includes(payload.actor as Actor) ||
      typeof payload.role !== "string" || !payload.role ||
      !Number.isInteger(payload.ver) || Number(payload.ver) < 0 ||
      typeof payload.csrf !== "string" || (expectedActor && payload.actor !== expectedActor)) return null;
    return payload as CanonicalSession;
  } catch { return null; }
}

export function secureCookie() {
  if (process.env.NODE_ENV === "production") return true;
  try { return new URL(getServerEnvironment().appOrigin).protocol === "https:"; }
  catch { return false; }
}

export function setSessionCookies(response: NextResponse, actor: Actor, session: {
  token: string; csrfToken: string; expiresIn?: number;
}) {
  const maxAge = session.expiresIn || SESSION_TTL_SECONDS[actor];
  response.cookies.set({
    name: sessionCookieName(actor), value: session.token, httpOnly: true,
    secure: secureCookie(), sameSite: "lax", path: "/", maxAge,
  });
  response.cookies.set({
    name: csrfCookieName(actor), value: session.csrfToken, httpOnly: false,
    secure: secureCookie(), sameSite: "lax", path: "/", maxAge,
  });
}

export function clearActorCookies(response: NextResponse, actor: Actor) {
  for (const name of [sessionCookieName(actor), csrfCookieName(actor), ...LEGACY_COOKIES[actor]]) {
    response.cookies.set({
      name, value: "", httpOnly: name.includes("session") || name.includes("token"),
      secure: secureCookie(), sameSite: "lax", path: "/", maxAge: 0,
    });
  }
}
