"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

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

  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDriver, setSelectedDriver] = useState<Driver | null>(null);
  const [lastUpdate, setLastUpdate] = useState<string>("");

  useEffect(() => {
    checkAuth();
    fetchDrivers();

    const interval = setInterval(fetchDrivers, 10000);
    return () => clearInterval(interval);
  }, []);

  const checkAuth = () => {
    const token = localStorage.getItem("drivo-admin-access-token");
    if (!token) {
      router.push("/admin/login");
    }
  };

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
      const token = localStorage.getItem("drivo-admin-access-token");

      const res = await fetch("/api/admin/drivers/tracking", {
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data: any = await safeJson(res);

      if (res.ok) {
        setDrivers(data.drivers || []);
        setLastUpdate(new Date().toLocaleTimeString("sk-SK"));
      }
    } catch (err) {
      console.error("Failed to fetch drivers:", err);
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
    if (!timestamp) return "Nikdy";

    const date = new Date(timestamp);
    const now = new Date();
    const diff = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diff < 60) return `pred ${diff} s`;
    if (diff < 3600) return `pred ${Math.floor(diff / 60)} min`;
    if (diff < 86400) return `pred ${Math.floor(diff / 3600)} h`;
    return `pred ${Math.floor(diff / 86400)} d`;
  };

  const getDriverState = (driver: Driver) => {
    if (driver.isOnTrip) {
      return {
        label: "Na jazde",
        icon: "🚕",
        className: "bg-amber-100 text-amber-800 border-amber-200",
      };
    }

    if (driver.isOnline) {
      return {
        label: "Dostupný",
        icon: "🟢",
        className: "bg-green-100 text-green-800 border-green-200",
      };
    }

    return {
      label: "Offline",
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
          <p className="text-gray-500">Načítavam sledovanie vodičov...</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-400 font-bold">
            Admin operácie
          </p>
          <h1 className="text-2xl font-black text-gray-900">
            🗺️ Sledovanie vodičov
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Posledná aktualizácia: {lastUpdate || "Načítava sa..."}
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={fetchDrivers}
            className="px-4 py-2 bg-green-700 text-white rounded-xl hover:bg-green-800 transition-colors text-sm font-bold"
          >
            🔄 Obnoviť
          </button>

          <button
            onClick={() => router.push("/admin/dashboard")}
            className="px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors text-sm font-bold"
          >
            ← Späť na dashboard
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
        <StatCard label="Všetci" value={stats.total} tone="gray" />
        <StatCard label="Online" value={stats.online} tone="green" />
        <StatCard label="Dostupní" value={stats.available} tone="blue" />
        <StatCard label="Na jazde" value={stats.onTrip} tone="amber" />
        <StatCard label="Offline" value={stats.offline} tone="gray" />
      </div>

      <div className="grid lg:grid-cols-[1fr,420px] gap-6">
        <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-black text-gray-900">Vodiči v prevádzke</h2>
            <span className="text-xs text-gray-400 font-bold">
              Auto-refresh 10 s
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
                        🚕 {driver.vehicleType || "Vozidlo nezadané"}
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
                          Poloha zatiaľ nie je dostupná
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
                Žiadni vodiči
              </h3>
              <p className="text-gray-500">
                Momentálne nie sú dostupní žiadni aktívni vodiči.
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
                    Detail vodiča
                  </p>
                  <h2 className="text-xl font-black text-gray-900">
                    {selectedDriver.fullName}
                  </h2>
                </div>

                <button
                  onClick={() => setSelectedDriver(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-3 text-sm">
                <DetailRow label="Telefón" value={selectedDriver.phone} />
                <DetailRow
                  label="Email"
                  value={selectedDriver.email || "Nezadaný"}
                />
                <DetailRow
                  label="Vozidlo"
                  value={`${selectedDriver.vehicleType || "N/A"} • ${
                    selectedDriver.vehiclePlate || "N/A"
                  }`}
                />
                <DetailRow label="Stav účtu" value={selectedDriver.status} />

                <div className="flex justify-between items-start gap-3">
                  <span className="text-gray-500 text-xs font-bold">
                    Prevádzkový stav
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
                  label="Posledná poloha"
                  value={getTimeAgo(selectedDriver.lastLocationUpdate)}
                />

                <DetailRow
                  label="Latitude"
                  value={
                    selectedDriver.currentLat?.toFixed(6) || "Nedostupné"
                  }
                />
                <DetailRow
                  label="Longitude"
                  value={
                    selectedDriver.currentLng?.toFixed(6) || "Nedostupné"
                  }
                />
              </div>

              <div className="grid grid-cols-2 gap-3 mt-5">
                <a
                  href={`tel:${selectedDriver.phone}`}
                  className="text-center px-3 py-3 bg-blue-50 text-blue-700 rounded-2xl text-sm font-black hover:bg-blue-100"
                >
                  📞 Zavolať
                </a>

                <button
                  onClick={() => openGoogleMaps(selectedDriver)}
                  disabled={!selectedDriver.currentLat || !selectedDriver.currentLng}
                  className="px-3 py-3 bg-green-700 text-white rounded-2xl text-sm font-black hover:bg-green-800 disabled:opacity-50"
                >
                  🗺️ Otvoriť mapu
                </button>
              </div>

              {selectedDriver.locationHistory?.length > 0 && (
                <div className="mt-6">
                  <h3 className="font-black text-gray-900 mb-2">
                    História polohy
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
                            {new Date(loc.timestamp).toLocaleString("sk-SK")}
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
                Vyberte vodiča
              </h3>
              <p className="text-sm text-gray-500">
                Kliknite na vodiča pre detail polohy a prevádzkového stavu.
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