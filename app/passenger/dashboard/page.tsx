"use client";

import { csrfFetch } from "@/lib/client/csrf-fetch";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Header from "@/components/layout/Header";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { presentStatus } from "@/lib/i18n/status-catalog";
import { formatMarketWallDateTime } from "@/lib/i18n/format";
import { presentMessage } from "@/lib/i18n/message-catalog";
import SavedRoutesManager from "@/components/booking/SavedRoutesManager";

type Booking = {
  id: string;
  bookingRef: string;
  serviceType: string;
  pickupAddress: string;
  dropoffAddress: string;
  scheduledDate: string;
  scheduledTime: string;
  status: string;
};

export default function PassengerDashboardPage() {
  const { t, locale } = useLanguage();
  const router = useRouter();
  const [passenger, setPassenger] = useState<any>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadErrorCode, setLoadErrorCode] = useState("");

  useEffect(() => {
    async function load() {
      let redirecting = false;
      try {
        const meRes = await csrfFetch("passenger", "/api/passenger/me", { cache: "no-store" });
        if (!meRes.ok) { redirecting = true; router.push("/passenger/login"); return; }
        const me = await meRes.json();
        setPassenger(me.passenger);

        const bookingRes = await csrfFetch("passenger", "/api/passenger/bookings", { cache: "no-store" });
        if (bookingRes.ok) {
          const data = await bookingRes.json();
          setBookings(Array.isArray(data.bookings) ? data.bookings : []);
        } else {
          setLoadErrorCode("SERVICE_UNAVAILABLE");
        }
      } catch {
        setLoadErrorCode("SERVICE_UNAVAILABLE");
      } finally {
        if (!redirecting) setLoading(false);
      }
    }
    load();
  }, [router]);

  const today = new Date().toISOString().split("T")[0];
  const upcoming = bookings.filter((booking) => booking.scheduledDate >= today);

  return (
    <>
      <Header forceSolid />
      <main className="min-h-screen bg-drivo-bg-soft px-4 pb-16 pt-32">
        <div className="container-main">
          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-3xl font-black text-drivo-navy">{t("passenger.dashboardTitle")}</h1>
              <p className="mt-2 text-sm text-drivo-text-secondary">{t("passenger.dashboardSubtitle")}</p>
            </div>
            <Link href="/passenger/profile" className="btn-primary justify-center">
              {t("passenger.editProfile")}
            </Link>
          </div>

          {loadErrorCode && <div role="alert" className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{presentMessage(loadErrorCode, locale)}</div>}
          {loading ? (
            <div className="card">{t("passenger.loading")}</div>
          ) : (
            <div className="grid gap-6 lg:grid-cols-[320px,1fr]">
              <section className="card">
                <h2 className="mb-4 text-lg font-black text-drivo-text">{t("passenger.profileSummary")}</h2>
                <Info label={t("passenger.fullName")} value={passenger?.fullName || t("passenger.dataUnavailable")} />
                <Info label={t("passenger.phone")} value={passenger?.phone || t("passenger.dataUnavailable")} />
                <Info label={t("passenger.phoneVerified")} value={passenger?.phoneVerified ? t("common.yes") : t("common.no")} />
                <Info label={t("passenger.email")} value={passenger?.email || t("passenger.dataUnavailable")} />
                {!passenger?.profileCompleted && (
                  <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-800">
                    {t("passenger.profileReminder")}
                  </div>
                )}
              </section>

              <div className="space-y-6">
                <SavedRoutesManager />
                <section className="card">
                <h2 className="mb-4 text-lg font-black text-drivo-text">{t("passenger.upcomingBookings")}</h2>
                <BookingList bookings={upcoming} empty={t("passenger.noUpcomingBookings")} />
                <h2 className="mb-4 mt-8 text-lg font-black text-drivo-text">{t("passenger.bookingHistory")}</h2>
                <BookingList bookings={bookings} empty={t("passenger.noBookings")} />
                </section>
              </div>
            </div>
          )}
        </div>
      </main>
    </>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-drivo-border-light py-2 text-sm">
      <span className="text-drivo-text-secondary">{label}</span>
      <span className="font-bold text-drivo-text text-right">{value}</span>
    </div>
  );
}

function BookingList({ bookings, empty }: { bookings: Booking[]; empty: string }) {
  const { t, locale } = useLanguage();
  if (bookings.length === 0) {
    return <p className="text-sm text-drivo-text-secondary">{empty}</p>;
  }

  return (
    <div className="space-y-3">
      {bookings.map((booking) => (
        <div key={booking.id} className="rounded-2xl border border-drivo-border-light bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-black text-drivo-text">{booking.bookingRef}</span>
            <span className="rounded-full bg-drivo-bg-soft px-3 py-1 text-xs font-bold text-drivo-text-secondary">{presentStatus("booking", booking.status, locale)}</span>
          </div>
          <div className="mt-2 text-sm text-drivo-text-secondary">
            <div>{t(`service.${String(booking.serviceType || '').toUpperCase()}`)}</div>
            <div>{formatMarketWallDateTime(booking.scheduledDate, booking.scheduledTime, locale) || t('common.notAvailable')}</div>
            <div>{booking.pickupAddress}</div>
            <div>{booking.dropoffAddress}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
