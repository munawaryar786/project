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
      const message =
        err instanceof Error ? err.message : t("otp.failed", "Verification failed");
      setError(message);
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
        throw new Error(
          typeof data?.message === "string"
            ? data.message
            : typeof data?.error === "string"
              ? data.error
              : `API error: ${res.status}`
        );
      }

      if (typeof data.devOtp === "string") setCurrentDevOtp(data.devOtp);
      onResendSuccess?.(data);
      setSuccessMessage("A new verification code has been sent.");
      refs.current[0]?.focus();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : t("otp.resendFailed", "Resend failed");
      setError(message);
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
