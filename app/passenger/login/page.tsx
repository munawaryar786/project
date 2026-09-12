"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/layout/Header";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { csrfFetch } from "@/lib/client/csrf-fetch";

export default function PassengerLoginPage() {
  const { t } = useLanguage();
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function loginPassword(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await csrfFetch("passenger", "/api/passenger/login/password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identifier, password }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || t("passenger.loginError"));
      router.push("/passenger/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("passenger.loginError"));
    } finally {
      setLoading(false);
    }
  }

  return <>
    <Header forceSolid />
    <main className="min-h-screen bg-drivo-bg-soft px-4 pb-16 pt-32">
      <div className="mx-auto max-w-md rounded-[28px] border border-drivo-border-light bg-white p-6 shadow-soft">
        <h1 className="text-2xl font-black text-drivo-navy">{t("passenger.loginTitle")}</h1>
        <p className="mt-2 text-sm text-drivo-text-secondary">{t("passenger.phoneOrEmail", "Mobile or email")} + {t("passenger.password")}</p>
        {error && <div id="passenger-login-error" role="alert" className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div>}
        <form onSubmit={loginPassword} className="mt-6 space-y-4">
          <label htmlFor="passenger-login-identifier" className="block text-sm font-bold text-drivo-text">{t("passenger.phoneOrEmail", "Mobile or email")}
            <input id="passenger-login-identifier" className="input mt-2 w-full" type="text" autoComplete="username" value={identifier} onChange={(e) => setIdentifier(e.target.value)} required aria-describedby={error ? "passenger-login-error" : undefined} />
          </label>
          <label htmlFor="passenger-login-password" className="block text-sm font-bold text-drivo-text">{t("passenger.password")}
            <input id="passenger-login-password" className="input mt-2 w-full" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          <button className="btn-primary w-full justify-center" disabled={loading}>{loading ? t("passenger.loading") : t("passenger.signIn")}</button>
          <a href="/passenger/reset" className="block text-center text-sm font-semibold text-drivo-green hover:underline">{t("passenger.forgotPassword", "Forgot password?")}</a>
          <p className="text-center text-xs text-drivo-text-secondary">{t("passenger.registrationPrompt", "First time? Verify your mobile during booking to create an account.")}</p>
        </form>
      </div>
    </main>
  </>;
}
