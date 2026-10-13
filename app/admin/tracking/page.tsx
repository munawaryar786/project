"use client";

import { csrfFetch } from "@/lib/client/csrf-fetch";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { formatMarketDateTime, formatMarketTime, formatNumber } from "@/lib/i18n/format";
import { presentStatus } from "@/lib/i18n/status-catalog";

interface Driver {
  id: string;
  fullName: string;
  phone: string;
  email: string | null;
  vehicleType: string | null;
  vehiclePlate: string | null;
  currentLat: number | null;
  currentLng: number | null;
  lastLocationUpdate: string | null;
  isOnline?: boolean;
  isOnTrip: boolean;
  status: string;
  locationHistory: Array<{
    lat: number;
    lng: number;
    timestamp: string;
  }>;
}

export default function DriverTrackingPage() {
  const router = useRouter();
  const { t, locale } = useLanguage();

  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDriver, setSelectedDriver] = useState<Driver | null>(null);
  const [lastUpdate, setLastUpdate] = useState<string>("");
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    fetchDrivers();

    const interval = setInterval(fetchDrivers, 10000);
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

  const fetchDrivers = async () => {
    try {

      const res = await csrfFetch("admin", "/api/admin/drivers/tracking", {
        cache: "no-store",
      });

      const data: any = await safeJson(res);

      if (res.ok) {
        setDrivers(data.drivers || []);
        setLastUpdate(new Date().toISOString());
        setLoadError(false);
      } else {
        setLoadError(true);
      }
    } catch (err) {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  const stats = useMemo(() => {
    const online = drivers.filter((d) => d.isOnline).length;
    const onTrip = drivers.filter((d) => d.isOnTrip).length;
    const available = drivers.filter(
      (d) => d.status === "ACTIVE" && d.isOnline && !d.isOnTrip
    ).length;

    return {
      total: drivers.length,
      online,
      available,
      onTrip,
      offline: drivers.length - online,
    };
  }, [drivers]);

  const getTimeAgo = (timestamp: string | null) => {
    if (!timestamp) return t("m4.tracking.never");

    const date = new Date(timestamp);
    const now = new Date();
    const diff = Math.floor((now.getTime() - date.getTime()) / 1000);

    const key = diff < 60 ? "secondsAgo" : diff < 3600 ? "minutesAgo" : diff < 86400 ? "hoursAgo" : "daysAgo";
    const count = diff < 60 ? diff : diff < 3600 ? Math.floor(diff / 60) : diff < 86400 ? Math.floor(diff / 3600) : Math.floor(diff / 86400);
    return t(`m4.tracking.${key}`).replace("{count}", formatNumber(Math.max(0, count), locale));
  };

  const getDriverState = (driver: Driver) => {
    if (driver.isOnTrip) {
      return {
        label: t("m4.tracking.onTrip"),
        icon: "🚕",
        className: "bg-amber-100 text-amber-800 border-amber-200",
      };
    }

    if (driver.isOnline) {
      return {
        label: t("adminDrivers.available"),
        icon: "🟢",
        className: "bg-green-100 text-green-800 border-green-200",
      };
    }

    return {
      label: t("adminDrivers.offline"),
      icon: "⚫",
      className: "bg-gray-100 text-gray-700 border-gray-200",
    };
  };

  const openGoogleMaps = (driver: Driver) => {
    if (!driver.currentLat || !driver.currentLng) return;
    window.open(
      `https://www.google.com/maps?q=${driver.currentLat},${driver.currentLng}`,
      "_blank"
    );
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <div className="text-5xl animate-pulse mb-3">🗺️</div>
          <p className="text-gray-500">{t("m4.tracking.loading")}</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-400 font-bold">
            {t("admin.operations")}
          </p>
          <h1 className="text-2xl font-black text-gray-900">
            🗺️ {t("m4.tracking.title")}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {t("m4.tracking.lastUpdate")}: {lastUpdate ? formatMarketTime(lastUpdate, locale) : t("common.loading")}
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={fetchDrivers}
            className="px-4 py-2 bg-green-700 text-white rounded-xl hover:bg-green-800 transition-colors text-sm font-bold"
          >
            🔄 {t("m4.tracking.refresh")}
          </button>

          <button
            onClick={() => router.push("/admin/dashboard")}
            className="px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors text-sm font-bold"
          >
            ← {t("m4.tracking.back")}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
        <StatCard label={t("m4.tracking.all")} value={stats.total} tone="gray" />
        <StatCard label={t("adminDrivers.online")} value={stats.online} tone="green" />
        <StatCard label={t("adminDrivers.available")} value={stats.available} tone="blue" />
        <StatCard label={t("m4.tracking.onTrip")} value={stats.onTrip} tone="amber" />
        <StatCard label={t("adminDrivers.offline")} value={stats.offline} tone="gray" />
      </div>

      {loadError && <p role="alert" className="mb-4 text-sm text-red-700">{t("m4.tracking.loadFailed")}</p>}
      <div className="grid lg:grid-cols-[1fr,420px] gap-6">
        <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-black text-gray-900">{t("m4.tracking.working")}</h2>
            <span className="text-xs text-gray-400 font-bold">
              {t("m4.tracking.refreshInterval")}
            </span>
          </div>

          {drivers.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {drivers.map((driver) => {
                const state = getDriverState(driver);

                return (
                  <button
                    key={driver.id}
                    onClick={() => setSelectedDriver(driver)}
                    className={`text-left bg-white rounded-3xl border-2 p-4 transition-all hover:shadow-md ${
                      selectedDriver?.id === driver.id
                        ? "border-green-500 shadow-md"
                        : "border-gray-200"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div>
                        <h3 className="font-black text-gray-900">
                          {driver.fullName}
                        </h3>
                        <p className="text-sm text-gray-500">{driver.phone}</p>
                      </div>

                      <span
                        className={`px-2 py-1 rounded-full text-xs font-black border ${state.className}`}
                      >
                        {state.icon} {state.label}
                      </span>
                    </div>

                    <div className="space-y-2 text-sm text-gray-600">
                      <div>
                        🚕 {driver.vehicleType || t("m4.common.vehiclePending")}
                        {driver.vehiclePlate && ` • ${driver.vehiclePlate}`}
                      </div>

                      {driver.currentLat && driver.currentLng ? (
                        <>
                          <div className="text-xs text-gray-500">
                            📍 {driver.currentLat.toFixed(5)},{" "}
                            {driver.currentLng.toFixed(5)}
                          </div>
                          <div className="text-xs text-gray-500">
                            🕐 {getTimeAgo(driver.lastLocationUpdate)}
                          </div>
                        </>
                      ) : (
                        <div className="text-xs text-gray-400 italic">
                          {t("m4.tracking.noLocation")}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="p-12 text-center">
              <div className="text-5xl mb-3">📍</div>
              <h3 className="text-lg font-black text-gray-700 mb-1">
                {t("m4.tracking.noDrivers")}
              </h3>
              <p className="text-gray-500">
                {t("m4.tracking.noActiveDrivers")}
              </p>
            </div>
          )}
        </div>

        <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-5 h-fit sticky top-20">
          {selectedDriver ? (
            <>
              <div className="flex items-start justify-between gap-3 mb-5">
                <div>
                  <p className="text-xs uppercase tracking-wide text-gray-400 font-bold">
                    {t("m4.tracking.driverDetails")}
                  </p>
                  <h2 className="text-xl font-black text-gray-900">
                    {selectedDriver.fullName}
                  </h2>
                </div>

                <button
                  onClick={() => setSelectedDriver(null)}
                  aria-label={t("m4.common.close")}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-3 text-sm">
                <DetailRow label={t("common.phone")} value={selectedDriver.phone} />
                <DetailRow
                  label={t("common.email")}
                  value={selectedDriver.email || t("m4.common.notProvided")}
                />
                <DetailRow
                  label={t("adminVehicles.vehicle")}
                  value={`${selectedDriver.vehicleType || t("m4.common.notProvided")} • ${
                    selectedDriver.vehiclePlate || t("m4.common.notProvided")
                  }`}
                />
                <DetailRow label={t("m4.tracking.accountStatus")} value={presentStatus("driverAccount", selectedDriver.status, locale)} />

                <div className="flex justify-between items-start gap-3">
                  <span className="text-gray-500 text-xs font-bold">
                    {t("m4.tracking.operationalStatus")}
                  </span>
                  <span
                    className={`px-2 py-1 rounded-full text-xs font-black border ${
                      getDriverState(selectedDriver).className
                    }`}
                  >
                    {getDriverState(selectedDriver).icon}{" "}
                    {getDriverState(selectedDriver).label}
                  </span>
                </div>

                <DetailRow
                  label={t("m4.tracking.lastLocation")}
                  value={getTimeAgo(selectedDriver.lastLocationUpdate)}
                />

                <DetailRow
                  label={t("m4.tracking.latitude")}
                  value={
                    selectedDriver.currentLat?.toFixed(6) || t("m4.tracking.locationUnavailable")
                  }
                />
                <DetailRow
                  label={t("m4.tracking.longitude")}
                  value={
                    selectedDriver.currentLng?.toFixed(6) || t("m4.tracking.locationUnavailable")
                  }
                />
              </div>

              <div className="grid grid-cols-2 gap-3 mt-5">
                <a
                  href={`tel:${selectedDriver.phone}`}
                  className="text-center px-3 py-3 bg-blue-50 text-blue-700 rounded-2xl text-sm font-black hover:bg-blue-100"
                >
                  📞 {t("m4.tracking.call")}
                </a>

                <button
                  onClick={() => openGoogleMaps(selectedDriver)}
                  disabled={!selectedDriver.currentLat || !selectedDriver.currentLng}
                  className="px-3 py-3 bg-green-700 text-white rounded-2xl text-sm font-black hover:bg-green-800 disabled:opacity-50"
                >
                  🗺️ {t("m4.tracking.openMap")}
                </button>
              </div>

              {selectedDriver.locationHistory?.length > 0 && (
                <div className="mt-6">
                  <h3 className="font-black text-gray-900 mb-2">
                    {t("m4.tracking.locationHistory")}
                  </h3>

                  <div className="bg-gray-50 rounded-2xl p-3 max-h-64 overflow-y-auto">
                    {selectedDriver.locationHistory
                      .slice(0, 10)
                      .map((loc, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between gap-3 py-2 border-b border-gray-200 last:border-b-0"
                        >
                          <span className="text-xs font-mono text-gray-700">
                            {loc.lat.toFixed(6)}, {loc.lng.toFixed(6)}
                          </span>
                          <span className="text-xs text-gray-500">
                            {formatMarketDateTime(loc.timestamp, locale)}
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="text-center p-8">
              <div className="text-5xl mb-3">👈</div>
              <h3 className="font-black text-gray-900 mb-1">
                {t("m4.tracking.selectDriver")}
              </h3>
              <p className="text-sm text-gray-500">
                {t("m4.tracking.selectHelp")}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "gray" | "green" | "blue" | "amber";
}) {
  const styles = {
    gray: "bg-gray-50 border-gray-200 text-gray-700",
    green: "bg-green-50 border-green-200 text-green-700",
    blue: "bg-blue-50 border-blue-200 text-blue-700",
    amber: "bg-amber-50 border-amber-200 text-amber-700",
  };

  return (
    <div className={`border rounded-2xl p-4 ${styles[tone]}`}>
      <div className="text-2xl font-black">{value}</div>
      <div className="text-xs font-bold">{label}</div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-start gap-3">
      <span className="text-gray-500 text-xs font-bold">{label}</span>
      <span className="text-gray-900 font-semibold text-right max-w-[60%] break-words">
        {value}
      </span>
    </div>
  );
}
