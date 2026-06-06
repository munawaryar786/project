"use client";

import { useState } from "react";
import LanguageSwitcher from "@/components/shared/LanguageSwitcher";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import BrandLogo from "@/components/shared/BrandLogo";

export default function AdminLoginPage() {
  const { t } = useLanguage();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/admin/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || t("login.invalid"));
        return;
      }

      const adminToken = data.accessToken || data.token || "admin-session";
      const adminUser = data.user || data.admin || { email };

      localStorage.setItem("drivo-admin-access-token", adminToken);
      localStorage.setItem("drivo-admin-refresh-token", data.refreshToken || "");
      localStorage.setItem("drivo-admin-user", JSON.stringify(adminUser));

      window.location.assign("/admin/dashboard");
    } catch (err: unknown) {
      setError(t("login.invalid"));
      console.error("Login error:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[linear-gradient(135deg,#031522_0%,#06283d_52%,#0f6877_100%)] px-4 py-10">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(67,227,217,0.16),transparent_28%),radial-gradient(circle_at_bottom_left,rgba(20,108,126,0.22),transparent_34%)]" />
      <div className="absolute right-4 top-4 z-10">
        <LanguageSwitcher tone="dark" />
      </div>

      <div className="relative mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-6xl items-center justify-center">
        <div className="grid w-full overflow-hidden rounded-[36px] border border-white/10 bg-white/8 shadow-[0_30px_80px_rgba(3,14,24,0.38)] backdrop-blur-xl lg:grid-cols-[0.95fr_1.05fr]">
          <div className="bg-white p-6 sm:p-8 lg:p-10">
            <BrandLogo className="h-16 w-44" />
            <div className="mt-8">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-drivo-teal">
                Admin Control
              </p>
              <h1 className="mt-3 text-3xl font-black tracking-tight text-drivo-navy">
                Secure DRIVO operations access
              </h1>
              <p className="mt-2 text-sm leading-7 text-drivo-text-secondary">
                Sign in to manage bookings, drivers, dispatch, and daily operations without changing any platform workflow.
              </p>
            </div>

            <form onSubmit={handleLogin} className="mt-8 space-y-5">
              <div>
                <label htmlFor="email" className="mb-2 block text-sm font-semibold text-drivo-text">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@drivo.sk"
                  required
                  className="input rounded-[20px]"
                  autoComplete="email"
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
                  className="input rounded-[20px]"
                  autoComplete="current-password"
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
          </div>

          <div className="hidden p-10 text-white lg:flex lg:flex-col lg:justify-between">
            <div>
              <p className="inline-flex rounded-full border border-white/14 bg-white/8 px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-drivo-aqua">
                Premium Mobility Platform
              </p>
              <h2 className="mt-6 max-w-md text-5xl font-black leading-[1.02]">
                One brand system across customer, driver, and admin surfaces.
              </h2>
              <p className="mt-5 max-w-lg text-base leading-8 text-white/68">
                The admin workspace now visually aligns with DRIVO's navy and aqua identity while preserving the existing booking, OTP, payment, and dispatch logic.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              {[
                ["Bookings", "Live overview"],
                ["Drivers", "Availability control"],
                ["Dispatch", "Operational clarity"],
              ].map(([title, desc]) => (
                <div key={title} className="rounded-[28px] border border-white/10 bg-white/8 p-5">
                  <div className="text-lg font-bold text-white">{title}</div>
                  <div className="mt-2 text-sm text-white/60">{desc}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
