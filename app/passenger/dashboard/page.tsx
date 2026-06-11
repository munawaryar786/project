"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Header from "@/components/layout/Header";
import { useLanguage } from "@/lib/i18n/LanguageContext";

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
  const { t } = useLanguage();
  const router = useRouter();
  const [passenger, setPassenger] = useState<any>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const meRes = await fetch("/api/passenger/me", { cache: "no-store" });
      if (!meRes.ok) {
        router.push("/passenger/login");
        return;
      }
      const me = await meRes.json();
      setPassenger(me.passenger);

      const bookingRes = await fetch("/api/passenger/bookings", { cache: "no-store" });
      if (bookingRes.ok) {
        const data = await bookingRes.json();
        setBookings(Array.isArray(data.bookings) ? data.bookings : []);
      }
      setLoading(false);
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

          {loading ? (
            <div className="card">{t("passenger.loading")}</div>
          ) : (
            <div className="grid gap-6 lg:grid-cols-[320px,1fr]">
              <section className="card">
                <h2 className="mb-4 text-lg font-black text-drivo-text">{t("passenger.profileSummary")}</h2>
                <Info label={t("passenger.fullName")} value={passenger?.fullName || "N/A"} />
                <Info label={t("passenger.phone")} value={passenger?.phone || "N/A"} />
                <Info label={t("passenger.phoneVerified")} value={passenger?.phoneVerified ? t("common.yes") : t("common.no")} />
                <Info label={t("passenger.email")} value={passenger?.email || "N/A"} />
                {!passenger?.profileCompleted && (
                  <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-800">
                    {t("passenger.profileReminder")}
                  </div>
                )}
              </section>

              <section className="card">
                <h2 className="mb-4 text-lg font-black text-drivo-text">{t("passenger.upcomingBookings")}</h2>
                <BookingList bookings={upcoming} empty={t("passenger.noUpcomingBookings")} />
                <h2 className="mb-4 mt-8 text-lg font-black text-drivo-text">{t("passenger.bookingHistory")}</h2>
                <BookingList bookings={bookings} empty={t("passenger.noBookings")} />
              </section>
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
  if (bookings.length === 0) {
    return <p className="text-sm text-drivo-text-secondary">{empty}</p>;
  }

  return (
    <div className="space-y-3">
      {bookings.map((booking) => (
        <div key={booking.id} className="rounded-2xl border border-drivo-border-light bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-black text-drivo-text">{booking.bookingRef}</span>
            <span className="rounded-full bg-drivo-bg-soft px-3 py-1 text-xs font-bold text-drivo-text-secondary">{booking.status}</span>
          </div>
          <div className="mt-2 text-sm text-drivo-text-secondary">
            <div>{booking.serviceType}</div>
            <div>{booking.scheduledDate} {booking.scheduledTime}</div>
            <div>{booking.pickupAddress}</div>
            <div>{booking.dropoffAddress}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
