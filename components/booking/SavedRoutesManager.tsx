"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { csrfFetch } from "@/lib/client/csrf-fetch";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { isCustomerServiceEnabled } from "@/lib/feature-flags";
import type { SavedRouteView } from "@/lib/saved-route-types";

type EditForm = Pick<SavedRouteView, "label" | "pickupAddress" | "dropoffAddress" | "passengerCount" | "smallBags" | "largeBags" | "serviceType" | "airline" | "waitAndGreet">;

export default function SavedRoutesManager() {
  const { t } = useLanguage();
  const [routes, setRoutes] = useState<SavedRouteView[]>([]);
  const [autoSave, setAutoSave] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<EditForm | null>(null);

  const reload = useCallback(async () => {
    try {
      const result = await csrfFetch("passenger", "/api/passenger/saved-routes", { cache: "no-store" });
      if (!result.ok) throw new Error("FETCH_FAILED");
      const data = await result.json();
      setRoutes(Array.isArray(data.routes) ? data.routes : []);
      setAutoSave(data.autoSaveRoutes === true);
      setNotice("");
    } catch { setNotice("savedRoutes.error"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void reload(); }, [reload]);

  const changeAutoSave = async (next: boolean) => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await csrfFetch("passenger", "/api/passenger/saved-routes/preferences", {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ autoSaveRoutes: next }),
      });
      if (!result.ok) throw new Error("SAVE_FAILED");
      setAutoSave(next);
      setNotice(next ? "savedRoutes.autoOn" : "savedRoutes.autoOff");
    } catch { setNotice("savedRoutes.error"); }
    finally { setBusy(false); }
  };

  const saveChanges = async () => {
    if (!form || !editing || busy) return;
    setBusy(true);
    try {
      const result = await csrfFetch("passenger", `/api/passenger/saved-routes/${editing}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
      });
      if (!result.ok) {
        const body = await result.json().catch(() => ({}));
        setNotice(body.code === "ROUTE_EXISTS" ? "savedRoutes.exists" : "savedRoutes.error");
        return;
      }
      setEditing(null);
      setForm(null);
      await reload();
      setNotice("savedRoutes.updated");
    } catch { setNotice("savedRoutes.error"); }
    finally { setBusy(false); }
  };

  const removeRoute = async (route: SavedRouteView) => {
    if (busy || !window.confirm(t("savedRoutes.confirmDelete"))) return;
    setBusy(true);
    try {
      const result = await csrfFetch("passenger", `/api/passenger/saved-routes/${route.id}`, { method: "DELETE" });
      if (!result.ok) throw new Error("DELETE_FAILED");
      setRoutes((current) => current.filter((item) => item.id !== route.id));
      if (editing === route.id) { setEditing(null); setForm(null); }
      setNotice("savedRoutes.deleted");
    } catch { setNotice("savedRoutes.error"); }
    finally { setBusy(false); }
  };

  return (
    <section className="card" aria-labelledby="saved-routes-heading">
      <h2 id="saved-routes-heading" className="mb-2 text-lg font-black text-drivo-text">{t("savedRoutes.title")}</h2>
      <p className="mb-4 text-sm text-drivo-text-secondary">{t("savedRoutes.description")}</p>
      <label className="mb-4 flex min-h-11 items-center gap-3 text-sm font-semibold text-drivo-text">
        <input type="checkbox" checked={autoSave} disabled={loading || busy} onChange={(e) => void changeAutoSave(e.target.checked)} className="h-5 w-5" />
        {t("savedRoutes.autoPreference")}
      </label>
      <p className="mb-4 text-xs text-drivo-text-secondary">{t("savedRoutes.privacyNotice")}</p>
      {notice && <p role="status" className="mb-3 rounded-xl bg-drivo-bg-soft p-3 text-sm">{t(notice)}</p>}
      {loading ? <p>{t("passenger.loading")}</p> : routes.length === 0 ? <p className="text-sm text-drivo-text-secondary">{t("savedRoutes.empty")}</p> : (
        <ul className="space-y-4">
          {routes.map((route) => (
            <li key={route.id} className="rounded-2xl border border-drivo-border-light p-4">
              <p className="font-bold text-drivo-text break-words">{route.label}</p>
              <p className="mt-1 text-sm text-drivo-text-secondary break-words">{route.pickupAddress} → {route.dropoffAddress}</p>
              <p className="mt-1 text-xs text-drivo-text-secondary">{t(`service.${route.serviceType}`)} · {route.passengerCount} {t("confirmation.passengers")}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {isCustomerServiceEnabled(route.serviceType) ? (
                  <Link href={`/book?savedRoute=${encodeURIComponent(route.id)}`} className="btn-primary min-h-11 justify-center">{t("savedRoutes.bookAgain")}</Link>
                ) : <span role="note" className="text-sm text-amber-800">{t("savedRoutes.unavailable")}</span>}
                <button type="button" className="btn-outline min-h-11" onClick={() => {
                  setEditing(route.id === editing ? null : route.id);
                  setForm({ label: route.label, pickupAddress: route.pickupAddress, dropoffAddress: route.dropoffAddress,
                    serviceType: route.serviceType, passengerCount: route.passengerCount, smallBags: route.smallBags,
                    largeBags: route.largeBags, airline: route.airline, waitAndGreet: route.waitAndGreet });
                }}>{t("savedRoutes.edit")}</button>
                <button type="button" disabled={busy} className="btn-outline min-h-11" onClick={() => void removeRoute(route)}>{t("savedRoutes.delete")}</button>
              </div>
              {editing === route.id && form && (
                <form className="mt-4 grid gap-3 border-t border-drivo-border-light pt-4" onSubmit={(e) => { e.preventDefault(); void saveChanges(); }}>
                  <label className="grid gap-1 text-sm font-semibold">{t("savedRoutes.routeName")}
                    <input className="input" maxLength={80} required value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} /></label>
                  <label className="grid gap-1 text-sm font-semibold">{t("confirmation.from")}
                    <input className="input" maxLength={240} minLength={3} required value={form.pickupAddress} onChange={(e) => setForm({ ...form, pickupAddress: e.target.value })} /></label>
                  <label className="grid gap-1 text-sm font-semibold">{t("confirmation.to")}
                    <input className="input" maxLength={240} minLength={3} required value={form.dropoffAddress} onChange={(e) => setForm({ ...form, dropoffAddress: e.target.value })} /></label>
                  <label className="grid gap-1 text-sm font-semibold">{t("confirmation.service")}
                    <select className="input" value={form.serviceType} onChange={(e) => setForm({ ...form, serviceType: e.target.value })}>
                      {["STANDARD", "ACCESSIBLE", "SENIOR", "AIRPORT", "CHILDREN"].filter(isCustomerServiceEnabled).map((service) => <option value={service} key={service}>{t(`service.${service}`)}</option>)}
                    </select></label>
                  <label className="grid gap-1 text-sm font-semibold">{t("confirmation.passengers")}
                    <input className="input" type="number" min={1} max={6} step={1} required value={form.passengerCount} onChange={(e) => setForm({ ...form, passengerCount: Number(e.target.value) })} /></label>
                  {form.serviceType !== "CHILDREN" && <>
                    <label className="grid gap-1 text-sm font-semibold">{t("savedRoutes.smallBags")}
                      <input className="input" type="number" min={0} max={12} step={1} value={form.smallBags} onChange={(e) => setForm({ ...form, smallBags: Number(e.target.value) })} /></label>
                    <label className="grid gap-1 text-sm font-semibold">{t("savedRoutes.largeBags")}
                      <input className="input" type="number" min={0} max={12} step={1} value={form.largeBags} onChange={(e) => setForm({ ...form, largeBags: Number(e.target.value) })} /></label>
                  </>}
                  {form.serviceType === "AIRPORT" && <>
                    <label className="grid gap-1 text-sm font-semibold">{t("booking.airline")}
                      <input className="input" maxLength={80} value={form.airline ?? ""} onChange={(e) => setForm({ ...form, airline: e.target.value })} /></label>
                    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.waitAndGreet} onChange={(e) => setForm({ ...form, waitAndGreet: e.target.checked })} />{t("booking.waitAndGreet")}</label>
                  </>}
                  <div className="flex flex-wrap gap-2">
                    <button type="submit" disabled={busy} className="btn-primary min-h-11">{t("savedRoutes.saveChanges")}</button>
                    <button type="button" className="btn-outline min-h-11" onClick={() => { setEditing(null); setForm(null); }}>{t("savedRoutes.cancel")}</button>
                  </div>
                  <p className="text-xs text-drivo-text-secondary">{t("savedRoutes.reviewWarning")}</p>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
