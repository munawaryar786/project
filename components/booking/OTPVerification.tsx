"use client";

import { useEffect, useRef, useState } from "react";
import { useLanguage } from "@/lib/i18n/LanguageContext";

type ResendData = {
  devOtp?: string;
  message?: string;
};

type OtpPurpose = "PASSENGER_REGISTRATION" | "PASSENGER_LEGACY_PASSWORD_SETUP";

interface Props {
  onVerify: (otpCode: string) => Promise<void>;
  bookingId: string;
  phone: string;
  purpose: OtpPurpose;
  devOtp?: string;
  initialError?: string;
  onResendStart?: () => void;
  onResendSuccess?: (data: ResendData) => void;
}

const emptyOtp = ["", "", "", "", "", ""];

type Translate = (key: string, fallback?: string) => string;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readStringField(data: unknown, field: "code" | "message" | "error") {
  return isRecord(data) && typeof data[field] === "string" ? data[field] : "";
}

function bookingAuthErrorKeyFromCode(code: string) {
  switch (code) {
    case "ACCOUNT_EXISTS":
    case "ACCOUNT_EXISTS_LOGIN_REQUIRED":
      return "bookingAuth.errors.accountExists";
    case "PHONE_VERIFICATION_REQUIRED":
    case "LEGACY_SETUP_REQUIRED":
    case "REGISTRATION_REQUIRED":
      return "bookingAuth.errors.phoneVerificationRequired";
    case "OTP_EXPIRED":
    case "PROOF_EXPIRED":
      return "bookingAuth.errors.verificationExpired";
    case "RATE_LIMITED":
    case "TOO_MANY_ATTEMPTS":
      return "bookingAuth.errors.rateLimited";
    case "OTP_INVALID":
      return "bookingAuth.errors.invalidOtp";
    default:
      return "";
  }
}

function bookingAuthErrorKeyFromMessage(message: string) {
  const normalized = message.trim().toLowerCase();
  if (!normalized) return "";
  if (normalized.includes("log in or verify your phone")) return "bookingAuth.errors.authContinue";
  if (normalized.includes("incorrect password") || normalized.includes("password is incorrect")) return "bookingAuth.errors.invalidPassword";
  if (normalized === "authentication required") return "bookingAuth.errors.authenticationRequired";
  if (normalized.includes("phone verification") && normalized.includes("required")) return "bookingAuth.errors.phoneVerificationRequired";
  if (normalized.includes("verification expired") || normalized.includes("expired")) return "bookingAuth.errors.verificationExpired";
  if (normalized.includes("too many attempts") || normalized.includes("rate limit")) return "bookingAuth.errors.rateLimited";
  if (normalized.includes("password is required")) return "bookingAuth.errors.passwordRequired";
  if (normalized.includes("already has an account") || normalized.includes("already has a drivo account") || normalized.includes("account exists")) return "bookingAuth.errors.accountExists";
  if (normalized.includes("invalid verification code") || normalized.includes("invalid code")) return "bookingAuth.errors.invalidOtp";
  if (normalized.includes("verification failed")) return "bookingAuth.errors.verificationFailed";
  if (normalized.includes("something went wrong") || normalized.startsWith("api error")) return "bookingAuth.errors.unknown";
  return "";
}

const bookingAuthErrorFallbacks: Record<string, string> = {
  "bookingAuth.errors.authContinue": "Please log in or verify your phone to continue.",
  "bookingAuth.errors.invalidPassword": "Incorrect password.",
  "bookingAuth.errors.authenticationRequired": "Authentication required.",
  "bookingAuth.errors.phoneVerificationRequired": "Phone verification required.",
  "bookingAuth.errors.verificationExpired": "Verification expired. Please request a new code.",
  "bookingAuth.errors.rateLimited": "Too many attempts. Please try again later.",
  "bookingAuth.errors.passwordRequired": "Password is required.",
  "bookingAuth.errors.accountExists": "This phone already has an account.",
  "bookingAuth.errors.unknown": "Something went wrong. Please try again.",
  "bookingAuth.errors.invalidOtp": "Invalid verification code.",
  "bookingAuth.errors.verificationFailed": "Verification failed. Please try again.",
};

function translatedBookingAuthError(t: Translate, key: string) {
  return t(key, bookingAuthErrorFallbacks[key] || bookingAuthErrorFallbacks["bookingAuth.errors.unknown"]);
}

function localizedOtpError(data: unknown, fallbackKey: string, t: Translate) {
  const codeKey = bookingAuthErrorKeyFromCode(readStringField(data, "code"));
  if (codeKey) return translatedBookingAuthError(t, codeKey);

  const messageKey = bookingAuthErrorKeyFromMessage(readStringField(data, "message") || readStringField(data, "error"));
  if (messageKey) return translatedBookingAuthError(t, messageKey);

  return translatedBookingAuthError(t, fallbackKey);
}

function localizeThrownOtpError(error: unknown, fallbackKey: string, t: Translate) {
  const message = error instanceof Error ? error.message : "";
  const messageKey = bookingAuthErrorKeyFromMessage(message);
  if (messageKey) return translatedBookingAuthError(t, messageKey);

  const alreadyLocalized = Object.keys(bookingAuthErrorFallbacks).some(
    (key) => message === translatedBookingAuthError(t, key)
  );
  if (alreadyLocalized) return message;

  return translatedBookingAuthError(t, fallbackKey);
}

export default function OTPVerification({
  onVerify,
  bookingId,
  phone,
  purpose,
  devOtp,
  initialError = "",
  onResendStart,
  onResendSuccess,
}: Props) {
  const { t } = useLanguage();
  const [otp, setOtp] = useState(emptyOtp);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(initialError);
  const [successMessage, setSuccessMessage] = useState("");
  const [resending, setResending] = useState(false);
  const [currentDevOtp, setCurrentDevOtp] = useState<string | undefined>(devOtp);
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const showDevelopmentOtp = process.env.NODE_ENV !== "production" && currentDevOtp;

  useEffect(() => {
    setError(initialError);
  }, [initialError]);

  useEffect(() => {
    setCurrentDevOtp(devOtp);
  }, [devOtp]);

  const handleChange = (i: number, v: string) => {
    if (v.length > 1 || (v && !/^\d$/.test(v))) return;
    const next = [...otp];
    next[i] = v;
    setOtp(next);
    setSuccessMessage("");
    if (v && i < 5) refs.current[i + 1]?.focus();
  };

  const handleKeyDown = (i: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !otp[i] && i > 0) {
      refs.current[i - 1]?.focus();
    }
  };

  const handleVerify = async () => {
    const code = otp.join("");
    if (code.length !== 6) {
      setError(t("otp.enterAll", "Please enter all 6 digits"));
      return;
    }

    setError("");
    setSuccessMessage("");
    setLoading(true);

    try {
      await onVerify(code);
    } catch (err: unknown) {
      setError(localizeThrownOtpError(err, "bookingAuth.errors.verificationFailed", t));
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    setError("");
    setSuccessMessage("");
    setOtp(emptyOtp);
    setCurrentDevOtp(undefined);
    onResendStart?.();

    try {
      const res = await fetch("/api/otp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId, phone, purpose }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(localizedOtpError(data, "bookingAuth.errors.unknown", t));
      }

      if (typeof data.devOtp === "string") setCurrentDevOtp(data.devOtp);
      onResendSuccess?.(data);
      setSuccessMessage("A new verification code has been sent.");
      refs.current[0]?.focus();
    } catch (err: unknown) {
      setError(localizeThrownOtpError(err, "bookingAuth.errors.unknown", t));
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-8 md:py-16">
      <div className="card text-center">
        <div className="w-16 h-16 bg-green-100 rounded-2xl flex items-center justify-center text-3xl mx-auto mb-6">
          💬
        </div>
        <h2 className="text-[20px] font-bold text-drivo-text mb-2">
          {t("otp.title")}
        </h2>
        <p className="text-[14px] text-drivo-text-secondary mb-8">
          {purpose === "PASSENGER_LEGACY_PASSWORD_SETUP"
            ? t("passenger.legacyOtpSubtitle", "Enter the code sent to your phone to create a password.")
            : t("otp.subtitle")}
          {showDevelopmentOtp && (
            <>
              <br />
              <span className="text-[12px]">{t("passenger.devOtp", "Development OTP")}: {currentDevOtp}</span>
            </>
          )}
        </p>

        {error && (
          <div className="mb-4 p-3 bg-drivo-red-light rounded-xl">
            <p className="text-[13px] text-red-700">{error}</p>
          </div>
        )}

        {successMessage && (
          <div className="mb-4 p-3 rounded-xl border border-drivo-green/20 bg-drivo-green-light/40">
            <p className="text-[13px] font-semibold text-drivo-green-dark">{successMessage}</p>
          </div>
        )}

        <div className="flex justify-center gap-3 mb-8">
          {otp.map((digit, i) => (
            <input
              key={i}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={(e) => handleChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              className="w-12 h-14 text-center text-xl font-bold rounded-2xl border-2 border-drivo-border focus:border-drivo-green focus:ring-4 focus:ring-drivo-green/10 transition-all"
            />
          ))}
        </div>

        <button
          onClick={handleVerify}
          className="btn-primary w-full"
          disabled={loading}
        >
          {loading ? t("otp.verifying", "Verifying...") : t("otp.verify")}
        </button>

        <div className="mt-6 space-y-2">
          <button
            onClick={handleResend}
            disabled={resending}
            className="text-[13px] text-drivo-green font-medium hover:underline"
          >
            {resending ? t("otp.resending", "Resending...") : t("otp.resend")}
          </button>
        </div>
      </div>
    </div>
  );
}
