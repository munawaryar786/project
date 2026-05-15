import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const secret = new TextEncoder().encode(
  process.env.JWT_SECRET!
);

async function verifyToken(token: string) {
  try {
    const { payload } =
      await jwtVerify(token, secret);

    return payload;
  } catch {
    return null;
  }
}

export async function middleware(
  request: NextRequest
) {
  const pathname =
    request.nextUrl.pathname;

  // ============================================
  // ADMIN ROUTES
  // ============================================

  if (pathname.startsWith("/admin")) {
    // Allow login page
    if (
      pathname === "/admin/login"
    ) {
      return NextResponse.next();
    }

    const token =
      request.cookies.get(
        "drivo_admin_token"
      )?.value;

    if (!token) {
      return NextResponse.redirect(
        new URL(
          "/admin/login",
          request.url
        )
      );
    }

    const payload =
      await verifyToken(token);

    if (
      !payload ||
      payload.type !== "ADMIN"
    ) {
      return NextResponse.redirect(
        new URL(
          "/admin/login",
          request.url
        )
      );
    }

    return NextResponse.next();
  }

  // ============================================
  // DRIVER ROUTES
  // ============================================

  if (pathname.startsWith("/driver")) {
    // Allow login page
    if (
      pathname === "/driver/login"
    ) {
      return NextResponse.next();
    }

    const token =
      request.cookies.get(
        "drivo_driver_token"
      )?.value;

    if (!token) {
      return NextResponse.redirect(
        new URL(
          "/driver/login",
          request.url
        )
      );
    }

    const payload =
      await verifyToken(token);

    if (
      !payload ||
      payload.type !== "DRIVER"
    ) {
      return NextResponse.redirect(
        new URL(
          "/driver/login",
          request.url
        )
      );
    }

    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/driver/:path*",
  ],
};