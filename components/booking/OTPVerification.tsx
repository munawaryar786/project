"use client";

import { useRef, useState } from "react";
import { useLanguage } from "@/lib/i18n/LanguageContext";

interface Props {
  onVerify: (otpCode: string) => Promise<void>;
  bookingId: string;
  phone: string;
  devOtp?: string;
}

export default function OTPVerification({
  onVerify,
  bookingId,
  phone,
  devOtp,
}: Props) {
  const { t } = useLanguage();
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [resending, setResending] = useState(false);
  const [currentDevOtp, setCurrentDevOtp] = useState<string | undefined>(devOtp);
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  const handleChange = (i: number, v: string) => {
    if (v.length > 1) return;
    const next = [...otp];
    next[i] = v;
    setOtp(next);
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

    try {
      const res = await fetch("/api/otp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId, phone }),
      });

      if (!res.ok) throw new Error(`API error: ${res.status}`);

      const data = await res.json();
      setOtp(["", "", "", "", "", ""]);
      if (data.devOtp) setCurrentDevOtp(data.devOtp);
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
          {t("otp.subtitle")}
          <br />
          <span className="text-[12px]">{t("otp.devNote")}</span>
        </p>

        {error && (
          <div className="mb-4 p-3 bg-drivo-red-light rounded-xl">
            <p className="text-[13px] text-red-700">{error}</p>
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
