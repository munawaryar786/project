"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import BrandLogo from "@/components/shared/BrandLogo";
import LanguageSwitcher from "@/components/shared/LanguageSwitcher";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { ACTIVE_TRIP_STATUSES } from "@/lib/driver-state";
import { csrfFetch } from "@/lib/client/csrf-fetch";
import { io } from "socket.io-client";
import { DriverNavigationPanel } from "@/components/driver/DriverNavigation";
import { DriverEarningsPanel } from "@/components/driver/DriverEarningsPanel";
import { ScheduledMarketplace } from "@/components/driver/ScheduledMarketplace";

interface Booking {
  id: string;
  bookingRef: string;
  status: string;
  serviceType: string;
  pickupAddress?: string;
  dropoffAddress?: string;
  pickupArea?: string;
  dropoffArea?: string;
  scheduledDate: string;
  scheduledTime: string;
  passengerCount: number;
  wheelchairNeeded: boolean;
  smallBags?: number;
  largeBags?: number;
  seniorPassenger?: boolean;
  ztpCardHolder?: boolean;
  wheelchairUser?: boolean;
  companionRequired?: boolean;
  medicalAppointment?: boolean;
  waitingTimeRequired?: boolean;
  assistanceLevel?: string | null;
  wheelchairType?: string | null;
  canTransferToSeat?: boolean | null;
  wavRequired?: boolean;
  passengerRemainsInWheelchair?: boolean;
  companionCount?: number;
  hospitalName?: string | null;
  department?: string | null;
  appointmentDate?: string | null;
  appointmentTime?: string | null;
  tripType?: string | null;
  returnDate?: string | null;
  returnTime?: string | null;
  waitingDuration?: string | null;
  customWaitingDuration?: string | null;
  scheduledRide?: boolean;
  pickupAt?: string | null;
  marketTimezone?: string | null;
  recurrence?: string | null;
  recurrenceType?: string | null;
  recurrenceCustom?: string | null;
  childFullName?: string | null;
  childName?: string | null;
  childAge?: number | null;
  childSpecialRequirements?: string | null;
  childrenDetails?: Array<{
    fullName?: string | null;
    age?: number | string | null;
    specialRequirements?: string | null;
  }> | null;
  parentFullName?: string | null;
  guardianName?: string | null;
  parentPrimaryPhone?: string | null;
  guardianPhone?: string | null;
  parentEmergencyPhone?: string | null;
  guardianEmergencyPhone?: string | null;
  parentEmail?: string | null;
  guardianEmail?: string | null;
  educationalInstitutionName?: string | null;
  institutionName?: string | null;
  institutionAddress?: string | null;
  pickupDate?: string | null;
  pickupTime?: string | null;
  customerName: string;
  customerPhone: string;
  customerPhoneCode: string;
  paymentMethod: string;
  cashAgreed: boolean;
  estimatedPrice?: number | null;
  fareTotalFare?: number | null;
  earning?: {
    totalFare: number;
    driverAmount: number;
    platformAmount: number;
    commissionRate: number;
  } | null;
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
  const { t, locale } = useLanguage();

  const [driver, setDriver] = useState<any>(null);
  const [isOnline, setIsOnline] = useState(false);
  const [presenceState, setPresenceState] = useState("OFFLINE");
  const [availabilityUpdating, setAvailabilityUpdating] = useState(false);

  const [todayBookings, setTodayBookings] = useState<Booking[]>([]);
  const [upcomingBookings, setUpcomingBookings] = useState<Booking[]>([]);
  const [completedBookings, setCompletedBookings] = useState<Booking[]>([]);
  const [scheduledReminders, setScheduledReminders] = useState<Array<{ id: string; data: { bookingId: string; pickupAt: string } }>>([]);

  const [rideRequests, setRideRequests] = useState<RideRequest[]>([]);
  const [requestUpdating, setRequestUpdating] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState("");
  const [realtimeStatus, setRealtimeStatus] = useState<"connecting" | "connected" | "offline">("connecting");
  const [financial, setFinancial] = useState({
    dailyEarnings: 0,
    weeklyEarnings: 0,
    monthlyEarnings: 0,
    totalEarnings: 0,
    performanceScore: 0,
    feedbackSummary: "",
    rideCount: 0,
  });
  const [updating, setUpdating] = useState<string | null>(null);
  const [expandedBooking, setExpandedBooking] = useState<string | null>(null);
  const [showCashModal, setShowCashModal] = useState<string | null>(null);
  const cashDialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!showCashModal) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = cashDialogRef.current;
    const focusable = () => Array.from(dialog?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") || []);
    focusable()[0]?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !updating) setShowCashModal(null);
      if (event.key !== "Tab") return;
      const controls = focusable();
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); previous?.focus(); };
  }, [showCashModal, updating]);

  const [locationStatus, setLocationStatus] = useState<
    "idle" | "tracking" | "blocked" | "unsupported" | "error"
  >("idle");
  const [lastGpsUpdate, setLastGpsUpdate] = useState<Date | null>(null);

  async function logout() {
    await csrfFetch("driver", "/api/driver/logout", { method: "POST" }).catch(() => null);
    setDriver(null);
    setIsOnline(false);
    router.push("/driver/login");
  }

  useEffect(() => {
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | undefined;

    const restoreSession = async () => {
      const response = await fetch("/api/driver/me", { cache: "no-store", credentials: "include" });
      if (!response.ok) {
        router.push("/driver/login");
        return;
      }
      const data = await response.json();
      if (cancelled) return;
      setDriver(data.driver);
      setIsOnline(Boolean(data.driver.isOnline));
      await fetchDriverData(data.driver.id);
      interval = setInterval(() => fetchDriverData(data.driver.id, true), 5000);
    };

    void restoreSession();
    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
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

          const res = await csrfFetch("driver", "/api/driver/location", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              lat: position.coords.latitude,
              lng: position.coords.longitude,
              accuracy: position.coords.accuracy,
              clientTimestamp: position.timestamp,
              ...(position.coords.speed !== null ? { speed: position.coords.speed } : {}),
              ...(position.coords.heading !== null ? { heading: position.coords.heading } : {}),
            }),
          });

          if (!res.ok) {
            setLocationStatus("error");
            return;
          }

          setLastGpsUpdate(new Date());
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

  useEffect(() => {
    if (!driver) return;
    const timer = setInterval(() => {
      void csrfFetch("driver", "/api/driver/heartbeat", { method: "POST" }).catch(() => setRefreshError("driverPortal.connectionInterrupted"));
    }, 20000);
    return () => clearInterval(timer);
  }, [driver]);
  useEffect(() => {
    if (!driver) return;
    const socket = io("/driver", { path: "/socket.io", transports: ["websocket"], withCredentials: true, reconnection: true });
    setRealtimeStatus("connecting");
    const refresh = () => { void fetchDriverData(driver.id, true); };
    socket.on("connect", () => setRealtimeStatus("connected"));
    socket.on("disconnect", () => setRealtimeStatus("offline"));
    socket.on("connect_error", () => setRealtimeStatus("offline"));
    ["driver.offer.updated", "booking.updated", "trip.updated", "notification.created"].forEach((event) => socket.on(event, refresh));
    return () => { socket.removeAllListeners(); socket.close(); };
  }, [driver]);

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
      const res = await fetch(`/api/driver/bookings`, {
        cache: "no-store",
      });
      const data: any = await safeJson(res);

      if (!res.ok) throw new Error("driverPortal.bookingsRefreshFailed");
      setTodayBookings(data.todayBookings || []);
      setUpcomingBookings(data.upcomingBookings || []);
      setCompletedBookings(data.completedBookings || []);
    } catch (err) {
      setRefreshError("driverPortal.bookingsRefreshFailed");
    } finally {
      setLoading(false);
    }
  };

  const fetchRideRequests = async (driverId: string) => {
    try {
      const res = await fetch(`/api/driver/ride-requests`, {
        cache: "no-store",
      });
      const data: any = await safeJson(res);

      if (res.ok) {
        setRideRequests(data.rideRequests || []);
        setPresenceState(data.presence || "OFFLINE");
        setIsOnline(Boolean(data.driver?.isOnline));
      } else {
        setRideRequests([]);
        throw new Error("driverPortal.offersRefreshFailed");
      }
    } catch (err) {
      setRideRequests([]);
      setRefreshError("driverPortal.offersRefreshFailed");
    }
  };

  const fetchFinancial = async (driverId: string) => {
    const res = await fetch(`/api/driver/financial-overview`, {
      cache: "no-store",
    });
    const data: any = await safeJson(res);

    if (!res.ok) {
      throw new Error("driverPortal.refreshFailed");
    }

    setFinancial(data.financial || financial);
  };

  const fetchDriverData = async (driverId: string, silent = false) => {
    if (!silent) {
      setRefreshing(true);
      setRefreshError("");
    }

    try {
      await Promise.all([
        fetchBookings(driverId),
        fetchRideRequests(driverId),
        fetchFinancial(driverId),
        fetch("/api/driver/notifications?limit=30", { cache: "no-store" }).then(async (response) => {
          if (!response.ok) throw new Error("notification_refresh_failed");
          const data = await response.json();
          setScheduledReminders((data.notifications || []).filter((item: any) => item.type === "SCHEDULED_RIDE_REMINDER" && !item.readAt).slice(0, 3));
        }).catch(() => { setScheduledReminders([]); setRefreshError("driverPortal.refreshFailed"); }),
      ]);
    } catch (err: any) {
      const message = "driverPortal.refreshFailed";
      setRefreshError(message);
      if (!silent) alert(t(message));
    } finally {
      if (!silent) setRefreshing(false);
    }
  };

  const toggleAvailability = async () => {
    if (!driver) return;

    const nextStatus = !isOnline;
    setAvailabilityUpdating(true);

    try {
      const res = await csrfFetch("driver", "/api/driver/availability", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          isOnline: nextStatus,
        }),
      });

      const data: any = await safeJson(res);

      if (!res.ok) {
        alert(t(driverErrorKey(data.code, "driverPortal.availabilityFailed")));
        return;
      }

      const updatedDriver = { ...driver, isOnline: nextStatus };

      setDriver(updatedDriver);
      setIsOnline(Boolean(data.driver?.isOnline));
      setPresenceState(data.presence || "OFFLINE");
    } catch (err) {
      console.error("Availability update failed:", err);
      alert(t("driverPortal.availabilityFailed"));
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
      const res = await csrfFetch("driver", "/api/driver/ride-requests/respond", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId,
          action,
        }),
      });

      const data: any = await safeJson(res);

      if (!res.ok) {
        alert(t(driverErrorKey(data.code, "driverPortal.offerResponseFailed")));
        return;
      }

      await fetchRideRequests(driver.id);
      await fetchBookings(driver.id);
    } catch (err) {
      console.error("Ride request response failed:", err);
      alert(t("driverPortal.offerResponseFailed"));
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

    const commandByStatus: Record<string, string> = { DRIVER_ENROUTE: "enroute", ARRIVED: "arrived", IN_PROGRESS: "start", COMPLETED: "complete" };
    const command = commandByStatus[newStatus];
    if (!command) { setUpdating(null); return; }

    try {
      const res = await csrfFetch("driver", "/api/driver/bookings/" + bookingId + "/" + command, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cashConfirmed,
        }),
      });

      const data: any = await safeJson(res);

      if (!res.ok) {
        alert(t(driverErrorKey(data.code, "driverPortal.statusUpdateFailed")));
        return;
      }

      await fetchBookings(driver.id);
      setShowCashModal(null);
    } catch (err) {
      console.error("Status update failed:", err);
      alert(t("driverPortal.statusUpdateFailed"));
    } finally {
      setUpdating(null);
    }
  };

  const allActive = useMemo(
    () => [...todayBookings, ...upcomingBookings],
    [todayBookings, upcomingBookings]
  );

  const activeTrip = allActive.find((booking) =>
    (ACTIVE_TRIP_STATUSES as readonly string[]).includes(
      booking.status
    )
  );

  const hasBookings = allActive.length > 0 || completedBookings.length > 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="text-5xl animate-pulse mb-3">🚗</div>
          <p className="text-gray-500">{t("driverPortal.loadingRides")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-24 [&_button]:min-h-11 [&_a]:min-h-11 [&_button:focus-visible]:outline-2 [&_button:focus-visible]:outline-offset-2 [&_button:focus-visible]:outline-blue-700 [&_a:focus-visible]:outline-2 [&_a:focus-visible]:outline-offset-2">
      <div className="mb-6 bg-white border border-gray-200 rounded-3xl p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
            <BrandLogo className="h-12 w-36 shrink-0" />
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-400 font-bold">
                {t("driverPortal.heading")}
              </p>
              <h1 className="text-2xl font-black text-gray-900">
                {t("driverPortal.greeting").replace("{name}", driver?.fullName || "")} 👋
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                {activeTrip
                  ? t("driverPortal.activeRideReference").replace("{reference}", activeTrip.bookingRef)
                  : allActive.length > 0
                  ? t("driverPortal.assignedRidesCount").replace("{count}", String(allActive.length))
                  : t("driverPortal.noAssignedRides")}
              </p>
            </div>
          </div>
          <p aria-live="polite" className="text-xs text-gray-500">{t("driverPortal.realtime")}: {realtimeStatus === "connected" ? t("driverPortal.connected") : realtimeStatus === "connecting" ? t("driverPortal.connecting") : t("driverPortal.realtimePolling")}</p>

          <LanguageSwitcher tone="dark" ariaLabel={t("driverPortal.changeLanguage")} />

          <button
            onClick={toggleAvailability}
            disabled={availabilityUpdating}
            aria-label={isOnline ? t("driverPortal.setOffline") : t("driverPortal.setOnline")}
            className={`px-6 py-3 rounded-2xl font-black text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 ${
              isOnline
                ? "bg-green-700 text-white hover:bg-green-800"
                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
            } disabled:opacity-50`}
          >
            {availabilityUpdating
              ? t("driverPortal.updating")
              : isOnline
              ? t("driverPortal.online")
              : t("driverPortal.goOnline")}
          </button>
          <button
            onClick={() => void logout()}
            aria-label={t("driverPortal.logoutLabel")}
            className="px-4 py-3 rounded-2xl border border-gray-300 font-black text-sm text-gray-700 hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
          >
            {t("driverPortal.logout")}
          </button>
        </div>

        <div
          aria-live="polite"
          className={`mt-4 text-xs font-semibold rounded-2xl px-4 py-3 ${
            isOnline
              ? "bg-green-50 text-green-700 border border-green-200"
              : "bg-gray-50 text-gray-600 border border-gray-200"
          }`}
        >
          {t(`driverPortal.presence.${presenceState}`, t("driverPortal.unavailable"))}
        </div>

        <LocationStatusCard
          status={locationStatus}
          isOnline={isOnline}
          lastGpsUpdate={lastGpsUpdate?.toLocaleTimeString(locale) || ""}
        />
      </div>

      {rideRequests.length > 0 && (
        <div className="mb-6 space-y-4" aria-live="polite">
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
            {t("driverPortal.activeRide")}
          </h2>
          <DriverNavigationPanel
            booking={activeTrip}
            realtimeStatus={realtimeStatus}
            locationStatus={locationStatus}
            updating={updating === activeTrip.id}
            onStatusUpdate={(id, status) => updateStatus(id, status)}
            onCashConfirm={() => setShowCashModal(activeTrip.id)}
          />
          <ActiveTripCard
            booking={activeTrip}
            updating={updating === activeTrip.id}
            onStatusUpdate={updateStatus}
            onCashConfirm={() => setShowCashModal(activeTrip.id)}
            showTripControls={false}
          />
        </div>
      )}

      <ScheduledMarketplace />

      <div className="grid grid-cols-3 gap-3 mb-6">
        <StatCard label={t("driverPortal.today")} value={todayBookings.length} tone="amber" />
        <StatCard label={t("driverPortal.upcoming")} value={upcomingBookings.length} tone="blue" />
        <StatCard label={t("driverPortal.completed")} value={completedBookings.length} tone="green" />
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <MoneyCard label={t("driverPortal.dailyEarnings")} value={financial.dailyEarnings} />
        <MoneyCard label={t("driverPortal.weeklyEarnings")} value={financial.weeklyEarnings} />
        <MoneyCard label={t("driverPortal.monthlyEarnings")} value={financial.monthlyEarnings} />
        <MoneyCard label={t("driverPortal.totalEarnings")} value={financial.totalEarnings} />
        <StatCard label={t("driverPortal.performanceScore")} value={financial.performanceScore} tone="blue" suffix="%" />
        <StatCard label={t("driverPortal.rideCount")} value={financial.rideCount} tone="green" />
        <div className="col-span-2 rounded-2xl border border-gray-200 bg-white p-3">
          <div className="text-xs font-bold text-gray-500">{t("driverPortal.feedback")}</div>
          <div className="mt-1 text-sm font-semibold text-gray-800">
            {financial.feedbackSummary || t("driverPortal.noFeedback")}
          </div>
        </div>
      </div>

      <DriverEarningsPanel />

      <div aria-live="polite" aria-atomic="true">
        {scheduledReminders.map((reminder) => {
          const ride = [...todayBookings, ...upcomingBookings].find((item) => item.id === reminder.data.bookingId);
          if (!ride || ["CANCELLED", "COMPLETED", "NO_SHOW"].includes(ride.status) || new Date(reminder.data.pickupAt).getTime() <= Date.now()) return null;
          return <p key={reminder.id} role="status" className="mb-4 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
            {t("driverPortal.scheduledRideReminderMessage")} {ride.bookingRef} · {new Date(reminder.data.pickupAt).toLocaleString(locale)}
          </p>;
        })}
      </div>

      {refreshError && (
        <div role="alert" className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-bold text-red-700">
          {t(refreshError)}
        </div>
      )}

      <button
        onClick={() => {
          if (driver) {
            fetchDriverData(driver.id);
          }
        }}
        disabled={refreshing}
        aria-label={t("driverPortal.refreshLabel")}
        className="w-full mb-6 py-3 bg-white border border-gray-200 rounded-2xl text-sm font-bold text-gray-600 hover:bg-gray-50 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
      >
        {refreshing ? t("driverPortal.refreshing") : t("driverPortal.refresh")}
      </button>

      {showCashModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div ref={cashDialogRef} role="dialog" aria-modal="true" aria-labelledby="cash-confirmation-title" className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl">
            <div className="text-center">
              <div className="text-5xl mb-3">💵</div>
              <h3 id="cash-confirmation-title" className="text-xl font-black text-gray-900 mb-2">
                {t("driverPortal.cashConfirmation")}
              </h3>
              <p className="text-sm text-gray-600 mb-4">
                {t("driverPortal.cashQuestion")}
              </p>

              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 p-3 rounded-2xl mb-4">
                {t("driverPortal.cashRequired")}
              </p>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowCashModal(null)}
                  className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-2xl text-sm font-black hover:bg-gray-200"
                >
                  {t("driverPortal.no")}
                </button>

                <button
                  onClick={() =>
                    updateStatus(showCashModal, "IN_PROGRESS", true)
                  }
                  disabled={updating === showCashModal}
                  className="flex-1 py-3 bg-green-700 text-white rounded-2xl text-sm font-black hover:bg-green-800 disabled:opacity-50"
                >
                  {updating === showCashModal ? t("driverPortal.updating") : t("driverPortal.yes")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {todayBookings.length > 0 && (
        <BookingSection
          title={t("driverPortal.today")}
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
          title={t("driverPortal.upcoming")}
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
            {t("driverPortal.completed")}
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
                    <p className="mt-1 text-xs font-bold text-green-700">
                      {t("driverPortal.yourEarnings")}: {formatDriverMoney(getDriverEarningAmount(booking), locale)}
                    </p>
                  </div>
                  <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full font-bold">
                    {t("driverPortal.completed")}
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
            {t("driverPortal.noAssignedRides")}
          </h3>
          <p className="text-gray-500 text-sm">
            {t("driverPortal.noAssignedRidesHelp")}
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
  const { t } = useLanguage();
  if (!isOnline) {
    return (
      <div className="mt-3 bg-gray-50 border border-gray-200 text-gray-600 rounded-2xl px-4 py-3 text-xs font-bold">
        {t("driverPortal.gpsOffline")}
      </div>
    );
  }

  const content: Record<string, string> = {
    idle: t("driverPortal.gpsReady"),
    tracking: t("driverPortal.gpsTracking").replace("{time}", lastGpsUpdate || t("driverPortal.justNow")),
    blocked: t("driverPortal.gpsBlocked"),
    unsupported: t("driverPortal.gpsUnsupported"),
    error: t("driverPortal.gpsError"),
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
  const { t, locale } = useLanguage();
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
            {t("driverPortal.newOffer")}
          </p>
          <h2 className="text-2xl font-black mt-1">
            🚕 {request.booking?.bookingRef}
          </h2>
        </div>

        <div className="bg-white/20 rounded-2xl px-4 py-3 text-center">
          <div className="text-2xl font-black" aria-live="polite" aria-label={t("driverPortal.offerExpires").replace("{seconds}", String(secondsLeft))}>{secondsLeft} {t("driverPortal.secondsShort")}</div>
          <div className="text-[10px] uppercase font-bold">{t("driverPortal.time")}</div>
        </div>
      </div>

      <div className="bg-white/10 rounded-3xl p-4 space-y-3">
        <div>
          <p className="text-[11px] uppercase opacity-70 font-bold">{t("driverPortal.pickupArea")}</p>
          <p className="font-bold">{request.booking?.pickupArea && request.booking.pickupArea !== "Area unavailable" ? request.booking.pickupArea : t("driverPortal.areaUnavailable")}</p>
        </div>
        <div>
          <p className="text-[11px] uppercase opacity-70 font-bold">{t("driverPortal.destinationArea")}</p>
          <p className="font-bold">{request.booking?.dropoffArea && request.booking.dropoffArea !== "Area unavailable" ? request.booking.dropoffArea : t("driverPortal.areaUnavailable")}</p>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="bg-white/10 rounded-2xl p-3 font-bold">{request.booking?.passengerCount} {t(`driverPortal.passengers.${new Intl.PluralRules(locale).select(request.booking?.passengerCount || 0)}`)}</div>
          <div className="bg-white/10 rounded-2xl p-3 font-bold">{request.booking?.wavRequired ? t("driverPortal.accessibleVehicle") : t(`service.${request.booking?.serviceType}`, t("driverPortal.service"))}</div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 mt-5">
        <button
          onClick={onReject}
          disabled={updating || secondsLeft <= 0}
          aria-label={t("driverPortal.declineOfferLabel").replace("{reference}", request.booking?.bookingRef || "")}
          className="py-4 rounded-3xl bg-red-500 hover:bg-red-600 text-white font-black disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          {updating ? t("driverPortal.updating") : t("driverPortal.declineOffer")}
        </button>

        <button
          onClick={onAccept}
          disabled={updating || secondsLeft <= 0}
          aria-label={t("driverPortal.acceptOfferLabel").replace("{reference}", request.booking?.bookingRef || "")}
          className="py-4 rounded-3xl bg-white text-green-700 hover:bg-green-50 font-black disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          {updating ? t("driverPortal.updating") : t("driverPortal.acceptOffer")}
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
  showTripControls = true,
}: {
  booking: Booking;
  updating: boolean;
  onStatusUpdate: (id: string, status: string, cash?: boolean) => void;
  onCashConfirm: () => void;
  showTripControls?: boolean;
}) {
  const { t, locale } = useLanguage();
  const nextAction = getNextAction(booking, t);

  return (
    <div className="bg-gray-950 text-white rounded-[2rem] p-5 shadow-xl">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <p className="text-xs text-gray-400 uppercase font-bold">
            {booking.bookingRef}
          </p>
          <h3 className="text-xl font-black mt-1">
            {getStatusEmoji(booking.status)} {formatStatus(booking.status, t)}
          </h3>
        </div>

        <span className="bg-white/10 px-3 py-2 rounded-2xl text-xs font-black">
          {t(`service.${booking.serviceType}`, t("driverPortal.service"))}
        </span>
      </div>

      <div className="bg-white/10 rounded-3xl p-4 space-y-3 mb-4">
        <div>
          <p className="text-[11px] text-gray-400 uppercase font-bold">
            {t("driverPortal.pickup")}
          </p>
          <p className="font-bold">📍 {booking.pickupAddress}</p>
        </div>

        <div>
          <p className="text-[11px] text-gray-400 uppercase font-bold">{t("driverPortal.destination")}</p>
          <p className="font-bold">🏁 {booking.dropoffAddress}</p>
        </div>
      </div>

      <ChildrenTransportSummary booking={booking} dark />
      <AssistanceSummary booking={booking} dark />

      <div className="grid grid-cols-2 gap-3 mb-4 text-sm">
        <a
          href={`tel:${booking.customerPhoneCode}${booking.customerPhone}`}
          className="text-center py-3 bg-blue-600 rounded-2xl font-black"
        >
          {t("driverPortal.callPassenger")}
        </a>

        {showTripControls && <a
          href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(booking.pickupAddress || "")}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-center py-3 bg-white text-gray-950 rounded-2xl font-black"
        >
          {t("driverPortal.navigate")}
        </a>}
      </div>

      {booking.paymentMethod === "CASH" &&
        booking.status === "DRIVER_ENROUTE" && (
          <div className="p-3 bg-amber-100 text-amber-900 rounded-2xl mb-4">
            <p className="text-sm font-black">
              {t("driverPortal.cashBeforeTrip")}
            </p>
          </div>
        )}

      {showTripControls && nextAction && (
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
          {updating ? t("driverPortal.updating") : nextAction.label}
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
  const { t, locale } = useLanguage();
  const [calendarBusy, setCalendarBusy] = useState(false);
  const [calendarMessage, setCalendarMessage] = useState<"" | "success" | "error">("");
  const nextAction = getNextAction(booking, t);
  const calendarPickupMs = booking.pickupAt ? new Date(booking.pickupAt).getTime() : NaN;
  const canAddToCalendar = booking.scheduledRide === true && !["CANCELLED", "COMPLETED", "NO_SHOW"].includes(booking.status) && Number.isFinite(calendarPickupMs) && calendarPickupMs > Date.now();

  const addToCalendar = async () => {
    setCalendarBusy(true);
    setCalendarMessage("");
    try {
      const response = await csrfFetch("driver", `/api/driver/scheduled-rides/${booking.id}/calendar`, { cache: "no-store" });
      if (!response.ok) throw new Error("calendar_export_failed");
      const objectUrl = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = `drivo-ride-${booking.bookingRef.replace(/[^a-zA-Z0-9_-]/g, "-")}.ics`;
      anchor.rel = "noopener";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
      setCalendarMessage("success");
    } catch {
      setCalendarMessage("error");
    } finally {
      setCalendarBusy(false);
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-3xl overflow-hidden shadow-sm">
      <button aria-expanded={expanded} onClick={onToggle} className="w-full p-4 text-left">
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
            <span className="text-amber-600 font-bold">{t("driverPortal.paymentCash")}</span>
          )}
        </div>

        <div className="text-xs text-gray-400 mt-2">
          {expanded ? t("driverPortal.lessDetails") : t("driverPortal.moreDetails")}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-gray-100 pt-3 space-y-3">
          {canAddToCalendar && (
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => void addToCalendar()}
                disabled={calendarBusy}
                aria-label={t("driverPortal.addToCalendarForRide").replace("{reference}", booking.bookingRef)}
                className="min-h-11 w-full rounded-xl border border-indigo-200 bg-white px-4 py-2 text-sm font-bold text-indigo-800 hover:bg-indigo-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700 disabled:opacity-60"
              >
                {calendarBusy ? t("driverPortal.preparingCalendar") : t("driverPortal.addToCalendar")}
              </button>
              {calendarMessage && (
                <p role={calendarMessage === "error" ? "alert" : "status"} aria-live="polite" className={calendarMessage === "error" ? "text-xs font-medium text-red-700" : "text-xs font-medium text-green-700"}>
                  {calendarMessage === "error" ? t("driverPortal.calendarDownloadError") : t("driverPortal.calendarDownloadSuccess")}
                </p>
              )}
            </div>
          )}
          <div className="bg-gray-50 rounded-2xl p-3">
            <p className="text-xs font-bold text-gray-500 mb-1">{t("driverPortal.passenger")}</p>
            <p className="text-sm font-bold">{booking.customerName}</p>

            <div className="flex gap-2 mt-2">
              <a
                href={`tel:${booking.customerPhoneCode}${booking.customerPhone}`}
                className="flex-1 text-center py-2 bg-blue-50 text-blue-700 rounded-xl text-xs font-bold"
              >
                {t("driverPortal.callPassenger")}
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
            <InfoRow label={t("driverPortal.luggage")} value={t(`luggage.${booking.luggageType}`, t("driverPortal.notAvailable"))} />
            <InfoRow label={t("driverPortal.bagCounts")} value={`${booking.smallBags || 0} / ${booking.largeBags || 0}`} />
            <InfoRow label={t("driverPortal.payment")} value={t(`payment.${booking.paymentMethod}`, t("driverPortal.notAvailable"))} />
            {booking.earning && (
              <InfoRow
                label={t("driverPortal.yourEarnings")}
                value={formatDriverMoney(booking.earning.driverAmount, locale)}
              />
            )}
            {booking.flightNumber && (
              <InfoRow label={t("driverPortal.flight")} value={`✈️ ${booking.flightNumber}`} />
            )}
            {booking.waitAndGreet && (
              <InfoRow label={t("driverPortal.waitAndGreet")} value={t("driverPortal.yes")} />
            )}
            {booking.specialNotes && (
              <div className="mt-2 p-2 bg-amber-50 rounded-xl">
                <span className="font-bold">{t("driverPortal.notes")}: </span>
                {booking.specialNotes}
              </div>
            )}
          </div>

          <ChildrenTransportSummary booking={booking} />
          <AssistanceSummary booking={booking} />

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
              {updating ? t("driverPortal.updating") : nextAction.label}
            </button>
          )}

          <a
            href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(booking.pickupAddress || "")}`}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full py-3 bg-blue-50 text-blue-700 font-bold rounded-2xl text-sm text-center hover:bg-blue-100"
          >
            {t("driverPortal.navigateToPickup")}
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
  suffix = "",
}: {
  label: string;
  value: number;
  tone: "amber" | "blue" | "green";
  suffix?: string;
}) {
  const styles = {
    amber: "bg-amber-50 border-amber-200 text-amber-700",
    blue: "bg-blue-50 border-blue-200 text-blue-700",
    green: "bg-green-50 border-green-200 text-green-700",
  };

  return (
    <div className={`border rounded-2xl p-3 text-center ${styles[tone]}`}>
      <div className="text-2xl font-black">{value}{suffix}</div>
      <div className="text-xs font-bold">{label}</div>
    </div>
  );
}

function getDriverEarningAmount(booking: Booking) {
  return Number(booking.earning?.driverAmount || 0);
}

function formatDriverMoney(value: number, locale: string) {
  return new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" }).format(Number(value || 0));
}

function MoneyCard({ label, value }: { label: string; value: number }) {
  const { locale } = useLanguage();
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-3 text-center">
      <div className="text-xl font-black text-gray-900">
        {formatDriverMoney(value, locale)}
      </div>
      <div className="text-xs font-bold text-gray-500">{label}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const { t } = useLanguage();
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
      {formatStatus(status, t)}
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

function ChildrenTransportSummary({
  booking,
  dark = false,
}: {
  booking?: Booking;
  dark?: boolean;
}) {
  const { t } = useLanguage();
  if (!booking || (booking.serviceType !== "CHILDREN" && !booking.scheduledRide)) return null;

  const childrenRows = getChildrenRows(booking).map((child, index) => [
    t("driverPortal.childNumber").replace("{number}", String(index + 1)),
    `${child.fullName || t("driverPortal.notAvailable")}${child.age !== null && child.age !== undefined && child.age !== "" ? `, ${child.age}` : ""}${child.specialRequirements ? ` - ${child.specialRequirements}` : ""}`,
  ]);
  const rows = [
    [t("driverPortal.pickupAddress"), booking.pickupAddress || t("driverPortal.notAvailable")],
    [t("driverPortal.numberOfChildren"), String(booking.passengerCount || 0)],
    ...childrenRows,
    [t("driverPortal.guardian"), booking.guardianName || booking.parentFullName || t("driverPortal.notAvailable")],
    [t("driverPortal.primaryPhone"), booking.guardianPhone || booking.parentPrimaryPhone || t("driverPortal.notAvailable")],
    [t("driverPortal.emergencyPhone"), booking.guardianEmergencyPhone || booking.parentEmergencyPhone || t("driverPortal.notAvailable")],
    [t("driverPortal.institution"), booking.institutionName || booking.educationalInstitutionName || t("driverPortal.notAvailable")],
    [t("driverPortal.institutionAddress"), booking.institutionAddress || booking.dropoffAddress || t("driverPortal.notAvailable")],
    [t("driverPortal.pickup"), `${booking.pickupDate || booking.scheduledDate || ""} ${booking.pickupTime || booking.scheduledTime || ""}`.trim()],
    [t("driverPortal.return"), `${booking.returnDate || ""} ${booking.returnTime || ""}`.trim() || t("driverPortal.notAvailable")],
    [t("driverPortal.returnPickupTime"), booking.returnTime || t("driverPortal.notAvailable")],
    [t("driverPortal.recurrence"), formatEnum(booking.recurrenceType || booking.recurrence, t)],
  ].filter(Boolean) as string[][];

  return (
    <div
      className={`rounded-2xl p-3 text-xs ${
        dark
          ? "bg-white/10 text-white"
          : "bg-pink-50 text-pink-950 border border-pink-100"
      }`}
    >
      <p className="mb-2 font-black uppercase">
        {t("driverPortal.childrenTransport")}
      </p>
      <div className="space-y-1.5">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-3">
            <span className={dark ? "text-white/70" : "text-pink-700"}>{label}</span>
            <span className="font-bold text-right">{value || t("driverPortal.notAvailable")}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function getChildrenRows(booking: Booking) {
  if (Array.isArray(booking.childrenDetails) && booking.childrenDetails.length > 0) {
    return booking.childrenDetails.map((child) => ({
      fullName: child.fullName || "",
      age: child.age ?? "",
      specialRequirements: child.specialRequirements || "",
    }));
  }

  if (
    booking.childName ||
    booking.childFullName ||
    (booking.childAge !== null && booking.childAge !== undefined)
  ) {
    return [
      {
        fullName: booking.childName || booking.childFullName || "",
        age: booking.childAge ?? "",
        specialRequirements: booking.childSpecialRequirements || "",
      },
    ];
  }

  return [];
}

function AssistanceSummary({
  booking,
  dark = false,
}: {
  booking?: Booking;
  dark?: boolean;
}) {
  const { t } = useLanguage();
  if (!booking) return null;

  const rows = [
    booking.seniorPassenger && [t("driverPortal.seniorPassenger"), formatEnum(booking.assistanceLevel, t)],
    booking.ztpCardHolder && [t("driverPortal.ztpPassenger"), t("driverPortal.yes")],
    (booking.wheelchairUser || booking.wheelchairNeeded) && [
      t("driverPortal.wheelchair"),
      `${formatEnum(booking.wheelchairType, t)} · ${t("driverPortal.transferToSeat")}: ${
        booking.canTransferToSeat === null || booking.canTransferToSeat === undefined
          ? t("driverPortal.notAvailable")
          : booking.canTransferToSeat
          ? t("driverPortal.yes")
          : t("driverPortal.no")
      }`,
    ],
    booking.wavRequired && [t("driverPortal.wavRequired"), booking.passengerRemainsInWheelchair ? t("driverPortal.remainsInWheelchair") : t("driverPortal.yes")],
    (booking.companionCount || 0) > 0 && [t("driverPortal.companions"), String(booking.companionCount)],
    booking.hospitalName && [t("driverPortal.hospital"), booking.hospitalName],
    (booking.appointmentDate || booking.appointmentTime) && [
      t("driverPortal.appointment"),
      `${booking.appointmentDate || ""} ${booking.appointmentTime || ""}`.trim(),
    ],
    (booking.waitingDuration || booking.customWaitingDuration) && [
      t("driverPortal.waiting"),
      formatEnum(booking.customWaitingDuration || booking.waitingDuration, t),
    ],
    (booking.returnDate || booking.returnTime) && [
      t("driverPortal.return"),
      `${booking.returnDate || ""} ${booking.returnTime || ""}`.trim(),
    ],
  ].filter(Boolean) as string[][];

  if (rows.length === 0) return null;

  return (
    <div
      className={`rounded-2xl p-3 text-xs ${
        dark
          ? "bg-white/10 text-white"
          : "bg-blue-50 text-blue-900 border border-blue-100"
      }`}
    >
      <p className="mb-2 font-black uppercase">
        {t("driverPortal.assistance")}
      </p>
      <div className="space-y-1.5">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-3">
            <span className={dark ? "text-white/70" : "text-blue-700"}>{label}</span>
            <span className="font-bold text-right">{value || t("driverPortal.notAvailable")}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

type Translate = ReturnType<typeof useLanguage>["t"];

function formatEnum(value: string | null | undefined, t: Translate) {
  if (!value) return t("driverPortal.notAvailable");
  return t(`driverPortal.enum.${value}`, value.replaceAll("_", " "));
}

function getNextAction(booking: Booking, t: Translate) {
  switch (booking.status) {
    case "ASSIGNED":
    case "CONFIRMED":
      return {
        label: t("driverPortal.startRoute"),
        nextStatus: "DRIVER_ENROUTE",
      };
    case "DRIVER_ENROUTE":
      return {
        label: t("driverPortal.arrivedAtPickup"),
        nextStatus: "ARRIVED",
      };
    case "ARRIVED":
      if (booking.paymentMethod === "CASH") {
        return {
          label: t("driverPortal.confirmCashStart"),
          nextStatus: "CASH_CONFIRM",
        };
      }
      return {
        label: t("driverPortal.startTrip"),
        nextStatus: "IN_PROGRESS",
      };
    case "IN_PROGRESS":
      return {
        label: t("driverPortal.completeTrip"),
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

function formatStatus(status: string, t: Translate) {
  return t(`driverPortal.status.${status}`, t("driverPortal.notAvailable"));
}

// API codes stay unchanged; only the driver-facing message is localized.
function driverErrorKey(code: string | undefined, fallback: string) {
  const keys: Record<string, string> = {
    OFFER_EXPIRED: "driverPortal.errorOfferExpired",
    OFFER_NOT_FOUND: "driverPortal.errorOfferNotFound",
    OFFER_ALREADY_RESPONDED: "driverPortal.errorOfferResponded",
    DRIVER_NOT_AVAILABLE: "driverPortal.errorDriverUnavailable",
    CONFLICTING_ACTIVE_TRIP: "driverPortal.errorActiveTrip",
    BOOKING_ALREADY_CLAIMED: "driverPortal.errorBookingClaimed",
    BOOKING_NOT_FOUND: "driverPortal.errorBookingNotFound",
    INVALID_TRANSITION: "driverPortal.errorTransition",
    STATE_CONFLICT: "driverPortal.errorStateConflict",
    TRANSACTION_UNAVAILABLE: "driverPortal.errorTransaction",
    INVALID_REQUEST: "driverPortal.errorInvalidRequest",
  };
  return keys[code || ""] || fallback;
}
