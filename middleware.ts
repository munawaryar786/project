import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

type Guard = { prefix: string; login: string; actor: "ADMIN" | "DRIVER" };

function cookieName(actor: Guard["actor"]) {
  const name = `drivo-${actor.toLowerCase()}-session`;
  return process.env.NODE_ENV === "production" ? `__Host-${name}` : name;
}

async function validSession(token: string, actor: Guard["actor"]) {
  const secret = process.env.AUTH_SIGNING_SECRET ||
    (process.env.NODE_ENV !== "production" ? process.env.JWT_SECRET : undefined);
  if (!secret || secret.length < 32) return false;
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), {
      algorithms: ["HS256"],
      issuer: "drivo",
      audience: "drivo-web",
    });
    return payload.actor === actor && Boolean(payload.sub);
  } catch {
    return false;
  }
}

export async function middleware(request: NextRequest) {
  const guards: Guard[] = [
    { prefix: "/admin", login: "/admin/login", actor: "ADMIN" },
    { prefix: "/driver", login: "/driver/login", actor: "DRIVER" },
  ];
  const guard = guards.find((item) => request.nextUrl.pathname.startsWith(item.prefix));
  if (!guard || request.nextUrl.pathname === guard.login) return NextResponse.next();

  const token = request.cookies.get(cookieName(guard.actor))?.value;
  if (!token || !(await validSession(token, guard.actor))) {
    return NextResponse.redirect(new URL(guard.login, request.url));
  }
  return NextResponse.next();
}

export const config = { matcher: ["/admin/:path*", "/driver/:path*"] };
