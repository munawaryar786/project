"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import LanguageSwitcher from "@/components/shared/LanguageSwitcher";
import { csrfFetch } from "@/lib/client/csrf-fetch";
import { useLanguage } from "@/lib/i18n/LanguageContext";

export default function DispatchLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname(); const router = useRouter(); const { t } = useLanguage();
  const [loading, setLoading] = useState(true); const [error, setError] = useState(false); const [operatorName, setOperatorName] = useState("");
  const isPublic = pathname === "/dispatch/login";
  useEffect(() => {
    if (isPublic) { setLoading(false); return; }
    let active = true;
    void csrfFetch("dispatch_operator", "/api/dispatch/auth/me", { cache: "no-store" }).then(async (response) => {
      const data = await response.json().catch(() => ({}));
      if (!response.ok) { router.replace("/dispatch/login"); if (active) setLoading(false); return; }
      if (!active) return;
      setOperatorName(data.operator?.fullName || ""); setError(Boolean(data.operator?.mustChangePassword));
      if (data.operator?.mustChangePassword && pathname !== "/dispatch/change-password") router.replace("/dispatch/change-password");
      else if (!data.operator?.mustChangePassword && pathname === "/dispatch/change-password") router.replace("/dispatch");
      setLoading(false);
    }).catch(() => { if (active) { setLoading(false); router.replace("/dispatch/login"); } });
    return () => { active = false; };
  }, [isPublic, pathname, router]);
  if (isPublic) return <>{children}</>;
  if (loading || (error && pathname !== "/dispatch/change-password")) return <div className="flex min-h-screen items-center justify-center" role="status">{t("common.loading", "Loading")}</div>;
  async function logout() { await csrfFetch("dispatch_operator", "/api/dispatch/auth/logout", { method: "POST" }).catch(() => null); router.replace("/dispatch/login"); }
  return <div className="min-h-screen bg-slate-50 text-slate-900"><header className="border-b bg-white"><div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3"><div><Link href="/dispatch" className="text-lg font-black text-drivo-navy">Drivo · {t("dispatch.desk", "Dispatch Desk")}</Link>{operatorName && <p className="text-xs text-slate-600">{operatorName}</p>}</div><nav className="flex flex-wrap items-center gap-2" aria-label={t("dispatch.navigation", "Dispatch navigation")}><Link className="min-h-11 rounded-lg px-3 py-2 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2" href="/dispatch">{t("dispatch.home", "Bookings")}</Link><Link className="min-h-11 rounded-lg px-3 py-2 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2" href="/dispatch/bookings/new">{t("dispatch.newBooking", "New Phone Booking")}</Link><LanguageSwitcher tone="light"/><button onClick={() => void logout()} className="min-h-11 rounded-lg border px-3 py-2 focus-visible:outline focus-visible:outline-2">{t("common.logout", "Log out")}</button></nav></div></header><main className="mx-auto max-w-7xl p-4 sm:p-6">{children}</main></div>;
}
