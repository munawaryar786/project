"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { csrfFetch } from "@/lib/client/csrf-fetch";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import LanguageSwitcher from "@/components/shared/LanguageSwitcher";

export default function DispatchLoginPage() {
  const router = useRouter(); const { t } = useLanguage(); const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) { event.preventDefault(); setBusy(true); setError(""); const response = await csrfFetch("dispatch_operator", "/api/dispatch/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) }); const data = await response.json().catch(() => ({})); setBusy(false); if (!response.ok) { setError(data.error || t("dispatch.loginError", "Invalid email or password.")); return; } router.replace(data.mustChangePassword ? "/dispatch/change-password" : "/dispatch"); }
  return <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4"><section className="w-full max-w-md rounded-2xl border bg-white p-6 shadow-sm" aria-labelledby="dispatch-login-heading"><div className="flex items-center justify-between"><Link href="/" className="font-black text-drivo-navy">Drivo</Link><LanguageSwitcher tone="light"/></div><h1 id="dispatch-login-heading" className="mt-6 text-2xl font-black">{t("dispatch.loginTitle", "Dispatch Operator login")}</h1><form onSubmit={submit} className="mt-5 space-y-4"><label className="block text-sm font-semibold">{t("dispatch.email", "Email")}<input required type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1 min-h-12 w-full rounded-lg border px-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-700"/></label><label className="block text-sm font-semibold">{t("dispatch.password", "Password")}<input required type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1 min-h-12 w-full rounded-lg border px-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-700"/></label>{error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-900">{error}</p>}<button disabled={busy} className="min-h-12 w-full rounded-xl bg-drivo-navy px-4 font-bold text-white disabled:opacity-50">{busy ? t("common.loading", "Loading") : t("dispatch.login", "Log in")}</button></form></section></main>;
}
