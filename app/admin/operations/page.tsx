"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { io } from "socket.io-client";
import { csrfFetch } from "@/lib/client/csrf-fetch";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { formatMarketDateTime, formatNumber } from "@/lib/i18n/format";
import { presentMessage } from "@/lib/i18n/message-catalog";
import { presentStatus } from "@/lib/i18n/status-catalog";
import { presentNotification } from "@/lib/i18n/notification-catalog";

type AnyRecord = Record<string, any>;

function requestId(prefix: string) {
  const id = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2);
  return prefix + "-" + id;
}

export default function AdminOperationsPage() {
  const { t, locale } = useLanguage();
  const dateLabel = (value: string | null | undefined) => value ? formatMarketDateTime(value, locale) : "—";
  const bookingStatus = (value: unknown) => presentStatus("booking", value, locale);
  const dispatchStatus = (value: unknown) => presentStatus("dispatch", value, locale);
  const [overview, setOverview] = useState<AnyRecord | null>(null);
  const [rides, setRides] = useState<AnyRecord[]>([]);
  const [drivers, setDrivers] = useState<AnyRecord[]>([]);
  const [scheduled, setScheduled] = useState<AnyRecord[]>([]);
  const [audit, setAudit] = useState<AnyRecord[]>([]);
  const [notifications, setNotifications] = useState<Array<{ id: string; type: string; readAt: string | null }>>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [reason, setReason] = useState("");
  const [assignDriverId, setAssignDriverId] = useState("");
  const [assignBookingId, setAssignBookingId] = useState("");
  const [busyAction, setBusyAction] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams({ limit: "25" });
      if (search.trim()) query.set("search", search.trim());
      if (status) query.set("status", status);
      const [overviewRes, ridesRes, driversRes, scheduledRes, auditRes] = await Promise.all([
        csrfFetch("admin", "/api/admin/operations/overview", { cache: "no-store" }),
        csrfFetch("admin", "/api/admin/operations/rides?" + query.toString(), { cache: "no-store" }),
        csrfFetch("admin", "/api/admin/operations/drivers?limit=25", { cache: "no-store" }),
        csrfFetch("admin", "/api/admin/operations/scheduled?limit=25", { cache: "no-store" }),
        csrfFetch("admin", "/api/admin/operations/audit?limit=20", { cache: "no-store" }),
      ]);
      const bodies = await Promise.all([overviewRes.json(), ridesRes.json(), driversRes.json(), scheduledRes.json(), auditRes.json()]);
      if (!overviewRes.ok || !ridesRes.ok || !driversRes.ok || !scheduledRes.ok || !auditRes.ok) throw new Error("LOAD_FAILED");
      setOverview(bodies[0].overview);
      setRides(bodies[1].entries || []);
      setDrivers(bodies[2].entries || []);
      setScheduled(bodies[3].entries || []);
      setAudit(bodies[4].entries || []);
      try {
        const noticeResponse = await csrfFetch("admin", "/api/admin/notifications?limit=8", { cache: "no-store" });
        if (noticeResponse.ok) {
          const noticeBody = await noticeResponse.json();
          setNotifications(Array.isArray(noticeBody.notifications) ? noticeBody.notifications.filter((item: AnyRecord) => !item.readAt) : []);
        }
      } catch { /* Notification failure must not hide the operational overview. */ }
      setError("");
    } catch {
      setError("LOAD_FAILED");
    } finally {
      setLoading(false);
    }
  }, [search, status]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const socket = io("/admin", { path: "/socket.io", transports: ["websocket"], withCredentials: true, reconnection: true });
    const invalidate = () => { if (timer) clearTimeout(timer); timer = setTimeout(() => void load(), 700); };
    ["dispatch.updated", "booking.updated", "trip.updated", "notification.created"].forEach((event) => socket.on(event, invalidate));
    return () => { if (timer) clearTimeout(timer); socket.close(); };
  }, [load]);

  const doAction = async (kind: string, url: string, body: AnyRecord) => {
    if (reason.trim().length < 3) { setActionError("REASON_REQUIRED"); return; }
    setBusyAction(kind); setActionError("");
    try {
      const response = await csrfFetch("admin", url, { method: "POST", body: JSON.stringify({ ...body, reason: reason.trim(), requestId: requestId(kind) }) });
      const data = await response.json();
      if (!response.ok) throw new Error(typeof data.code === "string" ? data.code : "ACTION_REJECTED");
      setReason("");
      await load();
    } catch (e: any) { setActionError(e?.message || "ACTION_REJECTED"); }
    finally { setBusyAction(""); }
  };

  const cards = useMemo(() => {
    const counts = overview?.counts || {};
    return [
      [t("m4.operations.activeRides"), counts.activeRides, "bg-emerald-50 text-emerald-800"],
      [t("m4.operations.unassigned"), counts.unassignedImmediate, "bg-amber-50 text-amber-800"],
      [t("m4.operations.attention"), counts.exhausted, "bg-red-50 text-red-800"],
      [t("m4.operations.onlineDrivers"), counts.onlineDrivers, "bg-sky-50 text-sky-800"],
      [t("m4.operations.availableDrivers"), counts.availableDrivers, "bg-indigo-50 text-indigo-800"],
      [t("m4.operations.failedOutbox"), counts.failedOutbox, "bg-red-50 text-red-800"],
      [t("adminOperations.paymentReview", "Payments needing review"), counts.paymentReview, "bg-red-50 text-red-800"],
    ];
  }, [overview, t]);

  return <main className="space-y-6 p-4 sm:p-6 lg:p-8" aria-labelledby="operations-heading">
    {notifications.length > 0 && <section aria-labelledby="admin-notifications-heading" className="rounded-2xl border border-amber-200 bg-white p-4"><h2 id="admin-notifications-heading" className="text-lg font-black text-drivo-navy">{t("m5.notifications.title")}</h2><ul className="mt-3 space-y-2">{notifications.map((notice) => <li key={notice.id} className="rounded-xl bg-amber-50 p-3 text-sm text-amber-950">{presentNotification(notice.type, locale)}</li>)}</ul></section>}
    <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
      <div><p className="text-xs font-bold uppercase tracking-[0.2em] text-drivo-teal">{t("admin.operations")}</p><h1 id="operations-heading" className="text-3xl font-black text-drivo-navy">{t("adminOperations.title", "Operations Control Center")}</h1><p className="mt-1 text-sm text-gray-600">{t("m4.operations.intro")}</p></div>
      <button type="button" onClick={() => void load()} className="min-h-11 rounded-xl bg-drivo-navy px-4 py-2 text-sm font-bold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-drivo-teal">{t("m4.tracking.refresh")}</button>
    </div>
    {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{t("m4.operations.loadFailed")}</p>}
    {actionError && <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{actionError === "REASON_REQUIRED" ? t("m4.operations.reasonRequired") : actionError === "ACTION_REJECTED" ? t("m4.operations.actionRejected") : presentMessage(actionError, locale)}</p>}
    <section aria-labelledby="overview-heading"><h2 id="overview-heading" className="sr-only">{t("m4.operations.overview")}</h2><div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">{cards.map(([label, value, style]) => <div key={String(label)} className={"rounded-2xl p-4 " + style}><div className="text-xs font-bold">{label}</div><div className="mt-2 text-2xl font-black">{loading ? "…" : formatNumber(Number(value ?? 0), locale)}</div></div>)}</div></section>
    {Boolean(overview?.counts?.paymentReview) && <section aria-labelledby="payment-review-heading" className="rounded-2xl border border-red-300 bg-white p-4"><h2 id="payment-review-heading" className="text-lg font-black text-drivo-navy">{t("adminOperations.paymentReview", "Payments needing review")}</h2><p className="mt-1 text-sm text-gray-700">{t("adminOperations.paymentReviewHelp", "Verify the provider outcome before creating another payment link or changing a booking.")}</p><div className="mt-3 space-y-2">{(overview?.paymentReviewItems || []).map((item: AnyRecord) => <div key={item.id} className="rounded-xl border border-red-200 p-3 text-sm"><strong>{item.bookingRef}</strong><span className="ml-2">{t(`m4.operations.channel.${item.channel}`, t("m4.common.unknownState"))} - {t(`m4.operations.review.${item.reconciliationCode || "PROVIDER_OUTCOME_UNRESOLVED"}`, t("m4.common.unknownState"))}</span><time className="ml-2 text-gray-600" dateTime={item.createdAt}>{dateLabel(item.createdAt)}</time></div>)}</div></section>}
    <section className="rounded-2xl border border-gray-200 bg-white p-4" aria-labelledby="action-heading"><h2 id="action-heading" className="text-lg font-black text-drivo-navy">{t("m4.operations.actions")}</h2><p className="mt-1 text-xs text-gray-600">{t("m4.operations.actionsHelp")}</p><div className="mt-3 grid gap-3 md:grid-cols-3"><label className="text-sm font-semibold text-gray-700">{t("m4.operations.reason")}<input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} className="mt-1 min-h-11 w-full rounded-xl border border-gray-300 px-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-drivo-teal" placeholder={t("m4.operations.reasonPlaceholder")} /></label><label className="text-sm font-semibold text-gray-700">{t("m4.operations.bookingId")}<input value={assignBookingId} onChange={(e) => setAssignBookingId(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-gray-300 px-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-drivo-teal" placeholder={t("m4.operations.idPlaceholder")} /></label><label className="text-sm font-semibold text-gray-700">{t("m4.operations.driverId")}<input value={assignDriverId} onChange={(e) => setAssignDriverId(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-gray-300 px-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-drivo-teal" placeholder={t("m4.operations.idPlaceholder")} /></label></div><div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={Boolean(busyAction) || !assignBookingId || !assignDriverId} onClick={() => void doAction("assign", "/api/admin/operations/assign", { bookingId: assignBookingId, driverId: assignDriverId })} className="min-h-11 rounded-xl bg-drivo-teal px-4 py-2 text-sm font-bold text-white disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-drivo-navy">{busyAction === "assign" ? t("m4.operations.assigning") : t("m4.operations.assign")}</button><p className="self-center text-xs text-gray-500">{t("m4.operations.rowActionsHelp")}</p></div></section>
    <section className="rounded-2xl border border-gray-200 bg-white p-4" aria-labelledby="rides-heading"><div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between"><div><h2 id="rides-heading" className="text-xl font-black text-drivo-navy">{t("m4.operations.rides")}</h2><p className="text-xs text-gray-500">{t("m4.operations.ridesHelp")}</p></div><div className="flex flex-wrap gap-2"><label className="text-xs font-bold text-gray-600">{t("m4.operations.search")}<input value={search} onChange={(e) => setSearch(e.target.value.slice(0, 80))} className="ml-2 min-h-10 rounded-lg border border-gray-300 px-2" /></label><label className="text-xs font-bold text-gray-600">{t("m4.operations.status")}<select value={status} onChange={(e) => setStatus(e.target.value)} className="ml-2 min-h-10 rounded-lg border border-gray-300 px-2"><option value="">{t("m4.operations.all")}</option><option value="PENDING">{bookingStatus("PENDING")}</option><option value="CONFIRMED">{bookingStatus("CONFIRMED")}</option><option value="ASSIGNED">{bookingStatus("ASSIGNED")}</option><option value="DRIVER_ENROUTE">{bookingStatus("DRIVER_ENROUTE")}</option><option value="ARRIVED">{bookingStatus("ARRIVED")}</option><option value="IN_PROGRESS">{bookingStatus("IN_PROGRESS")}</option><option value="COMPLETED">{bookingStatus("COMPLETED")}</option><option value="CANCELLED">{bookingStatus("CANCELLED")}</option></select></label></div></div><div className="mt-4 overflow-x-auto"><table className="min-w-full text-left text-sm"><caption className="sr-only">{t("m4.operations.rides")}</caption><thead><tr className="border-b text-xs uppercase text-gray-500"><th className="p-2">{t("m4.operations.booking")}</th><th className="p-2">{t("m4.operations.serviceStatus")}</th><th className="p-2">{t("m4.operations.pickup")}</th><th className="p-2">{t("m4.operations.driver")}</th><th className="p-2">{t("m4.operations.actionsColumn")}</th></tr></thead><tbody>{rides.map((ride) => <tr key={ride.id} className="border-b align-top"><td className="p-2 font-mono text-xs">{ride.bookingRef}<div className="mt-1 text-[11px] text-gray-500">{ride.scheduledRide ? t("m4.common.scheduled") : t("m4.common.immediate")} · {dispatchStatus(ride.dispatchStatus || "NOT_STARTED")}</div></td><td className="p-2"><div className="font-bold">{t(`service.${ride.serviceType}`, t("m4.common.unknownState"))}</div><div>{bookingStatus(ride.status)}</div><div className="mt-1 text-xs text-gray-500">{t("m4.operations.activeOffers").replace("{count}", formatNumber(ride.rideRequests?.length || 0, locale))}</div></td><td className="p-2 text-xs">{dateLabel(ride.pickupAt)}<div>{ride.marketTimezone || t("m4.operations.marketTimezoneMissing")}</div></td><td className="p-2">{ride.driver?.fullName || t("m4.common.unassigned")}<div className="text-xs text-gray-500">{ride.driver?.vehicle?.type ? t(`m4.vehicleType.${ride.driver.vehicle.type}`, t("m4.common.unknownState")) : t("m4.common.vehiclePending")}</div></td><td className="p-2"><div className="flex flex-wrap gap-2">{!ride.driverId && <button type="button" disabled={Boolean(busyAction)} onClick={() => void doAction("retry-" + ride.id, "/api/admin/operations/dispatch/retry", { bookingId: ride.id })} className="min-h-10 rounded-lg border border-drivo-teal px-2 text-xs font-bold disabled:opacity-50">{t("m4.operations.retry")}</button>}{ride.scheduledRide && ride.driverId && ["PENDING", "CONFIRMED", "SEARCHING_DRIVER"].includes(ride.status) && <button type="button" disabled={Boolean(busyAction)} onClick={() => void doAction("release-" + ride.id, "/api/admin/operations/release", { bookingId: ride.id })} className="min-h-10 rounded-lg border border-amber-500 px-2 text-xs font-bold disabled:opacity-50">{t("m4.operations.release")}</button>}</div></td></tr>)}</tbody></table>{!rides.length && <p className="p-6 text-center text-sm text-gray-500">{t("m4.operations.noRides")}</p>}</div></section>
    <div className="grid gap-6 xl:grid-cols-2"><section className="rounded-2xl border border-gray-200 bg-white p-4" aria-labelledby="drivers-heading"><h2 id="drivers-heading" className="text-xl font-black text-drivo-navy">{t("m4.operations.drivers")}</h2><div className="mt-3 space-y-2">{drivers.map((driver) => <div key={driver.id} className="rounded-xl border border-gray-100 p-3"><div className="flex items-center justify-between gap-2"><span className="font-bold">{driver.fullName}</span><span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-bold">{t(`m4.presence.${driver.presenceState}`, t("m4.common.unknownState"))}</span></div><div className="mt-1 text-xs text-gray-600">{driver.vehicle?.type || driver.vehicleType ? t(`m4.vehicleType.${driver.vehicle?.type || driver.vehicleType}`, t("m4.common.unknownState")) : t("m4.common.vehiclePending")} · {driver.locationFresh ? t("m4.operations.locationFresh") : t("m4.operations.locationStale")} · {t("m4.operations.activeBooking")} {driver.activeBooking?.bookingRef || t("m4.operations.none")}</div></div>)}</div></section><section className="rounded-2xl border border-gray-200 bg-white p-4" aria-labelledby="scheduled-heading"><h2 id="scheduled-heading" className="text-xl font-black text-drivo-navy">{t("m4.operations.scheduled")}</h2><div className="mt-3 space-y-2">{scheduled.map((ride) => <div key={ride.id} className="rounded-xl border border-gray-100 p-3"><div className="flex items-center justify-between gap-2"><span className="font-bold">{ride.bookingRef}</span><span className="text-xs font-bold">{ride.dispatchStatus ? dispatchStatus(ride.dispatchStatus) : bookingStatus(ride.status)}</span></div><div className="mt-1 text-xs text-gray-600">{dateLabel(ride.pickupAt)} · {ride.driver?.fullName || t("m4.operations.unclaimed")} · {ride.marketTimezone || t("m4.operations.marketTimezoneMissing")}</div></div>)}</div></section></div>
    <section className="rounded-2xl border border-gray-200 bg-white p-4" aria-labelledby="audit-heading"><h2 id="audit-heading" className="text-xl font-black text-drivo-navy">{t("m4.operations.audit")}</h2><div className="mt-3 overflow-x-auto"><table className="min-w-full text-left text-sm"><caption className="sr-only">{t("m4.operations.immutableAudit")}</caption><thead><tr className="border-b text-xs uppercase text-gray-500"><th className="p-2">{t("m4.operations.action")}</th><th className="p-2">{t("m4.operations.target")}</th><th className="p-2">{t("m4.operations.reason")}</th><th className="p-2">{t("m4.operations.when")}</th></tr></thead><tbody>{audit.map((entry) => <tr key={entry.id} className="border-b"><td className="p-2 font-bold">{t(`m4.audit.action.${entry.action}`, t("m4.common.unknownState"))}</td><td className="p-2">{t(`m4.audit.target.${entry.targetType}`, t("m4.common.unknownState"))} · {entry.targetId}</td><td className="p-2">{entry.reason}</td><td className="p-2 text-xs text-gray-500">{dateLabel(entry.createdAt)}</td></tr>)}</tbody></table>{!audit.length && <p className="p-4 text-sm text-gray-500">{t("m4.operations.noAudit")}</p>}</div></section>
  </main>;
}
