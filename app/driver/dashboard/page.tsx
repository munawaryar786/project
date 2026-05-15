"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import BrandLogo from "@/components/shared/BrandLogo";

interface Booking {
  id: string;
  bookingRef: string;
  status: string;
  serviceType: string;
  pickupAddress: string;
  dropoffAddress: string;
  scheduledDate: string;
  scheduledTime: string;
  passengerCount: number;
  wheelchairNeeded: boolean;
  customerName: string;
  customerPhone: string;
  customerPhoneCode: string;
  paymentMethod: string;
  cashAgreed: boolean;
  specialNotes: string | null;
  flightNumber: string | null;
  waitAndGreet: boolean;
  luggageType: string;
}

interface RideRequest {
  id: string;
  bookingId: string;
  driverId: string;
  status: string;
  expiresAt: string;
  booking: Booking;
}

export default function DriverDashboard() {
  const router = useRouter();

  const [driver, setDriver] = useState<any>(null);
  const [isOnline, setIsOnline] = useState(false);
  const [availabilityUpdating, setAvailabilityUpdating] = useState(false);

  const [todayBookings, setTodayBookings] = useState<Booking[]>([]);
  const [upcomingBookings, setUpcomingBookings] = useState<Booking[]>([]);
  const [completedBookings, setCompletedBookings] = useState<Booking[]>([]);

  const [rideRequests, setRideRequests] = useState<RideRequest[]>([]);
  const [requestUpdating, setRequestUpdating] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [expandedBooking, setExpandedBooking] = useState<string | null>(null);
  const [showCashModal, setShowCashModal] = useState<string | null>(null);

  const [locationStatus, setLocationStatus] = useState<
    "idle" | "tracking" | "blocked" | "unsupported" | "error"
  >("idle");
  const [lastGpsUpdate, setLastGpsUpdate] = useState<string>("");

  useEffect(() => {
    const driverData =
      localStorage.getItem("drivo-driver") ||
      localStorage.getItem("drivo-driver-user");

    if (!driverData) {
      router.push("/driver/login");
      return;
    }

    const parsed = JSON.parse(driverData);
    setDriver(parsed);
    setIsOnline(Boolean(parsed.isOnline));

    fetchBookings(parsed.id);
    fetchRideRequests(parsed.id);

    const interval = setInterval(() => {
      fetchRideRequests(parsed.id);
    }, 5000);

    return () => clearInterval(interval);
  }, [router]);

  useEffect(() => {
    if (!driver || !isOnline) {
      setLocationStatus("idle");
      return;
    }

    if (!("geolocation" in navigator)) {
      setLocationStatus("unsupported");
      return;
    }

    let lastSentAt = 0;

    const watchId = navigator.geolocation.watchPosition(
      async (position) => {
        const now = Date.now();

        if (now - lastSentAt < 8000) return;
        lastSentAt = now;

        try {
          setLocationStatus("tracking");

          const res = await fetch("/api/driver/location", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              driverId: driver.id,
              lat: position.coords.latitude,
              lng: position.coords.longitude,
            }),
          });

          if (!res.ok) {
            setLocationStatus("error");
            return;
          }

          setLastGpsUpdate(new Date().toLocaleTimeString("sk-SK"));
        } catch (err) {
          console.error("Location update failed:", err);
          setLocationStatus("error");
        }
      },
      (err) => {
        console.error("GPS error:", err);

        if (err.code === err.PERMISSION_DENIED) {
          setLocationStatus("blocked");
        } else {
          setLocationStatus("error");
        }
      },
      {
        enableHighAccuracy: true,
        maximumAge: 10000,
        timeout: 15000,
      }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [driver, isOnline]);

  const safeJson = async (res: Response) => {
    const text = await res.text();
    if (!text) return {};
    try {
      return JSON.parse(text);
    } catch {
      return {};
    }
  };

  const fetchBookings = async (driverId: string) => {
    try {
      const res = await fetch(`/api/driver/bookings?driverId=${driverId}`, {
        cache: "no-store",
      });
      const data: any = await safeJson(res);

      setTodayBookings(data.todayBookings || []);
      setUpcomingBookings(data.upcomingBookings || []);
      setCompletedBookings(data.completedBookings || []);
    } catch (err) {
      console.error("Failed to fetch bookings:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchRideRequests = async (driverId: string) => {
    try {
      const res = await fetch(`/api/driver/ride-requests?driverId=${driverId}`, {
        cache: "no-store",
      });
      const data: any = await safeJson(res);

      if (res.ok) {
        setRideRequests(data.rideRequests || []);
      }
    } catch (err) {
      console.error("Failed to fetch ride requests:", err);
    }
  };

  const toggleAvailability = async () => {
    if (!driver) return;

    const nextStatus = !isOnline;
    setAvailabilityUpdating(true);

    try {
      const res = await fetch("/api/driver/availability", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          driverId: driver.id,
          isOnline: nextStatus,
        }),
      });

      const data: any = await safeJson(res);

      if (!res.ok) {
        alert(data.error || "Nepodarilo sa zmeniť dostupnosť.");
        return;
      }

      const updatedDriver = { ...driver, isOnline: nextStatus };

      setDriver(updatedDriver);
      setIsOnline(nextStatus);

      localStorage.setItem("drivo-driver", JSON.stringify(updatedDriver));
      localStorage.setItem("drivo-driver-user", JSON.stringify(updatedDriver));
    } catch (err) {
      console.error("Availability update failed:", err);
      alert("Nepodarilo sa zmeniť dostupnosť.");
    } finally {
      setAvailabilityUpdating(false);
    }
  };

  const respondToRideRequest = async (
    requestId: string,
    action: "ACCEPT" | "REJECT"
  ) => {
    if (!driver) return;

    setRequestUpdating(requestId);

    try {
      const res = await fetch("/api/driver/ride-requests/respond", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId,
          driverId: driver.id,
          action,
        }),
      });

      const data: any = await safeJson(res);

      if (!res.ok) {
        alert(data.error || "Nepodarilo sa odpovedať na požiadavku.");
        return;
      }

      await fetchRideRequests(driver.id);
      await fetchBookings(driver.id);
    } catch (err) {
      console.error("Ride request response failed:", err);
      alert("Nepodarilo sa odpovedať na požiadavku.");
    } finally {
      setRequestUpdating(null);
    }
  };

  const updateStatus = async (
    bookingId: string,
    newStatus: string,
    cashConfirmed = false
  ) => {
    if (!driver) return;

    setUpdating(bookingId);

    try {
      const res = await fetch("/api/driver/status", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookingId,
          driverId: driver.id,
          newStatus,
          cashConfirmed,
        }),
      });

      const data: any = await safeJson(res);

      if (!res.ok) {
        alert(data.error || "Nepodarilo sa zmeniť stav jazdy.");
        return;
      }

      await fetchBookings(driver.id);
      setShowCashModal(null);
    } catch (err) {
      console.error("Status update failed:", err);
      alert("Nepodarilo sa zmeniť stav jazdy.");
    } finally {
      setUpdating(null);
    }
  };

  const allActive = useMemo(
    () => [...todayBookings, ...upcomingBookings],
    [todayBookings, upcomingBookings]
  );

  const activeTrip = allActive.find((booking) =>
    ["ASSIGNED", "CONFIRMED", "DRIVER_ENROUTE", "IN_PROGRESS"].includes(
      booking.status
    )
  );

  const hasBookings = allActive.length > 0 || completedBookings.length > 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="text-5xl animate-pulse mb-3">🚗</div>
          <p className="text-gray-500">Načítavam jazdy...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-24">
      <div className="mb-6 bg-white border border-gray-200 rounded-3xl p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
            <BrandLogo className="h-12 w-36 shrink-0" />
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-400 font-bold">
                Panel vodiča
              </p>
              <h1 className="text-2xl font-black text-gray-900">
                Dobrý deň, {driver?.fullName} 👋
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                {activeTrip
                  ? `Aktívna jazda: ${activeTrip.bookingRef}`
                  : allActive.length > 0
                  ? `Máte ${allActive.length} aktívnych jázd`
                  : "Zatiaľ žiadne priradené jazdy"}
              </p>
            </div>
          </div>

          <button
            onClick={toggleAvailability}
            disabled={availabilityUpdating}
            className={`px-6 py-3 rounded-2xl font-black text-sm transition-colors ${
              isOnline
                ? "bg-green-700 text-white hover:bg-green-800"
                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
            } disabled:opacity-50`}
          >
            {availabilityUpdating
              ? "⏳ Aktualizujem..."
              : isOnline
              ? "🟢 Online"
              : "⚫ Ísť online"}
          </button>
        </div>

        <div
          className={`mt-4 text-xs font-semibold rounded-2xl px-4 py-3 ${
            isOnline
              ? "bg-green-50 text-green-700 border border-green-200"
              : "bg-gray-50 text-gray-600 border border-gray-200"
          }`}
        >
          {isOnline
            ? "Ste dostupný pre nové jazdy."
            : "Ste offline a nebudete dostávať nové jazdy."}
        </div>

        <LocationStatusCard
          status={locationStatus}
          isOnline={isOnline}
          lastGpsUpdate={lastGpsUpdate}
        />
      </div>

      {rideRequests.length > 0 && (
        <div className="mb-6 space-y-4">
          {rideRequests.map((request) => (
            <IncomingRideRequestCard
              key={request.id}
              request={request}
              updating={requestUpdating === request.id}
              onAccept={() => respondToRideRequest(request.id, "ACCEPT")}
              onReject={() => respondToRideRequest(request.id, "REJECT")}
            />
          ))}
        </div>
      )}

      {activeTrip && (
        <div className="mb-6">
          <h2 className="text-base font-black text-gray-900 mb-3">
            🚦 Aktívna jazda
          </h2>
          <ActiveTripCard
            booking={activeTrip}
            updating={updating === activeTrip.id}
            onStatusUpdate={updateStatus}
            onCashConfirm={() => setShowCashModal(activeTrip.id)}
          />
        </div>
      )}

      <div className="grid grid-cols-3 gap-3 mb-6">
        <StatCard label="Dnes" value={todayBookings.length} tone="amber" />
        <StatCard label="Budúce" value={upcomingBookings.length} tone="blue" />
        <StatCard label="Hotové" value={completedBookings.length} tone="green" />
      </div>

      <button
        onClick={() => {
          if (driver) {
            fetchBookings(driver.id);
            fetchRideRequests(driver.id);
          }
        }}
        className="w-full mb-6 py-3 bg-white border border-gray-200 rounded-2xl text-sm font-bold text-gray-600 hover:bg-gray-50 transition-colors"
      >
        🔄 Obnoviť
      </button>

      {showCashModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl">
            <div className="text-center">
              <div className="text-5xl mb-3">💵</div>
              <h3 className="text-xl font-black text-gray-900 mb-2">
                Potvrdenie hotovosti
              </h3>
              <p className="text-sm text-gray-600 mb-4">
                Prijali ste hotovosť od zákazníka{" "}
                <strong>PRED začiatkom jazdy</strong>?
              </p>

              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 p-3 rounded-2xl mb-4">
                ⚠️ Jazda nemôže začať bez potvrdenia platby.
              </p>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowCashModal(null)}
                  className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-2xl text-sm font-black hover:bg-gray-200"
                >
                  ❌ Nie
                </button>

                <button
                  onClick={() =>
                    updateStatus(showCashModal, "IN_PROGRESS", true)
                  }
                  disabled={updating === showCashModal}
                  className="flex-1 py-3 bg-green-700 text-white rounded-2xl text-sm font-black hover:bg-green-800 disabled:opacity-50"
                >
                  {updating === showCashModal ? "⏳..." : "✅ Áno"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {todayBookings.length > 0 && (
        <BookingSection
          title="📅 Dnes"
          bookings={todayBookings}
          expandedBooking={expandedBooking}
          setExpandedBooking={setExpandedBooking}
          updateStatus={updateStatus}
          setShowCashModal={setShowCashModal}
          updating={updating}
        />
      )}

      {upcomingBookings.length > 0 && (
        <BookingSection
          title="📆 Nadchádzajúce"
          bookings={upcomingBookings}
          expandedBooking={expandedBooking}
          setExpandedBooking={setExpandedBooking}
          updateStatus={updateStatus}
          setShowCashModal={setShowCashModal}
          updating={updating}
        />
      )}

      {completedBookings.length > 0 && (
        <div className="mb-6">
          <h2 className="text-base font-black text-gray-900 mb-3">
            ✅ Dokončené
          </h2>

          <div className="space-y-3">
            {completedBookings.slice(0, 5).map((booking) => (
              <div
                key={booking.id}
                className="bg-white border border-gray-200 rounded-2xl p-4 opacity-70"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <span className="text-xs font-mono text-gray-400">
                      {booking.bookingRef}
                    </span>
                    <p className="text-sm font-semibold text-gray-700">
                      {booking.pickupAddress} → {booking.dropoffAddress}
                    </p>
                  </div>
                  <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full font-bold">
                    ✅ DOKONČENÉ
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!hasBookings && rideRequests.length === 0 && (
        <div className="bg-white rounded-3xl border border-gray-200 p-12 text-center">
          <div className="text-6xl mb-4">🚗</div>
          <h3 className="text-lg font-black text-gray-900 mb-2">
            Žiadne priradené jazdy
          </h3>
          <p className="text-gray-500 text-sm">
            Keď vám admin priradí jazdu alebo systém pošle request, zobrazí sa
            tu.
          </p>
        </div>
      )}
    </div>
  );
}

function LocationStatusCard({
  status,
  isOnline,
  lastGpsUpdate,
}: {
  status: string;
  isOnline: boolean;
  lastGpsUpdate: string;
}) {
  if (!isOnline) {
    return (
      <div className="mt-3 bg-gray-50 border border-gray-200 text-gray-600 rounded-2xl px-4 py-3 text-xs font-bold">
        📍 GPS sledovanie je vypnuté, pretože vodič je offline.
      </div>
    );
  }

  const content: Record<string, string> = {
    idle: "📍 GPS pripravené. Poloha sa začne odosielať po povolení prehliadača.",
    tracking: `🛰️ GPS aktívne. Posledná aktualizácia: ${
      lastGpsUpdate || "práve teraz"
    }`,
    blocked:
      "🚫 GPS poloha je zablokovaná. Povoľte Location v prehliadači pre live tracking.",
    unsupported: "⚠️ Tento prehliadač nepodporuje GPS polohu.",
    error: "⚠️ Nepodarilo sa odoslať GPS polohu. Skontrolujte povolenia.",
  };

  const styles: Record<string, string> = {
    idle: "bg-blue-50 border-blue-200 text-blue-700",
    tracking: "bg-green-50 border-green-200 text-green-700",
    blocked: "bg-red-50 border-red-200 text-red-700",
    unsupported: "bg-amber-50 border-amber-200 text-amber-700",
    error: "bg-amber-50 border-amber-200 text-amber-700",
  };

  return (
    <div
      className={`mt-3 border rounded-2xl px-4 py-3 text-xs font-bold ${
        styles[status] || styles.idle
      }`}
    >
      {content[status] || content.idle}
    </div>
  );
}

function IncomingRideRequestCard({
  request,
  updating,
  onAccept,
  onReject,
}: {
  request: RideRequest;
  updating: boolean;
  onAccept: () => void;
  onReject: () => void;
}) {
  const [secondsLeft, setSecondsLeft] = useState(30);

  useEffect(() => {
    const calculate = () => {
      const diff = Math.max(
        0,
        Math.ceil((new Date(request.expiresAt).getTime() - Date.now()) / 1000)
      );
      setSecondsLeft(diff);
    };

    calculate();
    const interval = setInterval(calculate, 1000);
    return () => clearInterval(interval);
  }, [request.expiresAt]);

  return (
    <div className="bg-gradient-to-br from-green-600 to-green-800 text-white rounded-[2rem] p-5 shadow-2xl border-4 border-green-300">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-xs uppercase tracking-wider opacity-80 font-bold">
            Nová požiadavka
          </p>
          <h2 className="text-2xl font-black mt-1">
            🚕 {request.booking?.bookingRef}
          </h2>
        </div>

        <div className="bg-white/20 rounded-2xl px-4 py-3 text-center">
          <div className="text-2xl font-black">{secondsLeft}s</div>
          <div className="text-[10px] uppercase font-bold">Čas</div>
        </div>
      </div>

      <div className="bg-white/10 rounded-3xl p-4 space-y-3">
        <div>
          <p className="text-[11px] uppercase opacity-70 font-bold">
            Vyzdvihnutie
          </p>
          <p className="font-bold">📍 {request.booking?.pickupAddress}</p>
        </div>

        <div>
          <p className="text-[11px] uppercase opacity-70 font-bold">Cieľ</p>
          <p className="font-bold">🏁 {request.booking?.dropoffAddress}</p>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="bg-white/10 rounded-2xl p-3 font-bold">
            👥 {request.booking?.passengerCount} osôb
          </div>
          <div className="bg-white/10 rounded-2xl p-3 font-bold">
            💳 {request.booking?.paymentMethod}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mt-5">
        <button
          onClick={onReject}
          disabled={updating || secondsLeft <= 0}
          className="py-4 rounded-3xl bg-red-500 hover:bg-red-600 text-white font-black disabled:opacity-50"
        >
          {updating ? "⏳..." : "❌ Odmietnuť"}
        </button>

        <button
          onClick={onAccept}
          disabled={updating || secondsLeft <= 0}
          className="py-4 rounded-3xl bg-white text-green-700 hover:bg-green-50 font-black disabled:opacity-50"
        >
          {updating ? "⏳..." : "✅ Prijať"}
        </button>
      </div>
    </div>
  );
}

function ActiveTripCard({
  booking,
  updating,
  onStatusUpdate,
  onCashConfirm,
}: {
  booking: Booking;
  updating: boolean;
  onStatusUpdate: (id: string, status: string, cash?: boolean) => void;
  onCashConfirm: () => void;
}) {
  const nextAction = getNextAction(booking);

  return (
    <div className="bg-gray-950 text-white rounded-[2rem] p-5 shadow-xl">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <p className="text-xs text-gray-400 uppercase font-bold">
            {booking.bookingRef}
          </p>
          <h3 className="text-xl font-black mt-1">
            {getStatusEmoji(booking.status)} {formatStatus(booking.status)}
          </h3>
        </div>

        <span className="bg-white/10 px-3 py-2 rounded-2xl text-xs font-black">
          {booking.serviceType}
        </span>
      </div>

      <div className="bg-white/10 rounded-3xl p-4 space-y-3 mb-4">
        <div>
          <p className="text-[11px] text-gray-400 uppercase font-bold">
            Vyzdvihnutie
          </p>
          <p className="font-bold">📍 {booking.pickupAddress}</p>
        </div>

        <div>
          <p className="text-[11px] text-gray-400 uppercase font-bold">Cieľ</p>
          <p className="font-bold">🏁 {booking.dropoffAddress}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4 text-sm">
        <a
          href={`tel:${booking.customerPhoneCode}${booking.customerPhone}`}
          className="text-center py-3 bg-blue-600 rounded-2xl font-black"
        >
          📞 Zavolať
        </a>

        <a
          href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
            booking.pickupAddress
          )}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-center py-3 bg-white text-gray-950 rounded-2xl font-black"
        >
          🗺️ Navigovať
        </a>
      </div>

      {booking.paymentMethod === "CASH" &&
        booking.status === "DRIVER_ENROUTE" && (
          <div className="p-3 bg-amber-100 text-amber-900 rounded-2xl mb-4">
            <p className="text-sm font-black">
              ⚠️ Hotovosť musí byť prijatá pred začiatkom jazdy
            </p>
          </div>
        )}

      {nextAction && (
        <button
          onClick={() => {
            if (nextAction.nextStatus === "CASH_CONFIRM") {
              onCashConfirm();
            } else {
              onStatusUpdate(booking.id, nextAction.nextStatus);
            }
          }}
          disabled={updating}
          className="w-full py-4 bg-green-600 hover:bg-green-700 text-white font-black rounded-3xl disabled:opacity-50"
        >
          {updating ? "⏳ Aktualizujem..." : nextAction.label}
        </button>
      )}
    </div>
  );
}

function BookingSection({
  title,
  bookings,
  expandedBooking,
  setExpandedBooking,
  updateStatus,
  setShowCashModal,
  updating,
}: {
  title: string;
  bookings: Booking[];
  expandedBooking: string | null;
  setExpandedBooking: (id: string | null) => void;
  updateStatus: (id: string, status: string, cash?: boolean) => void;
  setShowCashModal: (id: string | null) => void;
  updating: string | null;
}) {
  return (
    <div className="mb-6">
      <h2 className="text-base font-black text-gray-900 mb-3">{title}</h2>
      <div className="space-y-3">
        {bookings.map((booking) => (
          <BookingCard
            key={booking.id}
            booking={booking}
            expanded={expandedBooking === booking.id}
            onToggle={() =>
              setExpandedBooking(
                expandedBooking === booking.id ? null : booking.id
              )
            }
            onStatusUpdate={updateStatus}
            onCashConfirm={() => setShowCashModal(booking.id)}
            updating={updating === booking.id}
          />
        ))}
      </div>
    </div>
  );
}

function BookingCard({
  booking,
  expanded,
  onToggle,
  onStatusUpdate,
  onCashConfirm,
  updating,
}: {
  booking: Booking;
  expanded: boolean;
  onToggle: () => void;
  onStatusUpdate: (id: string, status: string, cash?: boolean) => void;
  onCashConfirm: () => void;
  updating: boolean;
}) {
  const nextAction = getNextAction(booking);

  return (
    <div className="bg-white border border-gray-200 rounded-3xl overflow-hidden shadow-sm">
      <button onClick={onToggle} className="w-full p-4 text-left">
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-xl">
              {getServiceIcon(booking.serviceType)}
            </span>
            <span className="text-xs font-mono text-gray-400">
              {booking.bookingRef}
            </span>
          </div>
          <StatusBadge status={booking.status} />
        </div>

        <div className="space-y-1">
          <p className="text-sm font-bold text-gray-900 truncate">
            📍 {booking.pickupAddress}
          </p>
          <p className="text-sm font-bold text-gray-900 truncate">
            🏁 {booking.dropoffAddress}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-gray-500">
          <span>📅 {booking.scheduledDate}</span>
          <span>⏰ {booking.scheduledTime}</span>
          <span>👥 {booking.passengerCount}</span>
          {booking.wheelchairNeeded && <span>♿</span>}
          {booking.paymentMethod === "CASH" && (
            <span className="text-amber-600 font-bold">💵 CASH</span>
          )}
        </div>

        <div className="text-xs text-gray-400 mt-2">
          {expanded ? "▲ Menej" : "▼ Viac detailov"}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-gray-100 pt-3 space-y-3">
          <div className="bg-gray-50 rounded-2xl p-3">
            <p className="text-xs font-bold text-gray-500 mb-1">ZÁKAZNÍK</p>
            <p className="text-sm font-bold">{booking.customerName}</p>

            <div className="flex gap-2 mt-2">
              <a
                href={`tel:${booking.customerPhoneCode}${booking.customerPhone}`}
                className="flex-1 text-center py-2 bg-blue-50 text-blue-700 rounded-xl text-xs font-bold"
              >
                📞 Zavolať
              </a>

              <a
                href={`https://wa.me/${booking.customerPhoneCode.replace(
                  "+",
                  ""
                )}${booking.customerPhone}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 text-center py-2 bg-green-50 text-green-700 rounded-xl text-xs font-bold"
              >
                💬 WhatsApp
              </a>
            </div>
          </div>

          <div className="text-xs space-y-1 text-gray-600">
            <InfoRow label="Batožina" value={booking.luggageType} />
            <InfoRow label="Platba" value={booking.paymentMethod} />
            {booking.flightNumber && (
              <InfoRow label="Let" value={`✈️ ${booking.flightNumber}`} />
            )}
            {booking.waitAndGreet && (
              <InfoRow label="Wait & Greet" value="✅ Áno" />
            )}
            {booking.specialNotes && (
              <div className="mt-2 p-2 bg-amber-50 rounded-xl">
                <span className="font-bold">📝 Poznámky: </span>
                {booking.specialNotes}
              </div>
            )}
          </div>

          {nextAction && (
            <button
              onClick={() => {
                if (nextAction.nextStatus === "CASH_CONFIRM") {
                  onCashConfirm();
                } else {
                  onStatusUpdate(booking.id, nextAction.nextStatus);
                }
              }}
              disabled={updating}
              className="w-full py-3 bg-green-700 hover:bg-green-800 text-white font-black rounded-2xl text-sm disabled:opacity-50"
            >
              {updating ? "⏳ Aktualizujem..." : nextAction.label}
            </button>
          )}

          <a
            href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
              booking.pickupAddress
            )}`}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full py-3 bg-blue-50 text-blue-700 font-bold rounded-2xl text-sm text-center hover:bg-blue-100"
          >
            🗺️ Navigovať k zákazníkovi
          </a>
        </div>
      )}
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
  tone: "amber" | "blue" | "green";
}) {
  const styles = {
    amber: "bg-amber-50 border-amber-200 text-amber-700",
    blue: "bg-blue-50 border-blue-200 text-blue-700",
    green: "bg-green-50 border-green-200 text-green-700",
  };

  return (
    <div className={`border rounded-2xl p-3 text-center ${styles[tone]}`}>
      <div className="text-2xl font-black">{value}</div>
      <div className="text-xs font-bold">{label}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    ASSIGNED: "bg-purple-100 text-purple-700",
    CONFIRMED: "bg-blue-100 text-blue-700",
    DRIVER_ENROUTE: "bg-cyan-100 text-cyan-700",
    IN_PROGRESS: "bg-amber-100 text-amber-700",
    COMPLETED: "bg-green-100 text-green-700",
  };

  return (
    <span
      className={`text-xs px-2 py-1 rounded-full font-black ${
        styles[status] || "bg-gray-100 text-gray-600"
      }`}
    >
      {formatStatus(status)}
    </span>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span>{label}:</span>
      <span className="font-bold">{value}</span>
    </div>
  );
}

function getNextAction(booking: Booking) {
  switch (booking.status) {
    case "ASSIGNED":
    case "CONFIRMED":
      return {
        label: "🚗 Som na ceste",
        nextStatus: "DRIVER_ENROUTE",
      };
    case "DRIVER_ENROUTE":
      if (booking.paymentMethod === "CASH") {
        return {
          label: "💵 Potvrdiť hotovosť + začať",
          nextStatus: "CASH_CONFIRM",
        };
      }
      return {
        label: "🚕 Začať jazdu",
        nextStatus: "IN_PROGRESS",
      };
    case "IN_PROGRESS":
      return {
        label: "✅ Dokončiť jazdu",
        nextStatus: "COMPLETED",
      };
    default:
      return null;
  }
}

function getServiceIcon(type: string) {
  const icons: Record<string, string> = {
    STANDARD: "🚕",
    ACCESSIBLE: "♿",
    SENIOR: "👴",
    CHILDREN: "👶",
    AIRPORT: "✈️",
  };

  return icons[type] || "🚗";
}

function getStatusEmoji(status: string) {
  const icons: Record<string, string> = {
    ASSIGNED: "📌",
    CONFIRMED: "✅",
    DRIVER_ENROUTE: "🚗",
    IN_PROGRESS: "🚕",
    COMPLETED: "🏁",
  };

  return icons[status] || "🚗";
}

function formatStatus(status: string) {
  const labels: Record<string, string> = {
    ASSIGNED: "Priradené",
    CONFIRMED: "Potvrdené",
    DRIVER_ENROUTE: "Na ceste",
    IN_PROGRESS: "Prebieha",
    COMPLETED: "Dokončené",
    PENDING: "Čaká",
    CANCELLED: "Zrušené",
  };

  return labels[status] || status.replaceAll("_", " ");
}
