import { NextRequest, NextResponse } from "next/server";

// In-memory store for rate limiting (use Redis in production)
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

interface RateLimitOptions {
  max: number; // Maximum number of requests
  windowMs: number; // Time window in milliseconds
  message?: string; // Custom error message
}

/**
 * Rate limiting middleware for Next.js API routes
 * Usage: Wrap your handler with this function
 */
export function withRateLimit(
  handler: (request: NextRequest) => Promise<NextResponse>,
  options: RateLimitOptions = { max: 100, windowMs: 15 * 60 * 1000 } // Default: 100 requests per 15 minutes
) {
  return async function (request: NextRequest): Promise<NextResponse> {
    // Get client identifier (IP address)
    const ip = request.headers.get("x-forwarded-for") || 
               request.headers.get("x-real-ip") || 
               "unknown";
    
    // Create a unique key per IP + endpoint
    const key = `${ip}:${request.nextUrl.pathname}`;
    
    const now = Date.now();
    const record = rateLimitStore.get(key);
    
    // Clean up expired records
    if (record && now > record.resetTime) {
      rateLimitStore.delete(key);
    }
    
    // Get or create rate limit record
    const current = rateLimitStore.get(key) || { count: 0, resetTime: now + options.windowMs };
    
    // Increment request count
    current.count += 1;
    
    // Check if limit exceeded
    if (current.count > options.max) {
      return NextResponse.json(
        { 
          error: options.message || "Too many requests. Please try again later.",
          retryAfter: Math.ceil((current.resetTime - now) / 1000) // Seconds until reset
        },
        { 
          status: 429,
          headers: {
            "X-RateLimit-Limit": String(options.max),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": String(current.resetTime),
            "Retry-After": String(Math.ceil((current.resetTime - now) / 1000))
          }
        }
      );
    }
    
    // Update store
    rateLimitStore.set(key, current);
    
    // Add rate limit headers to successful responses
    const response = await handler(request);
    response.headers.set("X-RateLimit-Limit", String(options.max));
    response.headers.set("X-RateLimit-Remaining", String(options.max - current.count));
    response.headers.set("X-RateLimit-Reset", String(current.resetTime));
    
    return response;
  };
}

/**
 * Pre-configured rate limits for different scenarios
 */
export const rateLimits = {
  // Strict rate limit for authentication endpoints
  auth: {
    max: 5, // 5 requests
    windowMs: 15 * 60 * 1000, // per 15 minutes
    message: "Too many login attempts. Please try again later."
  },
  
  // Medium rate limit for OTP endpoints
  otp: {
    max: 3, // 3 requests
    windowMs: 5 * 60 * 1000, // per 5 minutes
    message: "Too many OTP requests. Please wait before requesting another OTP."
  },
  
  // Standard rate limit for general API endpoints
  standard: {
    max: 100, // 100 requests
    windowMs: 15 * 60 * 1000, // per 15 minutes
    message: "Too many requests. Please slow down."
  },
  
  // Lenient rate limit for public endpoints
  public: {
    max: 200, // 200 requests
    windowMs: 15 * 60 * 1000, // per 15 minutes
    message: "Too many requests."
  }
};

/**
 * Clean up expired rate limit records (call periodically)
 */
export function cleanupExpiredRateLimits() {
  const now = Date.now();
  for (const [key, record] of rateLimitStore.entries()) {
    if (now > record.resetTime) {
      rateLimitStore.delete(key);
    }
  }
}

// Run cleanup every 10 minutes
if (typeof global !== "undefined") {
  setInterval(cleanupExpiredRateLimits, 10 * 60 * 1000);
}
