"use client";

import { useCallback, useEffect, useState } from "react";
import { csrfFetch } from "@/lib/client/csrf-fetch";
import { useLanguage } from "@/lib/i18n/LanguageContext";

type Operator = { id: string; fullName: string; email: string; phone: string; status: string; mustChangePassword: boolean; lastLoginAt: string | null; createdAt: string; createdByAdminId: string | null };

export default function DispatchTeamPage() {
  const { t, locale } = useLanguage();
  const [operators, setOperators] = useState<Operator[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<Operator | null>(null);
  const [form, setForm] = useState({ fullName: "", email: "", phone: "", temporaryPassword: "" });
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    const response = await csrfFetch("admin", "/api/admin/dispatch-operators", { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (response.ok) setOperators(data.operators || []);
    else setError(data.error || t("dispatchAdmin.loadError", "Could not load operators."));
    setLoading(false);
  }, [t]);
  useEffect(() => { void load(); }, [load]);

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    const url = editing ? `/api/admin/dispatch-operators/${editing.id}` : "/api/admin/dispatch-operators";
    const payload = editing ? { fullName: form.fullName, email: form.email, phone: form.phone, ...(form.temporaryPassword ? { temporaryPassword: form.temporaryPassword } : {}) } : form;
    const response = await csrfFetch("admin", url, { method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const data = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) { setError(data.error || t("dispatchAdmin.saveError", "Could not save operator.")); return; }
    setNotice(t("dispatchAdmin.saved", "Dispatch Operator saved.")); setEditing(null); setForm({ fullName: "", email: "", phone: "", temporaryPassword: "" }); await load();
  }

  function edit(operator: Operator) { setEditing(operator); setForm({ fullName: operator.fullName, email: operator.email, phone: operator.phone, temporaryPassword: "" }); }
  async function update(operator: Operator, changes: Record<string, string>) {
    setBusy(true); setError("");
    const response = await csrfFetch("admin", `/api/admin/dispatch-operators/${operator.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(changes) });
    const data = await response.json().catch(() => ({})); setBusy(false);
    if (!response.ok) setError(data.error || t("dispatchAdmin.saveError", "Could not save operator.")); else { setNotice(t("dispatchAdmin.saved", "Dispatch Operator saved.")); await load(); }
  }

  return <main className="mx-auto max-w-6xl space-y-6" aria-labelledby="dispatch-team-heading">
    <header><h1 id="dispatch-team-heading" className="text-2xl font-black text-drivo-navy">{t("dispatchAdmin.title", "Dispatch Team")}</h1><p className="mt-1 text-sm text-gray-600">{t("dispatchAdmin.subtitle", "Create and manage Dispatch Operator accounts.")}</p></header>
    {error && <p role="alert" className="rounded-xl border border-red-300 bg-red-50 p-3 text-red-900">{error}</p>}
    {notice && <p role="status" aria-live="polite" className="rounded-xl border border-green-300 bg-green-50 p-3 text-green-900">{notice}</p>}
    <section className="rounded-2xl border bg-white p-5" aria-labelledby="operator-form-heading">
      <h2 id="operator-form-heading" className="text-lg font-bold">{editing ? t("dispatchAdmin.edit", "Edit operator") : t("dispatchAdmin.create", "Create Dispatch Operator")}</h2>
      <form className="mt-4 grid gap-4 sm:grid-cols-2" onSubmit={submit}>
        <label className="text-sm font-semibold">{t("dispatchAdmin.name", "Full name")}<input required minLength={2} maxLength={120} autoComplete="name" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} className="mt-1 min-h-11 w-full rounded-lg border px-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700" /></label>
        <label className="text-sm font-semibold">{t("dispatchAdmin.email", "Email")}<input required type="email" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="mt-1 min-h-11 w-full rounded-lg border px-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700" /></label>
        <label className="text-sm font-semibold">{t("dispatchAdmin.phone", "Phone (international format)")}<input required type="tel" autoComplete="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="mt-1 min-h-11 w-full rounded-lg border px-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700" /></label>
        <label className="text-sm font-semibold">{editing ? t("dispatchAdmin.resetPassword", "Temporary password reset (optional)") : t("dispatchAdmin.temporaryPassword", "Temporary password (12+ characters)")}<input required={!editing} minLength={12} type="password" autoComplete="new-password" value={form.temporaryPassword} onChange={(e) => setForm({ ...form, temporaryPassword: e.target.value })} className="mt-1 min-h-11 w-full rounded-lg border px-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700" /></label>
        <div className="flex items-end gap-2"><button disabled={busy} className="min-h-11 rounded-xl bg-drivo-navy px-4 font-bold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:opacity-50">{busy ? t("common.loading", "Loading") : t("common.save", "Save")}</button>{editing && <button type="button" onClick={() => { setEditing(null); setForm({ fullName: "", email: "", phone: "", temporaryPassword: "" }); }} className="min-h-11 rounded-xl border px-4">{t("common.cancel", "Cancel")}</button>}</div>
      </form>
    </section>
    <section className="rounded-2xl border bg-white p-5" aria-labelledby="operator-list-heading"><h2 id="operator-list-heading" className="text-lg font-bold">{t("dispatchAdmin.operators", "Operators")}</h2>{loading ? <p className="p-5">{t("common.loading", "Loading")}</p> : <div className="mt-3 overflow-x-auto"><table className="min-w-full text-left text-sm"><caption className="sr-only">{t("dispatchAdmin.operators", "Operators")}</caption><thead><tr className="border-b"><th className="p-2">{t("dispatchAdmin.name", "Full name")}</th><th className="p-2">{t("dispatchAdmin.email", "Email")}</th><th className="p-2">{t("dispatchAdmin.phone", "Phone")}</th><th className="p-2">{t("dispatchAdmin.status", "Status")}</th><th className="p-2">{t("dispatchAdmin.lastLogin", "Last login")}</th><th className="p-2">{t("dispatchAdmin.createdAt", "Created")}</th><th className="p-2">{t("dispatchAdmin.createdBy", "Created by admin")}</th><th className="p-2">{t("common.actions", "Actions")}</th></tr></thead><tbody>{operators.map((operator) => <tr key={operator.id} className="border-b align-top"><td className="p-2">{operator.fullName}</td><td className="p-2">{operator.email}</td><td className="p-2">{operator.phone}</td><td className="p-2"><span className={operator.status === "ACTIVE" ? "rounded-full bg-green-100 px-2 py-1 text-green-900" : "rounded-full bg-gray-200 px-2 py-1 text-gray-900"}>{t(`dispatchAdmin.${operator.status.toLowerCase()}`, operator.status)}{operator.mustChangePassword ? ` · ${t("dispatchAdmin.mustChange", "Password change required")}` : ""}</span></td><td className="p-2">{operator.lastLoginAt ? new Date(operator.lastLoginAt).toLocaleString(locale) : "—"}</td><td className="p-2">{new Date(operator.createdAt).toLocaleDateString(locale)}</td><td className="p-2">{operator.createdByAdminId || "—"}</td><td className="p-2"><div className="flex flex-wrap gap-2"><button type="button" disabled={busy} onClick={() => edit(operator)} className="min-h-10 rounded-lg border px-3">{t("common.edit", "Edit")}</button><button type="button" disabled={busy} onClick={() => void update(operator, { status: operator.status === "ACTIVE" ? "DISABLED" : "ACTIVE" })} className="min-h-10 rounded-lg border px-3">{operator.status === "ACTIVE" ? t("dispatchAdmin.disable", "Disable") : t("dispatchAdmin.enable", "Enable")}</button></div></td></tr>)}</tbody></table>{!operators.length && <p className="p-5 text-center text-gray-600">{t("dispatchAdmin.empty", "No operators yet.")}</p>}</div>}</section>
  </main>;
}
