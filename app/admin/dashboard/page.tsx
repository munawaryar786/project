"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

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
  driver?: any | null;
  createdAt: string;
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
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState("");

  useEffect(() => {
    fetchStats();

    const interval = setInterval(fetchStats, 10000);
    return () => clearInterval(interval);
  }, []);

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
      const data: any = await safeJson(res);
      setStats(data);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (err) {
      console.error("Failed to fetch stats:", err);
    } finally {
      setLoading(false);
    }
  };

  const recentBookings = stats?.recentBookings || [];

  const computed = useMemo(() => {
    return {
      activeRides:
        stats?.activeRides ??
        recentBookings.filter((b) =>
          ["ASSIGNED", "DRIVER_ENROUTE", "IN_PROGRESS"].includes(b.status)
        ).length,
      searchingDispatches:
        stats?.searchingDispatches ??
        recentBookings.filter((b) => b.dispatchStatus === "SEARCHING_DRIVER")
          .length,
      noDriverAvailable:
        stats?.noDriverAvailable ??
        recentBookings.filter((b) => b.dispatchStatus === "NO_DRIVER_AVAILABLE")
          .length,
      todayRevenue:
        stats?.todayRevenue ??
        recentBookings
          .filter((b) => b.status === "COMPLETED")
          .reduce((sum, b) => sum + Number(b.estimatedPrice || 0), 0),
    };
  }, [stats, recentBookings]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="text-4xl animate-pulse mb-2">📊</div>
          <p className="text-gray-500">Načítavam dashboard...</p>
        </div>
      </div>
    );
  }

  const statCards = [
    {
      label: "Dnešné rezervácie",
      value: stats?.todayBookings || 0,
      icon: "📅",
      color: "bg-blue-50 text-blue-700 border-blue-200",
    },
    {
      label: "Čakajúce",
      value: stats?.pendingBookings || 0,
      icon: "🆕",
      color: "bg-amber-50 text-amber-700 border-amber-200",
    },
    {
      label: "Aktívne jazdy",
      value: computed.activeRides,
      icon: "🚦",
      color: "bg-cyan-50 text-cyan-700 border-cyan-200",
    },
    {
      label: "Hľadá vodiča",
      value: computed.searchingDispatches,
      icon: "📡",
      color: "bg-indigo-50 text-indigo-700 border-indigo-200",
    },
    {
      label: "Dokončené",
      value: stats?.completedBookings || 0,
      icon: "✅",
      color: "bg-green-50 text-green-700 border-green-200",
    },
    {
      label: "Vodiči",
      value: stats?.totalDrivers || 0,
      icon: "🚗",
      color: "bg-teal-50 text-teal-700 border-teal-200",
    },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">
            Prevádzkový prehľad Drivo • Aktualizované: {lastUpdated || "—"}
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={fetchStats}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-semibold rounded-xl transition-colors"
          >
            🔄 Obnoviť
          </button>

          <Link
            href="/admin/bookings"
            className="px-4 py-2 bg-green-700 hover:bg-green-800 text-white text-sm font-semibold rounded-xl transition-colors"
          >
            📋 Rezervácie
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
        {statCards.map((card) => (
          <div
            key={card.label}
            className={`p-4 rounded-xl border-2 ${card.color}`}
          >
            <div className="text-2xl mb-1">{card.icon}</div>
            <div className="text-2xl font-bold">{card.value}</div>
            <div className="text-xs font-medium mt-1">{card.label}</div>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-4 gap-4 mb-8">
        <MiniCard label="Online vodiči" value={stats?.onlineDrivers ?? "—"} icon="🟢" />
        <MiniCard label="Bez vodiča" value={computed.noDriverAvailable} icon="⚠️" />
        <MiniCard label="Zrušené" value={stats?.cancelledBookings || 0} icon="❌" />
        <MiniCard label="Dnešný obrat" value={`€${computed.todayRevenue.toFixed(2)}`} icon="💶" />
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-bold text-gray-900">
              🆕 Najnovšie rezervácie
            </h2>
            <p className="text-xs text-gray-400 mt-1">
              Booking, dispatch, payment a driver status
            </p>
          </div>

          <Link
            href="/admin/bookings"
            className="text-sm text-green-700 hover:text-green-800 font-medium"
          >
            Zobraziť všetko →
          </Link>
        </div>

        {recentBookings.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left p-3 font-semibold text-gray-600">Ref</th>
                  <th className="text-left p-3 font-semibold text-gray-600">Status</th>
                  <th className="text-left p-3 font-semibold text-gray-600">Dispatch</th>
                  <th className="text-left p-3 font-semibold text-gray-600">Service</th>
                  <th className="text-left p-3 font-semibold text-gray-600">Customer</th>
                  <th className="text-left p-3 font-semibold text-gray-600">Date</th>
                  <th className="text-left p-3 font-semibold text-gray-600">Route</th>
                  <th className="text-left p-3 font-semibold text-gray-600">Driver</th>
                  <th className="text-left p-3 font-semibold text-gray-600">Payment</th>
                </tr>
              </thead>

              <tbody>
                {recentBookings.map((booking) => (
                  <tr
                    key={booking.id}
                    className="border-b border-gray-50 hover:bg-gray-50 transition-colors"
                  >
                    <td className="p-3">
                      <Link
                        href={`/admin/bookings?id=${booking.id}`}
                        className="font-mono text-xs text-green-700 hover:underline"
                      >
                        {booking.bookingRef}
                      </Link>
                    </td>
                    <td className="p-3"><StatusBadge status={booking.status} /></td>
                    <td className="p-3"><DispatchBadge status={booking.dispatchStatus} /></td>
                    <td className="p-3"><ServiceBadge type={booking.serviceType} /></td>
                    <td className="p-3">
                      <div className="font-medium text-gray-900">{booking.customerName}</div>
                      <div className="text-xs text-gray-500">
                        {booking.customerPhoneCode}{booking.customerPhone}
                      </div>
                    </td>
                    <td className="p-3 text-gray-600 whitespace-nowrap">
                      <div>{booking.scheduledDate}</div>
                      <div className="text-xs text-gray-400">{booking.scheduledTime}</div>
                    </td>
                    <td className="p-3 text-gray-600 max-w-[220px] truncate">
                      {booking.pickupAddress} → {booking.dropoffAddress}
                    </td>
                    <td className="p-3 text-xs text-gray-600">
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
            <div className="text-4xl mb-3">📋</div>
            <p className="text-gray-500">Zatiaľ žiadne rezervácie.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function MiniCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string | number;
  icon: string;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
      <div className="text-xl mb-1">{icon}</div>
      <div className="text-xl font-bold text-gray-900">{value}</div>
      <div className="text-xs text-gray-500 font-medium mt-1">{label}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    PENDING: "bg-amber-100 text-amber-700",
    CONFIRMED: "bg-blue-100 text-blue-700",
    ASSIGNED: "bg-purple-100 text-purple-700",
    DRIVER_ENROUTE: "bg-indigo-100 text-indigo-700",
    IN_PROGRESS: "bg-cyan-100 text-cyan-700",
    COMPLETED: "bg-green-100 text-green-700",
    CANCELLED: "bg-red-100 text-red-700",
    NO_SHOW: "bg-gray-100 text-gray-700",
  };

  return (
    <span className={`inline-flex px-2 py-1 rounded-full text-xs font-semibold ${styles[status] || "bg-gray-100 text-gray-600"}`}>
      {status}
    </span>
  );
}

function DispatchBadge({ status }: { status?: string | null }) {
  const value = status || "NOT_STARTED";
  const styles: Record<string, string> = {
    NOT_STARTED: "bg-gray-100 text-gray-600",
    SEARCHING_DRIVER: "bg-blue-100 text-blue-700",
    ACCEPTED: "bg-green-100 text-green-700",
    NO_DRIVER_AVAILABLE: "bg-red-100 text-red-700",
  };

  return (
    <span className={`inline-flex px-2 py-1 rounded-full text-xs font-semibold ${styles[value] || "bg-gray-100 text-gray-600"}`}>
      {value}
    </span>
  );
}

function ServiceBadge({ type }: { type: string }) {
  const labels: Record<string, { icon: string; label: string }> = {
    STANDARD: { icon: "🚕", label: "Taxi" },
    ACCESSIBLE: { icon: "♿", label: "ZŤP" },
    SENIOR: { icon: "👴", label: "Senior" },
    CHILDREN: { icon: "👶", label: "Children" },
    AIRPORT: { icon: "✈️", label: "Airport" },
  };

  const item = labels[type] || { icon: "🚗", label: type };

  return (
    <span className="text-xs font-medium">
      {item.icon} {item.label}
    </span>
  );
}

function PaymentBadge({ method }: { method: string }) {
  const styles: Record<string, string> = {
    CARD: "bg-green-50 text-green-700",
    CASH: "bg-amber-50 text-amber-700",
    INVOICE: "bg-blue-50 text-blue-700",
  };

  const icons: Record<string, string> = {
    CARD: "💳",
    CASH: "💵",
    INVOICE: "🏢",
  };

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold ${styles[method] || "bg-gray-100 text-gray-600"}`}>
      {icons[method] || "💰"} {method}
    </span>
  );
}