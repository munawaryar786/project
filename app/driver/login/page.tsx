"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import BrandLogo from "@/components/shared/BrandLogo";
import LanguageSwitcher from "@/components/shared/LanguageSwitcher";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { PHONE_NUMBER, WHATSAPP_URL } from "@/lib/constants";

export default function DriverLoginPage() {
  const { t } = useLanguage();
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/driver/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || t("login.invalid"));
      }

      localStorage.setItem("drivo-driver", JSON.stringify(data.driver));
      localStorage.setItem("drivo-driver-user", JSON.stringify(data.driver));
      localStorage.setItem("drivo-driver-token", data.token || "driver-session");

      window.location.assign("/driver/dashboard");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("login.invalid"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[linear-gradient(135deg,#041a2b_0%,#062338_45%,#0d5c68_100%)] px-4 py-10">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(63,214,205,0.22),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(31,129,147,0.2),transparent_32%)]" />
      <div className="absolute right-4 top-4 z-10">
        <LanguageSwitcher tone="dark" />
      </div>

      <div className="relative mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-6xl items-center justify-center">
        <div className="grid w-full overflow-hidden rounded-[36px] border border-white/10 bg-white/[0.08] shadow-[0_30px_80px_rgba(3,14,24,0.38)] backdrop-blur-xl lg:grid-cols-[1.1fr_0.9fr]">
          <div className="hidden p-10 text-white lg:flex lg:flex-col lg:justify-between">
            <div>
              <p className="inline-flex rounded-full border border-white/[0.14] bg-white/[0.08] px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-drivo-aqua">
                Driver Portal
              </p>
              <h1 className="mt-6 max-w-md text-5xl font-black leading-[1.02]">
                Premium dispatch, cleaner workflow, faster response.
              </h1>
              <p className="mt-5 max-w-lg text-base leading-8 text-white/[0.68]">
                DRIVO keeps your assigned rides, live availability, and ride requests in one calm, accessible workspace.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              {[
                ["24/7", "Live dispatch"],
                ["GPS", "Location updates"],
                ["SK", "Slovak-first flow"],
              ].map(([value, label]) => (
                <div key={label} className="rounded-[28px] border border-white/10 bg-white/[0.08] p-5">
                  <div className="text-2xl font-black text-white">{value}</div>
                  <div className="mt-2 text-sm text-white/60">{label}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white p-6 sm:p-8 lg:p-10">
            <BrandLogo className="h-16 w-44" />
            <div className="mt-8">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-drivo-teal">
                {t("login.driverPortal")}
              </p>
              <h2 className="mt-3 text-3xl font-black tracking-tight text-drivo-navy">
                {t("login.signIn")}
              </h2>
              <p className="mt-2 text-sm leading-7 text-drivo-text-secondary">
                {t("login.driverOnly")}
              </p>
            </div>

            <form onSubmit={handleLogin} className="mt-8 space-y-5">
              <div>
                <label htmlFor="phone" className="mb-2 block text-sm font-semibold text-drivo-text">
                  {t("common.phone")}
                </label>
                <input
                  id="phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+421 912 345 678"
                  required
                  autoComplete="tel"
                  className="input rounded-[20px]"
                />
              </div>

              <div>
                <label htmlFor="password" className="mb-2 block text-sm font-semibold text-drivo-text">
                  {t("common.password")}
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="********"
                  required
                  autoComplete="current-password"
                  className="input rounded-[20px]"
                />
              </div>

              {error && (
                <div className="rounded-[22px] border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                  {error}
                </div>
              )}

              <button type="submit" disabled={loading} className="btn-primary w-full justify-center rounded-[20px]">
                {loading ? t("login.signingIn") : t("login.signIn")}
              </button>
            </form>

            <div className="mt-8 rounded-[26px] border border-drivo-border bg-drivo-bg-soft px-5 py-4">
              <p className="text-xs uppercase tracking-[0.2em] text-drivo-text-muted">{t("login.noAccount")}</p>
              <div className="mt-3 flex flex-wrap gap-4 text-sm font-semibold">
                <a href={`tel:${PHONE_NUMBER}`} className="text-drivo-teal transition hover:text-drivo-navy">
                  {t("common.callUs")}
                </a>
                <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className="text-drivo-teal transition hover:text-drivo-navy">
                  {t("common.whatsapp")}
                </a>
              </div>
            </div>

            {process.env.NODE_ENV === "development" && (
              <div className="mt-5 rounded-[22px] border border-drivo-aqua/30 bg-drivo-aqua/10 px-4 py-3 text-sm text-drivo-teal">
                Dev: add a driver in Admin, then use their phone + password "driver123".
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
