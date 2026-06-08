"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useLanguage } from "@/lib/i18n/LanguageContext";

interface Booking {
  id: string;
  bookingRef: string;
  status: string;
  dispatchStatus?: string | null;
  serviceType: string;
  pickupAddress: string;
  dropoffAddress: string;
  scheduledDate: string;
  scheduledTime: string;
  passengerCount: number;
  customerName: string;
  customerPhone: string;
  customerPhoneCode: string;
  paymentMethod: string;
  estimatedPrice?: number | null;
  driver?: { fullName?: string } | null;
}

interface DashboardStats {
  totalBookings: number;
  pendingBookings: number;
  confirmedBookings: number;
  completedBookings: number;
  cancelledBookings: number;
  todayBookings: number;
  totalDrivers: number;
  onlineDrivers?: number;
  activeRides?: number;
  searchingDispatches?: number;
  noDriverAvailable?: number;
  todayRevenue?: number;
  recentBookings: Booking[];
}

export default function AdminDashboard() {
  const { t, locale } = useLanguage();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState("");

  useEffect(() => {
    void fetchStats();
    const interval = setInterval(() => void fetchStats(), 10000);
    return () => clearInterval(interval);
  }, [locale]);

  const safeJson = async (res: Response) => {
    const text = await res.text();
    if (!text) return {};
    try {
      return JSON.parse(text);
    } catch {
      return {};
    }
  };

  const fetchStats = async () => {
    try {
      const res = await fetch("/api/admin/stats", { cache: "no-store" });
      const data = (await safeJson(res)) as DashboardStats;
      setStats(data);
      setLastUpdated(new Date().toLocaleTimeString(locale));
    } catch (err) {
      console.error("Failed to fetch stats:", err);
    } finally {
      setLoading(false);
    }
  };

  const recentBookings = stats?.recentBookings || [];

  const computed = useMemo(
    () => ({
      activeRides:
        stats?.activeRides ??
        recentBookings.filter((b) =>
          ["ASSIGNED", "DRIVER_ENROUTE", "IN_PROGRESS"].includes(b.status)
        ).length,
      searchingDispatches:
        stats?.searchingDispatches ??
        recentBookings.filter((b) => b.dispatchStatus === "SEARCHING_DRIVER").length,
      noDriverAvailable:
        stats?.noDriverAvailable ??
        recentBookings.filter((b) => b.dispatchStatus === "NO_DRIVER_AVAILABLE").length,
      todayRevenue:
        stats?.todayRevenue ??
        recentBookings
          .filter((b) => b.status === "COMPLETED")
          .reduce((sum, b) => sum + Number(b.estimatedPrice || 0), 0),
    }),
    [stats, recentBookings]
  );

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center rounded-[32px] border border-drivo-border bg-white shadow-soft">
        <div className="text-center">
          <div className="mx-auto mb-3 h-12 w-12 animate-pulse rounded-2xl bg-[linear-gradient(135deg,rgba(31,167,163,0.2),rgba(67,211,203,0.35))]" />
          <p className="text-drivo-text-secondary">{t("adminDashboard.loading")}</p>
        </div>
      </div>
    );
  }

  const statCards = [
    { label: t("adminDashboard.stats.todayBookings"), value: stats?.todayBookings || 0, code: "TD", color: "bg-drivo-blue-light text-drivo-blue border-drivo-aqua/20" },
    { label: t("adminDashboard.stats.pendingBookings"), value: stats?.pendingBookings || 0, code: "PN", color: "bg-drivo-amber-light text-drivo-amber border-drivo-amber/20" },
    { label: t("adminDashboard.stats.activeRides"), value: computed.activeRides, code: "AR", color: "bg-drivo-green-light text-drivo-teal border-drivo-aqua/20" },
    { label: t("adminDashboard.stats.searchingDispatches"), value: computed.searchingDispatches, code: "DV", color: "bg-drivo-purple-light text-drivo-purple border-drivo-purple/20" },
    { label: t("adminDashboard.stats.completedBookings"), value: stats?.completedBookings || 0, code: "OK", color: "bg-drivo-green-light text-drivo-teal border-drivo-aqua/20" },
    { label: t("adminDashboard.stats.totalDrivers"), value: stats?.totalDrivers || 0, code: "DR", color: "bg-drivo-bg-soft text-drivo-navy border-drivo-border" },
  ];

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-drivo-navy">{t("adminDashboard.title")}</h1>
          <p className="mt-1 text-sm text-drivo-text-secondary">
            {t("adminDashboard.subtitle")} • {t("adminDashboard.updatedAt")} {lastUpdated || "—"}
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => void fetchStats()}
            className="rounded-2xl border border-drivo-border bg-white px-4 py-2 text-sm font-semibold text-drivo-text transition hover:bg-drivo-bg-soft"
          >
            {t("adminDashboard.refresh")}
          </button>

          <Link
            href="/admin/bookings"
            className="rounded-2xl bg-[linear-gradient(135deg,#1fa7a3_0%,#43d3cb_100%)] px-4 py-2 text-sm font-semibold text-white shadow-glow transition hover:opacity-95"
          >
            {t("adminDashboard.bookings")}
          </Link>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        {statCards.map((card) => (
          <div key={card.label} className={`rounded-[26px] border p-4 shadow-soft ${card.color}`}>
            <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-white/70 text-xs font-black tracking-[0.2em]">
              {card.code}
            </div>
            <div className="text-2xl font-black">{card.value}</div>
            <div className="mt-1 text-xs font-medium">{card.label}</div>
          </div>
        ))}
      </div>

      <div className="mb-8 grid gap-4 md:grid-cols-4">
        <MiniCard label={t("adminDashboard.financial.onlineDrivers")} value={stats?.onlineDrivers ?? "—"} code="ON" />
        <MiniCard label={t("adminDashboard.financial.noDriverAvailable")} value={computed.noDriverAvailable} code="ND" />
        <MiniCard label={t("adminDashboard.financial.cancelledBookings")} value={stats?.cancelledBookings || 0} code="CN" />
        <MiniCard label={t("adminDashboard.financial.todayRevenue")} value={`€${computed.todayRevenue.toFixed(2)}`} code="RV" />
      </div>

      <div className="overflow-hidden rounded-[30px] border border-drivo-border bg-white shadow-soft">
        <div className="flex items-center justify-between border-b border-drivo-border-light p-5">
          <div>
            <h2 className="text-lg font-bold text-drivo-navy">{t("adminDashboard.recentBookings.title")}</h2>
            <p className="mt-1 text-xs text-drivo-text-muted">{t("adminDashboard.recentBookings.subtitle")}</p>
          </div>

          <Link href="/admin/bookings" className="text-sm font-medium text-drivo-teal hover:text-drivo-navy">
            {t("adminDashboard.recentBookings.viewAll")}
          </Link>
        </div>

        {recentBookings.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-drivo-border-light bg-drivo-bg-soft">
                  <th className="p-3 text-left font-semibold text-drivo-text-secondary">{t("adminDashboard.table.ref")}</th>
                  <th className="p-3 text-left font-semibold text-drivo-text-secondary">{t("adminDashboard.table.status")}</th>
                  <th className="p-3 text-left font-semibold text-drivo-text-secondary">{t("adminDashboard.table.dispatch")}</th>
                  <th className="p-3 text-left font-semibold text-drivo-text-secondary">{t("adminDashboard.table.service")}</th>
                  <th className="p-3 text-left font-semibold text-drivo-text-secondary">{t("adminDashboard.table.customer")}</th>
                  <th className="p-3 text-left font-semibold text-drivo-text-secondary">{t("adminDashboard.table.date")}</th>
                  <th className="p-3 text-left font-semibold text-drivo-text-secondary">{t("adminDashboard.table.route")}</th>
                  <th className="p-3 text-left font-semibold text-drivo-text-secondary">{t("adminDashboard.table.driver")}</th>
                  <th className="p-3 text-left font-semibold text-drivo-text-secondary">{t("adminDashboard.table.payment")}</th>
                </tr>
              </thead>
              <tbody>
                {recentBookings.map((booking) => (
                  <tr key={booking.id} className="border-b border-drivo-border-light/70 transition-colors hover:bg-drivo-bg-soft/70">
                    <td className="p-3">
                      <Link href={`/admin/bookings?id=${booking.id}`} className="font-mono text-xs text-drivo-teal hover:underline">
                        {booking.bookingRef}
                      </Link>
                    </td>
                    <td className="p-3"><StatusBadge status={booking.status} /></td>
                    <td className="p-3"><DispatchBadge status={booking.dispatchStatus} /></td>
                    <td className="p-3"><ServiceBadge type={booking.serviceType} /></td>
                    <td className="p-3">
                      <div className="font-medium text-drivo-navy">{booking.customerName}</div>
                      <div className="text-xs text-drivo-text-secondary">
                        {booking.customerPhoneCode}{booking.customerPhone}
                      </div>
                    </td>
                    <td className="p-3 whitespace-nowrap text-drivo-text-secondary">
                      <div>{booking.scheduledDate}</div>
                      <div className="text-xs text-drivo-text-muted">{booking.scheduledTime}</div>
                    </td>
                    <td className="max-w-[220px] truncate p-3 text-drivo-text-secondary">
                      {booking.pickupAddress} → {booking.dropoffAddress}
                    </td>
                    <td className="p-3 text-xs text-drivo-text-secondary">
                      {booking.driver?.fullName || "—"}
                    </td>
                    <td className="p-3"><PaymentBadge method={booking.paymentMethod} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-12 text-center">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-3xl bg-drivo-bg-soft text-sm font-black tracking-[0.24em] text-drivo-teal">
              BK
            </div>
            <p className="text-drivo-text-secondary">{t("adminDashboard.empty")}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function MiniCard({ label, value, code }: { label: string; value: string | number; code: string }) {
  return (
    <div className="rounded-[26px] border border-drivo-border bg-white p-4 shadow-soft">
      <div className="mb-2 inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-drivo-bg-soft text-[11px] font-black tracking-[0.2em] text-drivo-teal">
        {code}
      </div>
      <div className="text-xl font-black text-drivo-navy">{value}</div>
      <div className="mt-1 text-xs font-medium text-drivo-text-secondary">{label}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const { t } = useLanguage();
  const styles: Record<string, string> = {
    PENDING: "bg-drivo-amber-light text-drivo-amber",
    CONFIRMED: "bg-drivo-blue-light text-drivo-blue",
    ASSIGNED: "bg-drivo-purple-light text-drivo-purple",
    DRIVER_ENROUTE: "bg-drivo-blue-light text-drivo-teal",
    IN_PROGRESS: "bg-drivo-green-light text-drivo-teal",
    COMPLETED: "bg-drivo-green-light text-drivo-teal",
    CANCELLED: "bg-red-50 text-red-700",
    NO_SHOW: "bg-gray-100 text-gray-700",
  };

  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${styles[status] || "bg-gray-100 text-gray-600"}`}>{t(`status.${status}`, status)}</span>;
}

function DispatchBadge({ status }: { status?: string | null }) {
  const { t } = useLanguage();
  const value = status || "NOT_STARTED";
  const styles: Record<string, string> = {
    NOT_STARTED: "bg-gray-100 text-gray-600",
    SEARCHING_DRIVER: "bg-drivo-blue-light text-drivo-blue",
    ACCEPTED: "bg-drivo-green-light text-drivo-teal",
    NO_DRIVER_AVAILABLE: "bg-red-50 text-red-700",
  };

  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${styles[value] || "bg-gray-100 text-gray-600"}`}>{t(`dispatch.${value}`, value)}</span>;
}

function ServiceBadge({ type }: { type: string }) {
  const { t } = useLanguage();
  return <span className="text-xs font-semibold text-drivo-text">{t(`service.${type}`, type)}</span>;
}

function PaymentBadge({ method }: { method: string }) {
  const { t } = useLanguage();
  const styles: Record<string, string> = {
    CARD: "bg-drivo-green-light text-drivo-teal",
    CASH: "bg-drivo-amber-light text-drivo-amber",
    INVOICE: "bg-drivo-blue-light text-drivo-blue",
  };

  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${styles[method] || "bg-gray-100 text-gray-600"}`}>{t(`payment.${method}`, method)}</span>;
}
