"use client";
import { useEffect, useState } from "react";
import { csrfFetch } from "@/lib/client/csrf-fetch";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { formatMarketWallDateTime, formatNumber } from "@/lib/i18n/format";

export function ScheduledMarketplace() {
  const { t, locale } = useLanguage();
  const [data, setData] = useState<any>({ marketplace: [], claimedRides: [] });
  const [busy, setBusy] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [errorKey, setErrorKey] = useState("");
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => { const timer = setInterval(() => setClock(Date.now()), 30000); return () => clearInterval(timer); }, []);
  const load = async () => { try { const res = await csrfFetch("driver", "/api/driver/scheduled-rides", { cache: "no-store" }); if (!res.ok) throw new Error("scheduled-list-unavailable"); setData(await res.json()); setErrorKey(""); } catch { setErrorKey("m4.driver.scheduledLoadFailed"); } };
  const loadMore = async () => {
    if (!data.nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await csrfFetch("driver", `/api/driver/scheduled-rides?cursor=${encodeURIComponent(data.nextCursor)}`, { cache: "no-store" });
      if (!res.ok) { setErrorKey("m4.driver.scheduledLoadFailed"); return; }
      const page = await res.json();
      setData((current: any) => {
        if (current.nextCursor !== data.nextCursor) return current;
        const seen = new Set(current.marketplace.map((ride: any) => ride.id));
        return { ...current, marketplace: [...current.marketplace, ...page.marketplace.filter((ride: any) => !seen.has(ride.id))], nextCursor: page.nextCursor };
      });
    } catch { setErrorKey("m4.driver.scheduledLoadFailed"); } finally { setLoadingMore(false); }
  };
  useEffect(() => { void load(); const timer = setInterval(() => void load(), 30000); return () => clearInterval(timer); }, []);
  const formatUntil = (value: any) => { const ms = new Date(value || 0).getTime() - clock; if (!Number.isFinite(ms) || ms <= 0) return t("driverPortal.pickupNow", "Pickup soon"); const total = Math.floor(ms / 60000); const days = Math.floor(total / 1440); const hours = Math.floor((total % 1440) / 60); const minutes = total % 60; return days ? `${formatNumber(days, locale)} ${t("driverPortal.daysShort")} ${formatNumber(hours, locale)} ${t("driverPortal.hoursShort")}` : `${formatNumber(hours, locale)} ${t("driverPortal.hoursShort")} ${formatNumber(minutes, locale)} ${t("driverPortal.minutesShort")}`; };
  const rideTime = (ride: any) => formatMarketWallDateTime(ride.scheduledDate || ride.pickupDate || "", ride.scheduledTime || ride.pickupTime || "", locale) || t("driverPortal.notAvailable");
  const claim = async (id: string) => { setBusy(id); try { const res = await csrfFetch("driver", `/api/driver/scheduled-rides/${id}/claim`, { method: "POST" }); if (!res.ok) { setErrorKey("m4.driver.scheduledClaimFailed"); return; } setErrorKey(""); await load(); } catch { setErrorKey("m4.driver.scheduledClaimFailed"); } finally { setBusy(null); } };
  return <section aria-labelledby="scheduled-marketplace-heading" className="mb-6 rounded-3xl border border-indigo-100 bg-indigo-50/60 p-5">
    <div className="flex items-center justify-between gap-3"><div><h2 id="scheduled-marketplace-heading" className="text-base font-black text-gray-900">{t("driverPortal.scheduledMarketplace", "Scheduled ride marketplace")}</h2><p className="mt-1 text-xs text-gray-600">{t("driverPortal.scheduledMarketplaceHelp", "Plan ahead with compatible future rides.")}</p></div><button type="button" onClick={() => void load()} className="min-h-11 rounded-xl border border-indigo-200 bg-white px-3 py-2 text-xs font-bold text-indigo-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700">{t("driverPortal.refresh", "Refresh")}</button></div>
    {errorKey && <p role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{t(errorKey)}</p>}
    <div className="mt-4 space-y-3">{data.marketplace.length === 0 ? <p className="rounded-2xl bg-white p-4 text-sm text-gray-600">{t("driverPortal.noScheduledRides", "No scheduled rides available.")}</p> : data.marketplace.map((ride: any) => <article key={ride.id} className="rounded-2xl bg-white p-4 shadow-sm"><div className="flex items-start justify-between gap-3"><div><p className="font-bold text-gray-900">{ride.pickupArea && ride.pickupArea !== "Area unavailable" ? ride.pickupArea : t("driverPortal.areaUnavailable")} -&gt; {ride.dropoffArea && ride.dropoffArea !== "Area unavailable" ? ride.dropoffArea : t("driverPortal.areaUnavailable")}</p><p className="text-xs text-gray-600">{rideTime(ride)} - {t(`service.${ride.serviceType}`, t("driverPortal.service"))}</p><p className="mt-1 text-xs text-gray-500">{formatNumber(ride.passengerCount || 0, locale)} {t(`driverPortal.passengers.${new Intl.PluralRules(locale).select(ride.passengerCount || 0)}`)} - {t(`luggage.${ride.luggageType}`, t("driverPortal.notAvailable"))} - {t("driverPortal.pickupIn", "Pickup in")} {formatUntil(ride.pickupAt)}</p></div><button type="button" disabled={busy === ride.id} onClick={() => void claim(ride.id)} className="min-h-11 rounded-xl bg-indigo-600 px-3 py-2 text-xs font-bold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700 disabled:opacity-50">{busy === ride.id ? t("driverPortal.claiming", "Claiming...") : t("driverPortal.claimRide", "Claim ride")}</button></div></article>)}</div>
    {data.nextCursor && <button type="button" disabled={loadingMore} onClick={() => void loadMore()} className="mt-4 min-h-11 rounded-xl border border-indigo-200 bg-white px-4 py-2 text-sm font-bold text-indigo-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700 disabled:opacity-50">{t("driverPortal.loadMoreScheduledRides")}</button>}
    {data.claimedRides.length > 0 && <div className="mt-5"><h3 className="text-sm font-black text-gray-900">{t("driverPortal.claimedScheduledRides", "Your upcoming scheduled rides")}</h3><div className="mt-2 space-y-2">{data.claimedRides.map((ride: any) => <div key={ride.id} className="rounded-2xl bg-white p-4 text-sm"><span className="font-bold">{ride.pickupAddress} -&gt; {ride.dropoffAddress}</span><span className="ml-2 text-gray-600">{rideTime(ride)}</span></div>)}</div></div>}
  </section>;
}
