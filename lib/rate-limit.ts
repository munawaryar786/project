import { NextRequest, NextResponse } from "next/server";

// In-memory store for rate limiting (use Redis in production)
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

interface RateLimitOptions {
  max: number; // Maximum number of requests
  windowMs: number; // Time window in milliseconds
  message?: string; // Custom error message
  scope?: string; // Stable business scope for shared endpoints
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
    
    const key = `${ip}:${options.scope || request.nextUrl.pathname}`;
    
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
  passengerRegistrationPhoneCheck: {
    scope: "registration_phone_check",
    max: 10,
    windowMs: 5 * 60 * 1000,
    message: "Too many phone checks. Please wait and try again."
  },

  passengerRegistrationOtpSend: {
    scope: "registration_otp_send",
    max: 3,
    windowMs: 5 * 60 * 1000,
    message: "Too many OTP requests. Please wait before requesting another OTP."
  },

  passengerRegistrationOtpVerify: {
    scope: "registration_otp_verify",
    max: 5,
    windowMs: 5 * 60 * 1000,
    message: "Too many verification attempts. Please request a new code."
  },

  passengerAccountCreate: {
    scope: "account_create",
    max: 5,
    windowMs: 15 * 60 * 1000,
    message: "Too many account creation attempts. Please wait and try again."
  },

  passengerLoginPassword: {
    scope: "login_password",
    max: 5,
    windowMs: 15 * 60 * 1000,
    message: "Too many login attempts. Please try again later."
  },

  passengerLoginStepUpOtpSend: {
    scope: "login_step_up_otp_send",
    max: 5,
    windowMs: 5 * 60 * 1000,
    message: "Too many verification attempts. Please request a new code."
  },

  passengerLoginStepUpOtpVerify: {
    scope: "login_step_up_otp_verify",
    max: 5,
    windowMs: 5 * 60 * 1000,
    message: "Too many verification attempts. Please request a new code."
  },

  passengerPasswordResetOtpSend: {
    scope: "password_reset_otp_send",
    max: 5,
    windowMs: 15 * 60 * 1000,
    message: "Too many password reset attempts. Please wait and try again."
  },

  passengerPasswordResetOtpVerify: {
    scope: "password_reset_otp_verify",
    max: 5,
    windowMs: 15 * 60 * 1000,
    message: "Too many password reset attempts. Please wait and try again."
  },

  passengerPasswordResetComplete: {
    scope: "password_reset_complete",
    max: 5,
    windowMs: 15 * 60 * 1000,
    message: "Too many password reset attempts. Please wait and try again."
  },

  // Backward-compatible defaults for older routes.
  auth: {
    scope: "login_password",
    max: 5,
    windowMs: 15 * 60 * 1000,
    message: "Too many login attempts. Please try again later."
  },
  
  otp: {
    scope: "registration_otp_send",
    max: 3,
    windowMs: 5 * 60 * 1000,
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
