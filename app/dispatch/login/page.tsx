"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { csrfFetch } from "@/lib/client/csrf-fetch";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import LanguageSwitcher from "@/components/shared/LanguageSwitcher";
import BrandLogo from "@/components/shared/BrandLogo";

export default function DispatchLoginPage() {
  const router = useRouter(); const { t } = useLanguage(); const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) { event.preventDefault(); setBusy(true); setError(""); try { const response = await csrfFetch("dispatch_operator", "/api/dispatch/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) }); const data = await response.json().catch(() => ({})); if (!response.ok) { setError("LOGIN_FAILED"); return; } router.replace(data.mustChangePassword ? "/dispatch/change-password" : "/dispatch"); } catch { setError("LOGIN_FAILED"); } finally { setBusy(false); } }

  return (
    <main className="relative min-h-[100dvh] overflow-hidden bg-[linear-gradient(135deg,#041a2b_0%,#062338_48%,#0d5c68_100%)]">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(63,214,205,0.2),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(31,129,147,0.22),transparent_35%)]" />

      <header className="relative z-20 mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-5 sm:px-6">
        <Link href="/" aria-label="Drivo home" className="shrink-0">
          <BrandLogo variant="light" className="h-12 w-32 sm:h-14 sm:w-40" />
        </Link>
        <LanguageSwitcher tone="dark" />
      </header>

      <div className="relative z-10 mx-auto flex min-h-[calc(100dvh-100px)] max-w-6xl items-center px-4 pb-12 sm:px-6">
        <div className="grid w-full overflow-hidden rounded-[28px] border border-white/15 bg-white/[0.08] shadow-[0_30px_80px_rgba(3,14,24,0.35)] backdrop-blur-lg lg:grid-cols-2">

          <section className="hidden flex-col justify-between p-10 text-white lg:flex">
            <div>
              <span className="inline-flex rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-bold uppercase tracking-widest text-drivo-aqua">
                Drivo Dispatch
              </span>
              <h2 className="mt-8 text-4xl font-black leading-tight">
                {t("dispatch.desk", "Dispatch Desk")}
              </h2>
              <p className="mt-5 max-w-md text-base leading-8 text-white/75">
                {t("dispatch.loginSubtitle", "Manage passenger bookings, driver assignments and transport operations.")}
              </p>
            </div>
            <p className="text-sm text-white/60">
              Drivo · Bratislava, Slovakia
            </p>
          </section>

          <section className="bg-white px-5 py-9 sm:px-9 sm:py-12 lg:px-12" aria-labelledby="dispatch-login-heading">
            <BrandLogo variant="dark" className="h-14 w-36" />
            <p className="mt-7 text-xs font-bold uppercase tracking-[0.18em] text-drivo-teal">
              Drivo Operations
            </p>
            <h1 id="dispatch-login-heading" className="mt-3 text-2xl font-black tracking-tight text-drivo-navy sm:text-3xl">
              {t("dispatch.loginTitle", "Dispatch Operator login")}
            </h1>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              {t("dispatch.loginHelp", "Sign in using the account provided by your administrator.")}
            </p>

            <form onSubmit={submit} className="mt-8 space-y-5">
              <div>
                <label htmlFor="dispatch-email" className="block text-sm font-semibold text-slate-800">
                  {t("dispatch.email", "Email")}
                </label>
                <input
                  id="dispatch-email"
                  type="email"
                  required
                  maxLength={254}
                  autoComplete="username"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-base text-slate-900 outline-none transition focus-visible:border-teal-700 focus-visible:ring-2 focus-visible:ring-teal-700"
                />
              </div>

              <div>
                <label htmlFor="dispatch-password" className="block text-sm font-semibold text-slate-800">
                  {t("dispatch.password", "Password")}
                </label>
                <input
                  id="dispatch-password"
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-base text-slate-900 outline-none transition focus-visible:border-teal-700 focus-visible:ring-2 focus-visible:ring-teal-700"
                />
              </div>

              {error && (
                <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-900">
                  {t("dispatch.loginError", "Invalid email or password. Please check your credentials.")}
                </p>
              )}

              <button
                type="submit"
                disabled={busy}
                className="flex min-h-12 w-full items-center justify-center rounded-xl bg-drivo-navy px-5 py-3 text-base font-bold text-white transition hover:bg-[#123d57] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busy ? t("common.loading", "Loading") : t("dispatch.login", "Log in")}
              </button>
            </form>

            <p className="mt-7 border-t border-slate-200 pt-5 text-center text-sm text-slate-600">
              {t("dispatch.accountHelp", "Need account assistance? Contact your Drivo administrator.")}
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
