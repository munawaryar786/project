"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { Suspense, useState } from "react";
import Header from "@/components/layout/Header";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { csrfFetch } from "@/lib/client/csrf-fetch";

function PassengerResetContent() {
  const { t } = useLanguage();
  const params = useSearchParams();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const token = params.get("token") || "";
  const attempt = params.get("attempt") || "";

  async function requestReset(event: React.FormEvent) {
    event.preventDefault(); setLoading(true); setStatus("");
    const email = new FormData(event.currentTarget as HTMLFormElement).get("email");
    try {
      const res = await csrfFetch("passenger", "/api/passenger/password-reset/email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
      const data = await res.json(); setStatus(data.message || "If an account exists, a reset email has been sent.");
    } catch { setStatus("If an account exists, a reset email has been sent."); } finally { setLoading(false); }
  }

  async function completeReset(event: React.FormEvent) {
    event.preventDefault(); setLoading(true); setStatus("");
    try {
      const res = await csrfFetch("passenger", "/api/passenger/password-reset/complete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ passwordResetProofToken: token, resetAttemptId: attempt, password, confirmPassword, rememberDevice: true }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Password reset could not be completed.");
      router.push("/passenger/dashboard");
    } catch (error) { setStatus(error instanceof Error ? error.message : "Password reset could not be completed."); } finally { setLoading(false); }
  }

  return <><Header forceSolid /><main className="min-h-screen bg-drivo-bg-soft px-4 pb-16 pt-32"><div className="mx-auto max-w-md rounded-[28px] border border-drivo-border-light bg-white p-6 shadow-soft"><h1 className="text-2xl font-black text-drivo-navy">{t("passenger.resetTitle", "Reset your password")}</h1><p className="mt-2 text-sm text-drivo-text-secondary">{t("passenger.resetDescription", "Use your registered email. The reset link expires and can be used once.")}</p>{status && <div role="status" className="mt-4 rounded-2xl border border-drivo-border-light bg-drivo-bg-soft p-3 text-sm font-semibold text-drivo-text-secondary">{status}</div>}{token && attempt ? <form onSubmit={completeReset} className="mt-6 space-y-4"><label className="block text-sm font-bold text-drivo-text">{t("passenger.newPassword", "New password")}<input className="input mt-2" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={12} /></label><label className="block text-sm font-bold text-drivo-text">{t("passenger.confirmPassword", "Confirm password")}<input className="input mt-2" type="password" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required minLength={12} /></label><button className="btn-primary w-full justify-center" disabled={loading}>{loading ? t("passenger.loading", "Loading...") : t("passenger.resetContinue", "Reset Password & Continue")}</button></form> : <form onSubmit={requestReset} className="mt-6 space-y-4"><label className="block text-sm font-bold text-drivo-text">{t("passenger.email", "Email")}<input className="input mt-2" type="email" name="email" autoComplete="email" required /></label><button className="btn-primary w-full justify-center" disabled={loading}>{loading ? t("passenger.loading", "Loading...") : t("passenger.sendResetEmail", "Send reset email")}</button></form>}</div></main></>;
}

export default function PassengerResetPage() {
  return <Suspense fallback={<main className="min-h-screen bg-drivo-bg-soft px-4 pb-16 pt-32" />}><PassengerResetContent /></Suspense>;
}