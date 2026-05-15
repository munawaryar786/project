/**
 * Environment Variable Validation
 * This module validates all required environment variables at startup
 * to prevent runtime errors.
 */

interface EnvVarConfig {
  name: string;
  required: boolean;
  pattern?: RegExp;
  description?: string;
}

const requiredEnvVars: EnvVarConfig[] = [
  {
    name: "DATABASE_URL",
    required: true,
    description: "Database connection string (SQLite or PostgreSQL)",
  },
  {
    name: "JWT_SECRET",
    required: true,
    pattern: /^.{32,}$/,
    description: "JWT signing key (min 32 characters)",
  },
  {
    name: "STRIPE_SECRET_KEY",
    required: true,
    pattern: /^sk_(test|live)_/,
    description: "Stripe secret key",
  },
  {
    name: "STRIPE_PUBLISHABLE_KEY",
    required: true,
    pattern: /^pk_(test|live)_/,
    description: "Stripe publishable key",
  },
  {
    name: "STRIPE_WEBHOOK_SECRET",
    required: true,
    pattern: /^whsec_/,
    description: "Stripe webhook signing secret",
  },
  {
    name: "TWILIO_ACCOUNT_SID",
    required: false, // Optional for development
    pattern: /^AC[a-f0-9]{32}$/,
    description: "Twilio account SID (for OTP)",
  },
  {
    name: "TWILIO_AUTH_TOKEN",
    required: false,
    description: "Twilio auth token (for OTP)",
  },
  {
    name: "TWILIO_PHONE_NUMBER",
    required: false,
    description: "Twilio phone number (for OTP)",
  },
  {
    name: "GOOGLE_MAPS_API_KEY",
    required: false, // Optional for development
    description: "Google Maps API key (for distance calculation)",
  },
  {
    name: "RESEND_API_KEY",
    required: false, // Optional for development
    description: "Resend API key (for email notifications)",
  },
  {
    name: "ADMIN_EMAIL",
    required: true,
    pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    description: "Admin email for notifications",
  },
  {
    name: "NEXT_PUBLIC_BASE_URL",
    required: true,
    pattern: /^https?:\/\//,
    description: "Base URL of the application",
  },
];

export function validateEnvironment(): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const config of requiredEnvVars) {
    const value = process.env[config.name];

    // Check if required variable is missing
    if (config.required && !value) {
      errors.push(
        `❌ Missing required environment variable: ${config.name}${
          config.description ? ` (${config.description})` : ""
        }`
      );
      continue;
    }

    // Skip validation if optional and not set
    if (!value && !config.required) {
      warnings.push(
        `⚠️  Optional environment variable not set: ${config.name}${
          config.description ? ` (${config.description})` : ""
        }`
      );
      continue;
    }

    // Validate pattern if provided
    if (config.pattern && value && !config.pattern.test(value)) {
      errors.push(
        `❌ Invalid format for ${config.name}: ${config.description || ""}`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Log environment validation results
 */
export function logEnvironmentStatus(): void {
  const { valid, errors, warnings } = validateEnvironment();

  console.log("\n" + "=".repeat(60));
  console.log("🔍 DRIVO Environment Status");
  console.log("=".repeat(60));

  if (warnings.length > 0) {
    console.log("\n⚠️  Warnings:");
    warnings.forEach((w) => console.log(`  ${w}`));
  }

  if (valid) {
    console.log("\n✅ All required environment variables are configured");
    console.log(`   Mode: ${process.env.NODE_ENV || "development"}`);
    console.log(`   URL: ${process.env.NEXT_PUBLIC_BASE_URL}`);
  } else {
    console.log("\n❌ Environment validation failed:");
    errors.forEach((e) => console.log(`  ${e}`));
  }

  console.log("=".repeat(60) + "\n");
}

// Run validation on import (only in Node.js environment, not browser)
if (typeof window === "undefined" && process.env.NODE_ENV !== "test") {
  logEnvironmentStatus();
}
