import { NextRequest, NextResponse } from "next/server";
import { verifyToken, JWTPayload } from "@/lib/jwt";

export interface AuthenticatedRequest extends NextRequest {
  user?: JWTPayload;
}

/**
 * Middleware to verify JWT authentication
 * Usage: Wrap your handler function with this middleware
 */
export function withAuth(
  handler: (request: NextRequest, user: JWTPayload) => Promise<NextResponse>,
  options?: {
    roles?: JWTPayload["role"][];
  }
) {
  return async function (request: NextRequest): Promise<NextResponse> {
    // Extract token from Authorization header
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.split(" ")[1] : null;

    if (!token) {
      return NextResponse.json(
        { error: "Authentication required. No token provided." },
        { status: 401 }
      );
    }

    // Verify token
    const user = verifyToken(token);
    if (!user) {
      return NextResponse.json(
        { error: "Invalid or expired token. Please login again." },
        { status: 401 }
      );
    }

    // Check role if specified
    if (options?.roles && !options.roles.includes(user.role)) {
      return NextResponse.json(
        { error: "Insufficient permissions. This action requires different role." },
        { status: 403 }
      );
    }

    // Call handler with authenticated user
    return handler(request, user);
  };
}

/**
 * Simplified auth check for quick verification
 * Returns user payload or null
 */
export function getAuthenticatedUser(request: NextRequest): JWTPayload | null {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.split(" ")[1] : null;

  if (!token) {
    return null;
  }

  return verifyToken(token);
}

/**
 * Check if request has valid authentication
 */
export function isAuthenticated(request: NextRequest): boolean {
  return getAuthenticatedUser(request) !== null;
}
