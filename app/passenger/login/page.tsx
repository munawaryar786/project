"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/layout/Header";
import { useLanguage } from "@/lib/i18n/LanguageContext";

export default function PassengerLoginPage() {
  const { t } = useLanguage();
  const router = useRouter();
  const [mode, setMode] = useState<"otp" | "password">("otp");
  const [phone, setPhone] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [devOtp, setDevOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function sendOtp(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/passenger/login/otp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || t("passenger.otpSendError"));
      setOtpSent(true);
      if (data.devOtp) setDevOtp(data.devOtp);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("passenger.otpSendError"));
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/passenger/login/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, otpCode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || t("passenger.otpVerifyError"));
      router.push("/passenger/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("passenger.otpVerifyError"));
    } finally {
      setLoading(false);
    }
  }

  async function loginPassword(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/passenger/login/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || t("passenger.loginError"));
      router.push("/passenger/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("passenger.loginError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Header forceSolid />
      <main className="min-h-screen bg-drivo-bg-soft px-4 pb-16 pt-32">
        <div className="mx-auto max-w-md rounded-[28px] border border-drivo-border-light bg-white p-6 shadow-soft">
          <h1 className="text-2xl font-black text-drivo-navy">{t("passenger.loginTitle")}</h1>
          <p className="mt-2 text-sm text-drivo-text-secondary">{t("passenger.loginSubtitle")}</p>

          <div className="mt-6 flex rounded-2xl bg-drivo-bg-soft p-1">
            <button
              type="button"
              onClick={() => setMode("otp")}
              className={`flex-1 rounded-xl px-3 py-2 text-sm font-bold ${mode === "otp" ? "bg-white text-drivo-green shadow-sm" : "text-drivo-text-secondary"}`}
            >
              {t("passenger.phoneOtpLogin")}
            </button>
            <button
              type="button"
              onClick={() => setMode("password")}
              className={`flex-1 rounded-xl px-3 py-2 text-sm font-bold ${mode === "password" ? "bg-white text-drivo-green shadow-sm" : "text-drivo-text-secondary"}`}
            >
              {t("passenger.emailPasswordLogin")}
            </button>
          </div>

          {error && (
            <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
              {error}
            </div>
          )}

          {mode === "otp" ? (
            <form onSubmit={otpSent ? verifyOtp : sendOtp} className="mt-6 space-y-4">
              <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={t("passenger.phone")} required />
              {otpSent && (
                <input className="input" value={otpCode} onChange={(e) => setOtpCode(e.target.value)} placeholder={t("passenger.otpCode")} required />
              )}
              {devOtp && (
                <div className="rounded-xl bg-drivo-bg-soft p-3 text-xs font-semibold text-drivo-text-secondary">
                  {t("passenger.devOtp")}: {devOtp}
                </div>
              )}
              <button className="btn-primary w-full justify-center" disabled={loading}>
                {loading ? t("passenger.loading") : otpSent ? t("passenger.verifyOtp") : t("passenger.sendOtp")}
              </button>
            </form>
          ) : (
            <form onSubmit={loginPassword} className="mt-6 space-y-4">
              <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t("passenger.email")} required />
              <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t("passenger.password")} required />
              <button className="btn-primary w-full justify-center" disabled={loading}>
                {loading ? t("passenger.loading") : t("passenger.signIn")}
              </button>
            </form>
          )}
        </div>
      </main>
    </>
  );
}
