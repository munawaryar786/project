"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { csrfFetch } from "@/lib/client/csrf-fetch";
import { useLanguage } from "@/lib/i18n/LanguageContext";

type Booking = { id: string; bookingRef: string; status: string; dispatchStatus?: string | null; serviceType: string; customerName: string; customerPhone: string; pickupAddress: string; dropoffAddress: string; scheduledDate: string; scheduledTime: string; scheduledRide: boolean; paymentMethod: string; estimatedPrice: number | null; createdAt: string; payment?: { status: string } };

export default function DispatchDeskPage() {
  const { t, locale } = useLanguage();
  const [rows, setRows] = useState<Booking[]>([]);
  const [myRecent, setMyRecent] = useState<Booking[]>([]);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const pageRef = useRef(0);
  const generationRef = useRef(0);

  const load = useCallback(async (reset = true, q = search, nextStatus = status) => {
    const generation = reset ? ++generationRef.current : generationRef.current;
    if (reset) pageRef.current = 0;
    const requestedPage = reset ? 0 : pageRef.current + 1;
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ page: String(requestedPage) });
    if (q) params.set("q", q);
    if (nextStatus) params.set("status", nextStatus);
    try {
      const response = await csrfFetch("dispatch_operator", `/api/dispatch/bookings?${params}`, { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not load bookings");
      if (generation !== generationRef.current) return;
      const nextRows = (data.bookings || []) as Booking[];
      setRows((prior) => {
        if (reset) return nextRows;
        const ids = new Set(prior.map((item) => item.id));
        return [...prior, ...nextRows.filter((item) => !ids.has(item.id))];
      });
      pageRef.current = requestedPage;
      setHasMore(Boolean(data.hasMore));
    } catch {
      if (generation === generationRef.current) setError(t("dispatch.loadError", "Could not load phone bookings."));
    } finally {
      if (generation === generationRef.current) setLoading(false);
    }
  }, [search, status, t]);

  const loadMyRecent = useCallback(async () => {
    try {
      const response = await csrfFetch("dispatch_operator", "/api/dispatch/bookings?mine=true&page=0", { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (response.ok) setMyRecent((data.bookings || []).slice(0, 10));
    } catch {
      // Keep the operational list available if the separate personal list refresh fails.
    }
  }, []);

  useEffect(() => {
    void load(true, search, status);
    void loadMyRecent();
    const timer = setInterval(() => {
      void load(true, search, status);
      void loadMyRecent();
    }, 60_000);
    return () => clearInterval(timer);
  }, [load, loadMyRecent, search, status]);

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    setSearch(query.trim());
  }

  function money(value: number | null) {
    return new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" }).format(value || 0);
  }

  function paymentLabel(booking: Booking) {
    if (booking.paymentMethod === "CASH") return t("dispatch.payOnRide", "Pay on Ride");
    if (booking.paymentMethod === "INVOICE") return t("dispatch.invoice", "Invoice");
    const paymentStatus = booking.payment?.status || "PENDING";
    return t(`dispatch.payment.${paymentStatus}`, paymentStatus.replaceAll("_", " "));
  }

  const pending = rows.filter((item) => item.paymentMethod === "CARD" && item.status === "PENDING");
  const scheduled = rows.filter((item) => item.scheduledRide);
  const active = rows.filter((item) => !["COMPLETED", "CANCELLED", "NO_SHOW"].includes(item.status));
  const sections: [string, Booking[]][] = [
    [t("dispatch.paymentPending", "Payment Pending"), pending],
    [t("dispatch.activeBookings", "Active Bookings"), active],
    [t("dispatch.scheduledBookings", "Scheduled Bookings"), scheduled],
    [t("dispatch.recentBookings", "My Recent Bookings"), myRecent],
  ];

  return <div className="space-y-6" aria-labelledby="dispatch-heading">
    <header className="flex flex-wrap items-end justify-between gap-4"><div><h1 id="dispatch-heading" className="text-3xl font-black text-drivo-navy">{t("dispatch.desk", "Drivo Dispatch Desk")}</h1><p className="mt-1 text-sm text-slate-600">{t("dispatch.subtitle", "Phone bookings and operational status")}</p></div><Link href="/dispatch/bookings/new" className="inline-flex min-h-12 items-center rounded-xl bg-drivo-navy px-5 font-bold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700">+ {t("dispatch.newBooking", "New Phone Booking")}</Link></header>
    <section className="rounded-2xl border bg-white p-4" aria-label={t("dispatch.search", "Search bookings")}><form className="flex flex-wrap gap-3" onSubmit={submitSearch}><label className="min-w-56 flex-1 text-sm font-semibold">{t("dispatch.searchRefPhone", "Booking reference or customer phone")}<input value={query} onChange={(event) => setQuery(event.target.value)} maxLength={120} className="mt-1 min-h-12 w-full rounded-lg border px-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-700" /></label><label className="text-sm font-semibold">{t("dispatch.status", "Booking status")}<select value={status} onChange={(event) => setStatus(event.target.value)} className="mt-1 min-h-12 rounded-lg border bg-white px-3"><option value="">{t("dispatch.allStatuses", "All statuses")}</option>{["PENDING", "CONFIRMED", "SEARCHING_DRIVER", "ASSIGNED", "DRIVER_ENROUTE", "ARRIVED", "IN_PROGRESS", "COMPLETED", "CANCELLED"].map((value) => <option key={value} value={value}>{t(`dispatch.status.${value}`, value.replaceAll("_", " "))}</option>)}</select></label><button className="min-h-12 self-end rounded-xl border px-5 font-bold">{t("dispatch.search", "Search")}</button></form></section>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-900">{error}</p>}
    {sections.map(([heading, bookings], index) => <section key={heading} className="rounded-2xl border bg-white p-4" aria-labelledby={`dispatch-section-${index}`}><h2 id={`dispatch-section-${index}`} className="text-xl font-black">{heading}</h2><div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{bookings.map((booking) => <Link key={booking.id} href={`/dispatch/bookings/${booking.id}`} className="rounded-xl border p-4 hover:border-teal-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-700"><div className="flex items-start justify-between gap-2"><span className="font-mono font-bold">{booking.bookingRef}</span><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold">{t(`dispatch.status.${booking.status}`, booking.status.replaceAll("_", " "))}</span></div><p className="mt-2 font-semibold">{booking.customerName} · {booking.customerPhone}</p><p className="mt-1 line-clamp-1 text-sm text-slate-700">{booking.pickupAddress} → {booking.dropoffAddress}</p><div className="mt-2 flex flex-wrap justify-between gap-2 text-sm text-slate-600"><span>{booking.scheduledDate} {booking.scheduledTime}</span><span>{money(booking.estimatedPrice)}</span></div><p className="mt-1 text-xs">{paymentLabel(booking)}</p></Link>)}</div>{!bookings.length && !loading && <p className="p-4 text-center text-sm text-slate-600">{t("dispatch.empty", "No bookings in this section.")}</p>}</section>)}
    {loading && <p role="status" aria-live="polite">{t("common.loading", "Loading")}</p>}{hasMore && <button disabled={loading} onClick={() => void load(false, search, status)} className="min-h-11 rounded-lg border px-4">{t("dispatch.loadMore", "Load more")}</button>}
  </div>;
}
