"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/layout/Header";
import { useLanguage } from "@/lib/i18n/LanguageContext";

export default function PassengerProfilePage() {
  const { t } = useLanguage();
  const router = useRouter();
  const [form, setForm] = useState({ fullName: "", email: "", password: "" });
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      const res = await fetch("/api/passenger/me", { cache: "no-store" });
      if (!res.ok) {
        router.push("/passenger/login");
        return;
      }
      const data = await res.json();
      setPhone(data.passenger.phone || "");
      setForm({
        fullName: data.passenger.fullName || "",
        email: data.passenger.email || "",
        password: "",
      });
      setLoading(false);
    }
    load();
  }, [router]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    setSaving(true);

    try {
      const res = await fetch("/api/passenger/profile/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || t("passenger.profileCompleteError"));
      setMessage(t("passenger.profileCompleted"));
      setForm({ ...form, password: "" });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("passenger.profileCompleteError"));
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

          {loading ? (
            <div className="mt-6 text-sm text-drivo-text-secondary">{t("passenger.loading")}</div>
          ) : (
            <form onSubmit={save} className="mt-6 space-y-4">
              <div className="rounded-2xl bg-drivo-bg-soft p-4 text-sm font-semibold text-drivo-text">
                {t("passenger.phoneVerified")}: {phone}
              </div>
              <input className="input" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} placeholder={t("passenger.fullName")} required />
              <input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder={t("passenger.email")} required />
              <input className="input" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder={t("passenger.newPassword")} minLength={8} required />

              {message && <div className="rounded-2xl border border-green-200 bg-green-50 p-3 text-sm font-semibold text-green-700">{message}</div>}
              {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div>}

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
