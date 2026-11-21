"use client";

import { csrfFetch } from "@/lib/client/csrf-fetch";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/layout/Header";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { presentMessage } from "@/lib/i18n/message-catalog";

export default function PassengerProfilePage() {
  const { t, locale } = useLanguage();
  const router = useRouter();
  const [form, setForm] = useState({ fullName: "", email: "", password: "" });
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [messageKey, setMessageKey] = useState("");
  const [errorCode, setErrorCode] = useState("");

  useEffect(() => {
    async function load() {
      let redirecting = false;
      try {
        const res = await csrfFetch("passenger", "/api/passenger/me", { cache: "no-store" });
        if (!res.ok) { redirecting = true; router.push("/passenger/login"); return; }
        const data = await res.json();
        setPhone(data.passenger.phone || "");
        setForm({
          fullName: data.passenger.fullName || "",
          email: data.passenger.email || "",
          password: "",
        });
      } catch {
        setErrorCode("SERVICE_UNAVAILABLE");
      } finally {
        if (!redirecting) setLoading(false);
      }
    }
    load();
  }, [router]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setErrorCode("");
    setMessageKey("");
    setSaving(true);

    try {
      const res = await csrfFetch("passenger", "/api/passenger/profile/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) { setErrorCode(typeof data?.code === "string" ? data.code : "SERVICE_UNAVAILABLE"); return; }
      setMessageKey("passenger.profileCompleted");
      setForm({ ...form, password: "" });
    } catch {
      setErrorCode("SERVICE_UNAVAILABLE");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Header forceSolid />
      <main className="min-h-screen bg-drivo-bg-soft px-4 pb-16 pt-32">
        <div className="mx-auto max-w-xl rounded-[28px] border border-drivo-border-light bg-white p-6 shadow-soft">
          <h1 className="text-3xl font-black text-drivo-navy">{t("passenger.profileTitle")}</h1>
          <p className="mt-2 text-sm text-drivo-text-secondary">{t("passenger.profileSubtitle")}</p>

          {errorCode && <div role="alert" className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{presentMessage(errorCode, locale)}</div>}
          {loading ? (
            <div className="mt-6 text-sm text-drivo-text-secondary">{t("passenger.loading")}</div>
          ) : (
            <form onSubmit={save} className="mt-6 space-y-4">
              <div className="rounded-2xl bg-drivo-bg-soft p-4 text-sm font-semibold text-drivo-text">
                {t("passenger.phoneVerified")}: {phone}
              </div>
              <input className="input" aria-label={t("passenger.fullName")} value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} placeholder={t("passenger.fullName")} required />
              <input className="input" aria-label={t("passenger.email")} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder={t("passenger.email")} required />
              <input className="input" aria-label={t("passenger.newPassword")} type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder={t("passenger.newPassword")} minLength={8} required />

              {messageKey && <div role="status" className="rounded-2xl border border-green-200 bg-green-50 p-3 text-sm font-semibold text-green-700">{t(messageKey)}</div>}

              <button className="btn-primary w-full justify-center" disabled={saving}>
                {saving ? t("passenger.saving") : t("passenger.saveProfile")}
              </button>
            </form>
          )}
        </div>
      </main>
    </>
  );
}
