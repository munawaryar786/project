"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { io } from "socket.io-client";
import { csrfFetch } from "@/lib/client/csrf-fetch";
import { useLanguage } from "@/lib/i18n/LanguageContext";

type AnyRecord = Record<string, any>;

function requestId(prefix: string) {
  const id = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2);
  return prefix + "-" + id;
}

function dateLabel(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString() : "—";
}

export default function AdminOperationsPage() {
  const { t } = useLanguage();
  const [overview, setOverview] = useState<AnyRecord | null>(null);
  const [rides, setRides] = useState<AnyRecord[]>([]);
  const [drivers, setDrivers] = useState<AnyRecord[]>([]);
  const [scheduled, setScheduled] = useState<AnyRecord[]>([]);
  const [audit, setAudit] = useState<AnyRecord[]>([]);
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
      if (!overviewRes.ok || !ridesRes.ok || !driversRes.ok || !scheduledRes.ok || !auditRes.ok) throw new Error("Operations data unavailable");
      setOverview(bodies[0].overview);
      setRides(bodies[1].entries || []);
      setDrivers(bodies[2].entries || []);
      setScheduled(bodies[3].entries || []);
      setAudit(bodies[4].entries || []);
      setError("");
    } catch (e: any) {
      setError(e?.message || "Operations data unavailable");
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
    if (reason.trim().length < 3) { setActionError("Enter an operational reason before changing ride state."); return; }
    setBusyAction(kind); setActionError("");
    try {
      const response = await csrfFetch("admin", url, { method: "POST", body: JSON.stringify({ ...body, reason: reason.trim(), requestId: requestId(kind) }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || data.code || "Action rejected");
      setReason("");
      await load();
    } catch (e: any) { setActionError(e?.message || "Action rejected"); }
    finally { setBusyAction(""); }
  };

  const cards = useMemo(() => {
    const counts = overview?.counts || {};
    return [
      ["Active rides", counts.activeRides, "bg-emerald-50 text-emerald-800"],
      ["Unassigned immediate", counts.unassignedImmediate, "bg-amber-50 text-amber-800"],
      ["Dispatch attention", counts.exhausted, "bg-red-50 text-red-800"],
      ["Online drivers", counts.onlineDrivers, "bg-sky-50 text-sky-800"],
      ["Available drivers", counts.availableDrivers, "bg-indigo-50 text-indigo-800"],
      ["Failed outbox", counts.failedOutbox, "bg-red-50 text-red-800"],
    ];
  }, [overview]);

  return <main className="space-y-6 p-4 sm:p-6 lg:p-8" aria-labelledby="operations-heading">
    <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
      <div><p className="text-xs font-bold uppercase tracking-[0.2em] text-drivo-teal">Admin operations</p><h1 id="operations-heading" className="text-3xl font-black text-drivo-navy">{t("adminOperations.title", "Operations Control Center")}</h1><p className="mt-1 text-sm text-gray-600">Authoritative ride, driver, scheduled, alert, audit, and read-only ledger support.</p></div>
      <button type="button" onClick={() => void load()} className="min-h-11 rounded-xl bg-drivo-navy px-4 py-2 text-sm font-bold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-drivo-teal">Refresh</button>
    </div>
    {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {actionError && <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{actionError}</p>}
    <section aria-labelledby="overview-heading"><h2 id="overview-heading" className="sr-only">Operational overview</h2><div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">{cards.map(([label, value, style]) => <div key={String(label)} className={"rounded-2xl p-4 " + style}><div className="text-xs font-bold">{label}</div><div className="mt-2 text-2xl font-black">{loading ? "…" : String(value ?? 0)}</div></div>)}</div></section>
    <section className="rounded-2xl border border-gray-200 bg-white p-4" aria-labelledby="action-heading"><h2 id="action-heading" className="text-lg font-black text-drivo-navy">Safe operational actions</h2><p className="mt-1 text-xs text-gray-600">Actions are state-validated, transactional where required, and recorded in the immutable admin audit trail.</p><div className="mt-3 grid gap-3 md:grid-cols-3"><label className="text-sm font-semibold text-gray-700">Operational reason<input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} className="mt-1 min-h-11 w-full rounded-xl border border-gray-300 px-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-drivo-teal" placeholder="Why is this action needed?" /></label><label className="text-sm font-semibold text-gray-700">Booking ID<input value={assignBookingId} onChange={(e) => setAssignBookingId(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-gray-300 px-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-drivo-teal" placeholder="24-character booking id" /></label><label className="text-sm font-semibold text-gray-700">Driver ID<input value={assignDriverId} onChange={(e) => setAssignDriverId(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-gray-300 px-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-drivo-teal" placeholder="24-character driver id" /></label></div><div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={Boolean(busyAction) || !assignBookingId || !assignDriverId} onClick={() => void doAction("assign", "/api/admin/operations/assign", { bookingId: assignBookingId, driverId: assignDriverId })} className="min-h-11 rounded-xl bg-drivo-teal px-4 py-2 text-sm font-bold text-white disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-drivo-navy">{busyAction === "assign" ? "Assigning…" : "Assign driver"}</button><p className="self-center text-xs text-gray-500">Dispatch retry and scheduled release are available on eligible ride rows below.</p></div></section>
    <section className="rounded-2xl border border-gray-200 bg-white p-4" aria-labelledby="rides-heading"><div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between"><div><h2 id="rides-heading" className="text-xl font-black text-drivo-navy">Ride operations</h2><p className="text-xs text-gray-500">Server-filtered, bounded operational records. Passenger medical/child details are omitted.</p></div><div className="flex flex-wrap gap-2"><label className="text-xs font-bold text-gray-600">Search<input value={search} onChange={(e) => setSearch(e.target.value.slice(0, 80))} className="ml-2 min-h-10 rounded-lg border border-gray-300 px-2" /></label><label className="text-xs font-bold text-gray-600">Status<select value={status} onChange={(e) => setStatus(e.target.value)} className="ml-2 min-h-10 rounded-lg border border-gray-300 px-2"><option value="">All</option><option>PENDING</option><option>CONFIRMED</option><option>ASSIGNED</option><option>DRIVER_ENROUTE</option><option>ARRIVED</option><option>IN_PROGRESS</option><option>COMPLETED</option><option>CANCELLED</option></select></label></div></div><div className="mt-4 overflow-x-auto"><table className="min-w-full text-left text-sm"><caption className="sr-only">Ride operations</caption><thead><tr className="border-b text-xs uppercase text-gray-500"><th className="p-2">Booking</th><th className="p-2">Service/status</th><th className="p-2">Pickup</th><th className="p-2">Driver</th><th className="p-2">Actions</th></tr></thead><tbody>{rides.map((ride) => <tr key={ride.id} className="border-b align-top"><td className="p-2 font-mono text-xs">{ride.bookingRef}<div className="mt-1 text-[11px] text-gray-500">{ride.scheduledRide ? "Scheduled" : "Immediate"} · {ride.dispatchStatus || "NOT_STARTED"}</div></td><td className="p-2"><div className="font-bold">{ride.serviceType}</div><div>{ride.status}</div><div className="mt-1 text-xs text-gray-500">{ride.rideRequests?.length || 0} active offers</div></td><td className="p-2 text-xs">{dateLabel(ride.pickupAt)}<div>{ride.marketTimezone || "Market timezone unset"}</div></td><td className="p-2">{ride.driver?.fullName || "Unassigned"}<div className="text-xs text-gray-500">{ride.driver?.vehicle?.type || "Vehicle pending"}</div></td><td className="p-2"><div className="flex flex-wrap gap-2">{!ride.driverId && <button type="button" disabled={Boolean(busyAction)} onClick={() => void doAction("retry-" + ride.id, "/api/admin/operations/dispatch/retry", { bookingId: ride.id })} className="min-h-10 rounded-lg border border-drivo-teal px-2 text-xs font-bold disabled:opacity-50">Retry dispatch</button>}{ride.scheduledRide && ride.driverId && ["PENDING", "CONFIRMED", "SEARCHING_DRIVER"].includes(ride.status) && <button type="button" disabled={Boolean(busyAction)} onClick={() => void doAction("release-" + ride.id, "/api/admin/operations/release", { bookingId: ride.id })} className="min-h-10 rounded-lg border border-amber-500 px-2 text-xs font-bold disabled:opacity-50">Release scheduled</button>}</div></td></tr>)}</tbody></table>{!rides.length && <p className="p-6 text-center text-sm text-gray-500">No rides match the current filters.</p>}</div></section>
    <div className="grid gap-6 xl:grid-cols-2"><section className="rounded-2xl border border-gray-200 bg-white p-4" aria-labelledby="drivers-heading"><h2 id="drivers-heading" className="text-xl font-black text-drivo-navy">Driver operations</h2><div className="mt-3 space-y-2">{drivers.map((driver) => <div key={driver.id} className="rounded-xl border border-gray-100 p-3"><div className="flex items-center justify-between gap-2"><span className="font-bold">{driver.fullName}</span><span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-bold">{driver.presenceState}</span></div><div className="mt-1 text-xs text-gray-600">{driver.vehicle?.type || driver.vehicleType || "Vehicle pending"} · {driver.locationFresh ? "location fresh" : "location stale/unavailable"} · active booking {driver.activeBooking?.bookingRef || "none"}</div></div>)}</div></section><section className="rounded-2xl border border-gray-200 bg-white p-4" aria-labelledby="scheduled-heading"><h2 id="scheduled-heading" className="text-xl font-black text-drivo-navy">Scheduled operations</h2><div className="mt-3 space-y-2">{scheduled.map((ride) => <div key={ride.id} className="rounded-xl border border-gray-100 p-3"><div className="flex items-center justify-between gap-2"><span className="font-bold">{ride.bookingRef}</span><span className="text-xs font-bold">{ride.dispatchStatus || ride.status}</span></div><div className="mt-1 text-xs text-gray-600">{dateLabel(ride.pickupAt)} · {ride.driver?.fullName || "Unclaimed"} · {ride.marketTimezone || "Market timezone unset"}</div></div>)}</div></section></div>
    <section className="rounded-2xl border border-gray-200 bg-white p-4" aria-labelledby="audit-heading"><h2 id="audit-heading" className="text-xl font-black text-drivo-navy">Admin audit history</h2><div className="mt-3 overflow-x-auto"><table className="min-w-full text-left text-sm"><caption className="sr-only">Immutable admin audit history</caption><thead><tr className="border-b text-xs uppercase text-gray-500"><th className="p-2">Action</th><th className="p-2">Target</th><th className="p-2">Reason</th><th className="p-2">When</th></tr></thead><tbody>{audit.map((entry) => <tr key={entry.id} className="border-b"><td className="p-2 font-bold">{entry.action}</td><td className="p-2">{entry.targetType} · {entry.targetId}</td><td className="p-2">{entry.reason}</td><td className="p-2 text-xs text-gray-500">{dateLabel(entry.createdAt)}</td></tr>)}</tbody></table>{!audit.length && <p className="p-4 text-sm text-gray-500">No Phase 3H actions recorded.</p>}</div></section>
  </main>;
}
