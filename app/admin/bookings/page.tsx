"use client";

import { csrfFetch } from "@/lib/client/csrf-fetch";
import { driverCompatibility } from "@/lib/dispatch-matching";

import { useEffect, useMemo, useState } from "react";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { formatEuro, formatMarketDate, formatMarketTime, formatMarketWallDateTime, formatNumber } from "@/lib/i18n/format";
import { presentStatus } from "@/lib/i18n/status-catalog";

interface Booking {
  id: string;
  bookingRef: string;
  status: string;
  dispatchStatus?: string | null;
  serviceType: string;

  pickupAddress: string;
  dropoffAddress: string;

  pickupLat?: number | null;
  pickupLng?: number | null;
  dropoffLat?: number | null;
  dropoffLng?: number | null;

  scheduledDate: string;
  scheduledTime: string;

  passengerCount: number;
  luggageType: string;
  smallBags?: number;
  largeBags?: number;
  wheelchairNeeded: boolean;
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
  customerEmail?: string | null;

  paymentMethod: string;
  cashAgreed: boolean;

  specialNotes?: string | null;
  phoneVerified: boolean;

  flightNumber?: string | null;
  airline?: string | null;
  waitAndGreet?: boolean;

  estimatedPrice?: number | null;
  distanceKm?: number | null;
  vehicleRequired?: string | null;
  fareBaseFare?: number | null;
  fareDistanceCharge?: number | null;
  fareWaitingCharge?: number | null;
  fareOptionalFees?: Record<string, number> | null;
  fareNightCharge?: number | null;
  fareMinimumAdjustment?: number | null;
  fareTotalFare?: number | null;
  earning?: {
    totalFare: number;
    driverAmount: number;
    platformAmount: number;
    commissionRate: number;
  } | null;
  financialBreakdown?: {
    totalFare: number;
    platformCommission: number;
    driverEarnings: number;
    platformEarnings: number;
    serviceType: string;
    commissionPercentageUsed: number;
    commissionSource?: string;
    commissionSourceId?: string | null;
  } | null;

  driverId?: string | null;
  driver?: Driver | null;
  passenger?: {
    id: string;
    fullName?: string | null;
    phone: string;
    phoneVerified: boolean;
    email?: string | null;
    bookings?: { id: string }[];
  } | null;

  acceptedAt?: string | null;
  createdAt: string;
}

interface Driver {
  id: string;
  fullName: string;
  phone: string;

  email?: string | null;

  vehicleType?: string | null;
  vehiclePlate?: string | null;

  isOnline?: boolean;
  isOnTrip?: boolean;

  status?: string;

  currentLat?: number | null;
  currentLng?: number | null;

  lastLocationUpdate?: string | null;
  vehicleCapacity?: number | null;
  vehicle?: {
    type?: string | null;
    status?: string | null;
    maxPassengers?: number | null;
    wheelchairAccessible?: boolean | null;
  } | null;
}

const STATUS_OPTIONS = [
  "PENDING",
  "CONFIRMED",
  "ASSIGNED",
  "DRIVER_ENROUTE",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
  "NO_SHOW",
];

const DISPATCH_OPTIONS = [
  "NOT_STARTED",
  "SEARCHING_DRIVER",
  "DISPATCHING",
  "ACCEPTED",
  "NO_DRIVER_AVAILABLE",
  "DISPATCH_EXHAUSTED",
];

export default function AdminBookingsPage() {
  const { t, locale } = useLanguage();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [selectedBooking, setSelectedBooking] =
    useState<Booking | null>(null);

  const openBookingForDispatch = (booking: Booking) => {
    setSelectedBooking(booking);

    requestAnimationFrame(() => {
      const target = document.getElementById(
        "drivo-admin-dispatch-controls"
      );
      if (!target) return;

      const reducedMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)"
      ).matches;

      target.scrollIntoView({
        behavior: reducedMotion ? "auto" : "smooth",
        block: "start",
        inline: "nearest",
      });

      target.focus({ preventScroll: true });
    });
  };


  const [search, setSearch] = useState("");

  const [statusFilter, setStatusFilter] = useState("ALL");

  const [dispatchFilter, setDispatchFilter] =
    useState("ALL");

  const [lastUpdated, setLastUpdated] =
    useState<string>("");

  const [updating, setUpdating] = useState(false);

  const [dispatchingId, setDispatchingId] =
    useState<string | null>(null);
  const [actionError, setActionError] = useState("");
  const [actionNotice, setActionNotice] = useState("");

  useEffect(() => {
    fetchAll();

    const interval = setInterval(() => {
      refreshData();
    }, 7000);

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

  const refreshData = async () => {
    setRefreshing(true);

    try {
      await Promise.all([
        fetchBookings(false),
        fetchDrivers(),
      ]);
    } finally {
      setRefreshing(false);
    }
  };

  const fetchAll = async () => {
    setLoading(true);

    try {
      await Promise.all([
        fetchBookings(false),
        fetchDrivers(),
      ]);
    } finally {
      setLoading(false);
    }
  };

  const fetchBookings = async (
    showLoader = true
  ) => {
    try {
      if (showLoader) setLoading(true);

      const res = await csrfFetch("admin",
        "/api/admin/bookings",
        {
          cache: "no-store",
        }
      );

      const data: any = await safeJson(res);

      const list = data.bookings || [];

      setBookings(list);

      setLastUpdated(new Date().toISOString());

      if (selectedBooking) {
        const updated = list.find(
          (b: Booking) =>
            b.id === selectedBooking.id
        );

        if (updated) {
          setSelectedBooking(updated);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      if (showLoader) setLoading(false);
    }
  };

  const fetchDrivers = async () => {
    try {
      const res = await csrfFetch("admin",
        "/api/admin/drivers",
        {
          cache: "no-store",
        }
      );

      const data: any = await safeJson(res);

      setDrivers(data.drivers || []);
    } catch (err) {
      console.error(err);
    }
  };

  const updateBookingStatus = async (
    bookingId: string,
    status: string
  ) => {
    try {
      setUpdating(true);
      setActionError(""); setActionNotice("");

      const res = await csrfFetch("admin",
        "/api/admin/bookings",
        {
          method: "PATCH",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            bookingId,
            status,
          }),
        }
      );

      const data: any = await safeJson(res);

      if (!res.ok) {
        setActionError("m4.booking.updateFailed");
        return;
      }
      setActionNotice("m4.booking.updated");
      await fetchBookings(false);
    } catch (err) {
      console.error(err);

      setActionError("m4.booking.updateFailed");
    } finally {
      setUpdating(false);
    }
  };

  const assignDriver = async (
    bookingId: string,
    driverId: string
  ) => {
    try {
      setUpdating(true);
      setActionError(""); setActionNotice("");

      const res = await csrfFetch("admin",
        "/api/admin/bookings",
        {
          method: "PATCH",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            bookingId,
            driverId,
            status: "ASSIGNED",
          }),
        }
      );

      const data: any = await safeJson(res);

      if (!res.ok) {
        setActionError(
          typeof data?.code === "string" && data.code
            ? `Driver assignment blocked: ${data.code}`
            : "m4.booking.assignFailed"
        );
        return;
      }
      setActionNotice("m4.booking.assigned");
      await fetchBookings(false);
    } catch (err) {
      console.error(err);

      setActionError("m4.booking.assignFailed");
    } finally {
      setUpdating(false);
    }
  };

  const startDispatch = async (
    bookingId: string
  ) => {
    try {
      setDispatchingId(bookingId);
      setActionError(""); setActionNotice("");

      const res = await csrfFetch("admin",
        "/api/dispatch/start",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            bookingId,
          }),
        }
      );

      const data: any = await safeJson(res);

      if (!res.ok) {
        setActionError(
          typeof data?.code === "string" && data.code
            ? `Dispatch blocked: ${data.code}`
            : "m4.booking.dispatchFailed"
        );
        return;
      }
      if (data?.dispatch === "DISPATCH_EXHAUSTED") {
        setActionError("No eligible driver is currently available (NO_ELIGIBLE_DRIVER).");
      } else {
        setActionNotice("m4.booking.dispatchStarted");
      }

      await fetchBookings(false);
    } catch (err) {
      console.error(err);

      setActionError("m4.booking.dispatchFailed");
    } finally {
      setDispatchingId(null);
    }
  };

  const filteredBookings = useMemo(() => {
    const q = search.trim().toLowerCase();

    return bookings.filter((booking) => {
      const statusOk =
        statusFilter === "ALL" ||
        booking.status === statusFilter;

      const dispatchOk =
        dispatchFilter === "ALL" ||
        (booking.dispatchStatus ||
          "NOT_STARTED") ===
          dispatchFilter;

      const searchOk =
        !q ||
        booking.bookingRef
          .toLowerCase()
          .includes(q) ||
        booking.customerName
          .toLowerCase()
          .includes(q) ||
        booking.pickupAddress
          .toLowerCase()
          .includes(q) ||
        booking.dropoffAddress
          .toLowerCase()
          .includes(q);

      return (
        statusOk &&
        dispatchOk &&
        searchOk
      );
    });
  }, [
    bookings,
    search,
    statusFilter,
    dispatchFilter,
  ]);

  const stats = useMemo(() => {
    return {
      total: bookings.length,

      pending: bookings.filter(
        (b) => b.status === "PENDING"
      ).length,

      active: bookings.filter((b) =>
        [
          "ASSIGNED",
          "DRIVER_ENROUTE",
          "IN_PROGRESS",
        ].includes(b.status)
      ).length,

      completed: bookings.filter(
        (b) => b.status === "COMPLETED"
      ).length,

      searching: bookings.filter(
        (b) =>
          b.dispatchStatus ===
          "SEARCHING_DRIVER",
          "DISPATCH_EXHAUSTED"
      ).length,
    };
  }, [bookings]);

  if (loading) {
    return (
      <div className="h-[70vh] flex items-center justify-center">
        <div className="text-center">
          <div className="text-5xl animate-pulse mb-4">
            🚕
          </div>

          <p className="text-gray-500 font-medium">
            {t("m4.booking.loading")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="bg-white rounded-3xl border border-gray-200 p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-3xl font-black text-gray-900">
                📋 {t("m4.booking.title")}
              </h1>

              <div className="px-3 py-1 rounded-full bg-green-100 text-green-700 text-xs font-bold flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                {t("m4.booking.live")}
              </div>
            </div>

            <p className="text-sm text-gray-500 mt-2">
              {t("m4.booking.intro")}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-xs text-gray-400">
                {t("m4.booking.lastSync")}
              </div>

              <div className="text-sm font-semibold text-gray-700">
                {lastUpdated ? formatMarketTime(lastUpdated, locale) : "--"}
              </div>
            </div>

            <button
              onClick={refreshData}
              className="h-11 px-5 rounded-2xl bg-green-700 hover:bg-green-800 text-white font-semibold text-sm transition-all"
            >
              {refreshing
                ? `🔄 ${t("m4.booking.refreshing")}`
                : `🔄 ${t("m4.tracking.refresh")}`}
            </button>
          </div>
        </div>
      </div>

      {actionError && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{t(actionError)}</p>}
      {actionNotice && <p role="status" className="rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-800">{t(actionNotice)}</p>}

      {/* STATS */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <DashboardCard
          title={t("m4.booking.total")}
          value={stats.total}
          icon="📦"
          color="gray"
        />

        <DashboardCard
          title={t("m4.booking.pending")}
          value={stats.pending}
          icon="🆕"
          color="amber"
        />

        <DashboardCard
          title={t("m4.booking.active")}
          value={stats.active}
          icon="🚕"
          color="blue"
        />

        <DashboardCard
          title={t("m4.booking.searching")}
          value={stats.searching}
          icon="📡"
          color="purple"
        />

        <DashboardCard
          title={t("m4.booking.completed")}
          value={stats.completed}
          icon="✅"
          color="green"
        />
      </div>

      {/* FILTERS */}
      <div className="bg-white rounded-3xl border border-gray-200 p-5 shadow-sm">
        <div className="grid lg:grid-cols-[1fr,auto] gap-4">
          <input
            value={search}
            onChange={(e) =>
              setSearch(e.target.value)
            }
            placeholder={t("m4.booking.searchPlaceholder")}
            aria-label={t("m4.booking.searchPlaceholder")}
            className="h-12 rounded-2xl border border-gray-200 px-4 outline-none focus:ring-4 focus:ring-green-100 focus:border-green-500 text-sm"
          />

          <button
            onClick={() => {
              setSearch("");
              setStatusFilter("ALL");
              setDispatchFilter("ALL");
            }}
            className="h-12 px-5 rounded-2xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-semibold"
          >
            ✕ {t("m4.booking.reset")}
          </button>
        </div>

        <div className="mt-5">
          <p className="text-xs font-bold text-gray-500 mb-2">
            {t("m4.booking.bookingStatus")}
          </p>

          <div className="flex flex-wrap gap-2">
            <FilterButton
              label={t("m4.operations.all")}
              active={
                statusFilter === "ALL"
              }
              onClick={() =>
                setStatusFilter("ALL")
              }
            />

            {STATUS_OPTIONS.map((status) => (
              <FilterButton
                key={status}
                label={presentStatus("booking", status, locale)}
                active={
                  statusFilter === status
                }
                onClick={() =>
                  setStatusFilter(status)
                }
              />
            ))}
          </div>
        </div>

        <div className="mt-5">
          <p className="text-xs font-bold text-gray-500 mb-2">
            {t("m4.booking.dispatchStatus")}
          </p>

          <div className="flex flex-wrap gap-2">
            <FilterButton
              label={t("m4.operations.all")}
              active={
                dispatchFilter === "ALL"
              }
              onClick={() =>
                setDispatchFilter("ALL")
              }
            />

            {DISPATCH_OPTIONS.map(
              (status) => (
                <FilterButton
                  key={status}
                  label={presentStatus("dispatch", status, locale)}
                  active={
                    dispatchFilter ===
                    status
                  }
                  onClick={() =>
                    setDispatchFilter(
                      status
                    )
                  }
                />
              )
            )}
          </div>
        </div>
      </div>

      {/* MAIN */}
      <div className="grid xl:grid-cols-[1fr,430px] gap-6">
        {/* BOOKINGS */}
        <div className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h2 className="font-black text-gray-900 text-lg">
                🚖 {t("m4.booking.reservations")}
              </h2>

              <p className="text-sm text-gray-500 mt-1">
                {t("m4.booking.found").replace("{count}", formatNumber(filteredBookings.length, locale))}
              </p>
            </div>
          </div>

          <div className="overflow-auto max-h-[80vh]">
            <table className="w-full min-w-[1200px]">
              <thead className="sticky top-0 bg-gray-50 z-20">
                <tr className="border-b border-gray-100">
                  <TableHead>
                    {t("m4.booking.reference")}
                  </TableHead>

                  <TableHead>
                    {t("m4.booking.status")}
                  </TableHead>

                  <TableHead>
                    {t("m4.booking.dispatch")}
                  </TableHead>

                  <TableHead>
                    {t("m4.booking.service")}
                  </TableHead>

                  <TableHead>
                    {t("m4.booking.customer")}
                  </TableHead>

                  <TableHead>
                    {t("m4.booking.route")}
                  </TableHead>

                  <TableHead>
                    {t("m4.booking.driver")}
                  </TableHead>

                  <TableHead>
                    {t("m4.booking.payment")}
                  </TableHead>

                  <TableHead>
                    {t("m4.booking.price")}
                  </TableHead>
                </tr>
              </thead>

              <tbody>
                {filteredBookings.map(
                  (booking) => (
                    <tr
                      key={booking.id}
                      onClick={() => openBookingForDispatch(booking)}
                       onKeyDown={(event) => {
                         if (event.key === "Enter" || event.key === " ") {
                           event.preventDefault();
                           openBookingForDispatch(booking);
                         }
                       }}
                       tabIndex={0}
                       aria-label={`Open dispatch controls for ${booking.bookingRef}`}
                      className={`border-b border-gray-50 cursor-pointer transition-all ${
                        selectedBooking?.id ===
                        booking.id
                          ? "bg-green-50"
                          : "hover:bg-gray-50"
                      }`}
                    >
                      <TableCell>
                        <div className="font-mono text-xs text-green-700 font-bold">
                          {
                            booking.bookingRef
                          }
                        </div>

                        <div className="text-[11px] text-gray-400 mt-1">
                          {formatMarketWallDateTime(booking.scheduledDate, booking.scheduledTime, locale)}
                        </div>
                      </TableCell>

                      <TableCell>
                        <StatusBadge
                          status={
                            booking.status
                          }
                        />
                      </TableCell>

                      <TableCell>
                        <DispatchBadge
                          status={
                            booking.dispatchStatus
                          }
                        />
                      </TableCell>

                      <TableCell>
                        <div className="font-semibold text-sm">
                          {getServiceIcon(
                            booking.serviceType
                          )}{" "}
                          {t(`service.${booking.serviceType}`, t("m4.common.unknownState"))}
                        </div>

                        <div className="text-xs text-gray-400 mt-1">
                          👥{" "}
                          {formatNumber(booking.passengerCount, locale)}
                        </div>
                      </TableCell>

                      <TableCell>
                        <div className="font-semibold text-gray-900">
                          {
                            booking.customerName
                          }
                        </div>

                        <div className="text-xs text-gray-500 mt-1">
                          {
                            booking.customerPhoneCode
                          }
                          {
                            booking.customerPhone
                          }
                        </div>
                      </TableCell>

                      <TableCell>
                        <div className="max-w-[220px]">
                          <div className="text-xs text-gray-700 truncate">
                            📍{" "}
                            {
                              booking.pickupAddress
                            }
                          </div>

                          <div className="text-xs text-gray-500 truncate mt-1">
                            ➜{" "}
                            {
                              booking.dropoffAddress
                            }
                          </div>
                        </div>
                      </TableCell>

                      <TableCell>
                        {booking.driver ? (
                          <div>
                            <div className="font-semibold text-sm">
                              {
                                booking.driver
                                  .fullName
                              }
                            </div>

                            <div className="text-xs text-gray-500 mt-1">
                              {booking.driver
                                ?.isOnline
                                ? `🟢 ${t("adminDrivers.online")}`
                                : `⚫ ${t("adminDrivers.offline")}`}
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs text-red-500 font-semibold">
                            {t("m4.booking.noDriver")}
                          </span>
                        )}
                      </TableCell>

                      <TableCell>
                        <div className="font-semibold text-sm">
                          {getPaymentIcon(
                            booking.paymentMethod
                          )}{" "}
                          {t(`m4.paymentMethod.${booking.paymentMethod}`, t("m4.common.unknownState"))}
                        </div>
                      </TableCell>

                      <TableCell>
                        <div className="font-black text-green-700">
                          {formatEuro(booking.estimatedPrice || 0, locale)}
                        </div>

                        <div className="text-xs text-gray-400">
                          {formatNumber(booking.distanceKm || 0, locale)}
                          km
                        </div>
                      </TableCell>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* DETAILS */}
        <div className="sticky top-6 h-fit">
          {selectedBooking ? (
            <BookingPanel
              booking={selectedBooking}
              drivers={drivers}
              updating={updating}
              dispatchingId={
                dispatchingId
              }
              onClose={() =>
                setSelectedBooking(
                  null
                )
              }
              onStatusChange={
                updateBookingStatus
              }
              onAssignDriver={
                assignDriver
              }
              onStartDispatch={
                startDispatch
              }
            />
          ) : (
            <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-10 text-center">
              <div className="text-5xl mb-4">
                👆
              </div>

              <h3 className="font-bold text-gray-900 text-lg">
                {t("m4.booking.select")}
              </h3>

              <p className="text-sm text-gray-500 mt-2">
                {t("m4.booking.selectHelp")}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ========================================================= */
/* BOOKING PANEL */
/* ========================================================= */

function BookingPanel({
  booking,
  drivers,
  updating,
  dispatchingId,
  onClose,
  onStatusChange,
  onAssignDriver,
  onStartDispatch,
}: any) {
  const { t, locale } = useLanguage();
  const yesNo = (value: unknown) => value ? t("m4.booking.yes") : t("m4.booking.no");
  const formatMoney = (value: unknown) => formatEuro(Number(value || 0), locale);
  const dateOnly = (value: string | null | undefined) => value ? formatMarketDate(value, locale) || t("m4.common.notProvided") : t("m4.common.notProvided");
  const wallTime = (date: string | null | undefined, time: string | null | undefined) => date && time ? formatMarketWallDateTime(date, time, locale) || t("m4.common.notProvided") : dateOnly(date);
  const formatValue = (value: unknown) => {
    if (value === null || value === undefined || value === "") return t("m4.common.notProvided");
    const raw = String(value);
    return /^[A-Z][A-Z0-9_]*$/.test(raw) ? t(`m4.enum.${raw}`, t("m4.common.unknownState")) : raw;
  };
  const formatOptionalFees = (value?: Record<string, number> | null) => !value || !Object.keys(value).length
    ? formatMoney(0)
    : Object.entries(value).map(([key, amount]) => `${t(`m4.fee.${key}`, t("m4.common.unknownState"))}: ${formatMoney(amount)}`).join(", ");
  return (
    <div className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="p-5 border-b border-gray-100 bg-gradient-to-r from-green-50 to-white">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs text-green-700 font-black uppercase tracking-wide">
              {t("m4.booking.detail")}
            </div>

            <h3 className="font-black text-gray-900 text-lg mt-1">
              {booking.bookingRef}
            </h3>
          </div>

          <button
            onClick={onClose}
            aria-label={t("m4.common.close")}
            className="w-9 h-9 rounded-xl bg-gray-100 hover:bg-gray-200"
          >
            ✕
          </button>
        </div>
      </div>

      <div className="p-5 space-y-5 max-h-[80vh] overflow-auto">
        <Section title={t("m4.booking.rideStatus")}>
          <div className="grid grid-cols-2 gap-3">
            <StatusBadge
              status={booking.status}
            />

            <DispatchBadge
              status={
                booking.dispatchStatus
              }
            />
          </div>
        </Section>

        <Section title={t("m4.booking.customer")}>
          <Info
            label={t("m4.booking.name")}
            value={booking.customerName}
          />

          <Info
            label={t("m4.booking.phone")}
            value={`${booking.customerPhoneCode}${booking.customerPhone}`}
          />

          <Info
            label={t("m4.booking.email")}
            value={
              booking.customerEmail ||
              t("m4.common.notProvided")
            }
          />
        </Section>

        {booking.passenger && (
          <Section title={t("m4.booking.passengerAccount")}>
            <Info label={t("m4.booking.passengerName")} value={booking.passenger.fullName || t("m4.common.notProvided")} />
            <Info label={t("m4.booking.phoneVerified")} value={yesNo(booking.passenger.phoneVerified)} />
            <Info label={t("m4.booking.email")} value={booking.passenger.email || t("m4.common.notProvided")} />
            <Info label={t("m4.booking.totalBookings")} value={formatNumber(booking.passenger.bookings?.length || 0, locale)} />
          </Section>
        )}

        <Section title={t("m4.booking.trip")}>
          <Info
            label={t("m4.booking.pickup")}
            value={
              booking.pickupAddress
            }
          />

          <Info
            label={t("m4.booking.dropoff")}
            value={
              booking.dropoffAddress
            }
          />

          <Info
            label={t("m4.booking.date")}
            value={formatMarketWallDateTime(booking.scheduledDate, booking.scheduledTime, locale)}
          />

          <Info
            label={t("m4.booking.distance")}
            value={`${formatNumber(booking.distanceKm || 0, locale)} km`}
          />

          <Info
            label={t("m4.booking.price")}
            value={formatEuro(booking.estimatedPrice || 0, locale)}
          />
        </Section>

        <Section title={t("m4.booking.financial")}>
          <Info
            label={t("m4.booking.serviceType")}
            value={t(`service.${booking.financialBreakdown?.serviceType || booking.serviceType}`, t("m4.common.unknownState"))}
          />
          <Info
            label={t("m4.booking.baseFare")}
            value={formatMoney(booking.fareBaseFare)}
          />
          <Info
            label={t("m4.booking.distanceCharge")}
            value={formatMoney(booking.fareDistanceCharge)}
          />
          <Info
            label={t("m4.booking.waitingCharge")}
            value={formatMoney(booking.fareWaitingCharge)}
          />
          <Info
            label={t("m4.booking.additional")}
            value={formatOptionalFees(booking.fareOptionalFees)}
          />
          <Info
            label={t("m4.booking.nightCharge")}
            value={formatMoney(booking.fareNightCharge)}
          />
          <Info
            label={t("m4.booking.minimumAdjustment")}
            value={formatMoney(booking.fareMinimumAdjustment)}
          />
          <Info
            label={t("m4.booking.totalFare")}
            value={formatMoney(booking.financialBreakdown?.totalFare ?? booking.fareTotalFare ?? booking.estimatedPrice)}
          />
          <Info
            label={t("m4.booking.commission")}
            value={`${formatNumber(Number(booking.financialBreakdown?.commissionPercentageUsed || booking.earning?.commissionRate || 0), locale)}%`}
          />
          <Info
            label={t("m4.booking.platformEarnings")}
            value={formatMoney(booking.financialBreakdown?.platformEarnings ?? booking.earning?.platformAmount)}
          />
          <Info
            label={t("m4.booking.driverEarnings")}
            value={formatMoney(booking.financialBreakdown?.driverEarnings ?? booking.earning?.driverAmount)}
          />
        </Section>

        {(booking.serviceType === "CHILDREN" || booking.scheduledRide) && (
          <Section title={t("m4.booking.children")}>
            <Info label={t("m4.booking.service")} value={t("m4.booking.children")} />
            <Info label={t("m4.booking.pickupAddress")} value={booking.pickupAddress || t("m4.common.notProvided")} />
            <Info label={t("m4.booking.schoolName")} value={booking.institutionName || booking.educationalInstitutionName || t("m4.common.notProvided")} />
            <Info label={t("m4.booking.schoolAddress")} value={booking.institutionAddress || booking.dropoffAddress || t("m4.common.notProvided")} />
            <Info label={t("m4.booking.childCount")} value={formatNumber(booking.passengerCount || 0, locale)} />
            <Info label={t("m4.booking.pickupDate")} value={dateOnly(booking.pickupDate || booking.scheduledDate)} />
            <Info label={t("m4.booking.pickupTime")} value={booking.pickupTime || booking.scheduledTime || t("m4.common.notProvided")} />
            <Info label={t("m4.booking.returnDate")} value={dateOnly(booking.returnDate)} />
            <Info label={t("m4.booking.returnTime")} value={booking.returnTime || t("m4.common.notProvided")} />
            <Info label={t("m4.booking.recurrenceType")} value={formatValue(booking.recurrenceType || booking.recurrence)} />
            <Info label={t("m4.booking.serviceDays")} value={formatNumber(getChildrenServiceDays(booking), locale)} />
            <Info label={t("m4.booking.childrenPrice")} value={getChildrenPriceBreakdown(booking, locale, t)} />
            {getChildrenRows(booking).map((child, index) => (
              <Info
                key={`${child.fullName}-${index}`}
                label={t("m4.booking.child").replace("{count}", formatNumber(index + 1, locale))}
                value={`${child.fullName || t("m4.common.notProvided")}${child.age !== null && child.age !== undefined && child.age !== "" ? `, ${child.age}` : ""}${child.specialRequirements ? ` - ${child.specialRequirements}` : ""}`}
              />
            ))}
            <Info label={t("m4.booking.guardian")} value={booking.guardianName || booking.parentFullName || t("m4.common.notProvided")} />
            <Info label={t("m4.booking.primaryPhone")} value={booking.guardianPhone || booking.parentPrimaryPhone || t("m4.common.notProvided")} />
            <Info label={t("m4.booking.emergencyPhone")} value={booking.guardianEmergencyPhone || booking.parentEmergencyPhone || t("m4.common.notProvided")} />
            <Info label={t("m4.booking.guardianEmail")} value={booking.guardianEmail || booking.parentEmail || t("m4.common.notProvided")} />
            <Info label={t("m4.booking.institution")} value={booking.institutionName || booking.educationalInstitutionName || t("m4.common.notProvided")} />
            <Info label={t("m4.booking.schoolAddress")} value={booking.institutionAddress || booking.dropoffAddress || t("m4.common.notProvided")} />
            <Info label={t("m4.booking.pickupSchedule")} value={wallTime(booking.pickupDate || booking.scheduledDate, booking.pickupTime || booking.scheduledTime)} />
            <Info label={t("m4.booking.returnSchedule")} value={wallTime(booking.returnDate, booking.returnTime)} />
            <Info label={t("m4.booking.recurrence")} value={formatValue(booking.recurrenceType || booking.recurrence)} />
            <Info label={t("m4.booking.customRecurrence")} value={booking.recurrenceCustom || t("m4.common.notProvided")} />
            <Info label={t("m4.booking.paymentMethod")} value={t(`m4.paymentMethod.${booking.paymentMethod}`, t("m4.common.unknownState"))} />
          </Section>
        )}

        <Section title={t("m4.booking.assistance")}>
          <Info label={t("m4.booking.senior")} value={yesNo(booking.seniorPassenger)} />
          <Info label={t("m4.booking.assistanceLevel")} value={formatValue(booking.assistanceLevel)} />
          <Info label={t("dispatch.form.ztp")} value={yesNo(booking.ztpCardHolder)} />
          <Info label={t("m4.booking.wheelchairUser")} value={yesNo(booking.wheelchairUser || booking.wheelchairNeeded)} />
          <Info label={t("m4.booking.wheelchairType")} value={formatValue(booking.wheelchairType)} />
          <Info label={t("m4.booking.transfer")} value={booking.canTransferToSeat === null || booking.canTransferToSeat === undefined ? t("m4.common.notProvided") : yesNo(booking.canTransferToSeat)} />
          <Info label={t("m4.booking.wavRequired")} value={yesNo(booking.wavRequired)} />
          <Info label={t("m4.booking.companions")} value={formatNumber(booking.companionCount || 0, locale)} />
          <Info label={t("m4.booking.bags")} value={`${formatNumber(booking.smallBags || 0, locale)} / ${formatNumber(booking.largeBags || 0, locale)}`} />
          <Info label={t("m4.booking.medicalAppointment")} value={yesNo(booking.medicalAppointment)} />
          <Info label={t("m4.booking.hospital")} value={booking.hospitalName || t("m4.common.notProvided")} />
          <Info label={t("m4.booking.department")} value={booking.department || t("m4.common.notProvided")} />
          <Info label={t("m4.booking.appointmentTime")} value={wallTime(booking.appointmentDate, booking.appointmentTime)} />
          <Info label={t("m4.booking.waitingDuration")} value={formatValue(booking.customWaitingDuration || booking.waitingDuration)} />
          <Info label={t("m4.booking.returnDetails")} value={wallTime(booking.returnDate, booking.returnTime)} />
        </Section>

        <div
          id="drivo-admin-dispatch-controls"
          tabIndex={-1}
          aria-label="Dispatch and Driver Assignment"
          className="scroll-mt-4 outline-none"
        />
        <Section title={t("m4.booking.dispatch")}>
          <button
            onClick={() =>
              onStartDispatch(
                booking.id
              )
            }
            disabled={
              dispatchingId ===
              booking.id
            }
            className="w-full h-12 rounded-2xl bg-green-700 hover:bg-green-800 text-white font-bold text-sm"
          >
            {dispatchingId ===
            booking.id
              ? `⏳ ${t("m4.booking.dispatching")}`
              : `📡 ${t("m4.booking.startDispatch")}`}
          </button>
        </Section>

        <Section title={t("m4.booking.driverAssign")}>
          <select
            aria-label={t("m4.booking.driverAssign")}
            disabled={updating || Boolean(booking.driverId) || !["PENDING", "CONFIRMED", "SEARCHING_DRIVER"].includes(booking.status)}
            className="w-full h-12 rounded-2xl border border-gray-200 px-4 text-sm"
            value={
              booking.driverId ||
              ""
            }
            onChange={(e) => {
              const driverId = e.target.value;
              if (driverId) onAssignDriver(booking.id, driverId);
            }}
          >
            <option value="">
              {t("m4.booking.selectDriver")}
            </option>

            {drivers.map((driver: Driver) => {
              // Mirror the backend's basic vehicle/busy checks; only the backend
              // can authorize an assignment and check payment/schedule conflicts.
              const compatibility = driverCompatibility({
                booking,
                driver,
                hasConflictingTrip: Boolean(driver.isOnTrip),
                attempted: false,
                now: new Date(),
                locationMaxAgeSeconds: 120,
                requireOnline: false,
                requireFreshLocation: false,
                rejectBusy: true,
              });
              const reason = compatibility.eligible ? null : compatibility.reason;
              const blocked = Boolean(reason) && driver.id !== booking.driverId;
              return (
                <option key={driver.id} value={driver.id} disabled={blocked}>
                  {driver.fullName} • {blocked
                    ? `⛔ ${t(`m4.driverReason.${reason}`, String(reason).replaceAll("_", " "))}`
                    : driver.isOnline ? "🟢" : "⚫"}
                </option>
              );
            })}
          </select>
          <p className="mt-2 text-xs leading-5 text-gray-600">
            {t("m4.booking.manualAssignmentHint", "Ineligible drivers are disabled. Offline drivers can be selected for manual assignment when eligible. The server performs final booking, payment, and schedule checks.")}
          </p>
        </Section>

        <Section title={t("m4.booking.changeStatus")}>
          <div className="flex flex-wrap gap-2">
            {STATUS_OPTIONS.map(
              (status) => (
                <button
                  key={status}
                  disabled={
                    updating
                  }
                  onClick={() =>
                    onStatusChange(
                      booking.id,
                      status
                    )
                  }
                  className={`px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                    booking.status ===
                    status
                      ? "bg-green-700 text-white"
                      : "bg-gray-100 hover:bg-gray-200 text-gray-700"
                  }`}
                >
                  {presentStatus("booking", status, locale)}
                </button>
              )
            )}
          </div>
        </Section>
      </div>
    </div>
  );
}

/* ========================================================= */
/* UI */
/* ========================================================= */

function DashboardCard({
  title,
  value,
  icon,
  color,
}: any) {
  const styles: any = {
    gray: "bg-gray-50 border-gray-200",
    amber:
      "bg-amber-50 border-amber-200",
    blue: "bg-blue-50 border-blue-200",
    purple:
      "bg-purple-50 border-purple-200",
    green:
      "bg-green-50 border-green-200",
  };

  return (
    <div
      className={`rounded-3xl border p-5 shadow-sm ${styles[color]}`}
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs font-bold text-gray-500 uppercase">
            {title}
          </div>

          <div className="text-3xl font-black text-gray-900 mt-2">
            {value}
          </div>
        </div>

        <div className="text-3xl">
          {icon}
        </div>
      </div>
    </div>
  );
}

function FilterButton({
  label,
  active,
  onClick,
}: any) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 rounded-full text-xs font-bold transition-all ${
        active
          ? "bg-green-700 text-white shadow-lg"
          : "bg-gray-100 text-gray-700 hover:bg-gray-200"
      }`}
    >
      {label}
    </button>
  );
}

function TableHead({
  children,
}: any) {
  return (
    <th className="text-left px-4 py-4 text-xs font-black uppercase text-gray-500 tracking-wide whitespace-nowrap">
      {children}
    </th>
  );
}

function TableCell({
  children,
}: any) {
  return (
    <td className="px-4 py-4 align-top whitespace-nowrap">
      {children}
    </td>
  );
}

function Section({
  title,
  children,
}: any) {
  return (
    <div>
      <h4 className="text-xs font-black uppercase tracking-wide text-gray-500 mb-3">
        {title}
      </h4>

      <div className="space-y-3">
        {children}
      </div>
    </div>
  );
}

function Info({
  label,
  value,
}: any) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-xs font-semibold text-gray-500">
        {label}
      </span>

      <span className="text-sm font-semibold text-gray-900 text-right max-w-[70%] break-words">
        {value}
      </span>
    </div>
  );
}

function parseChildrenDays(value?: string | null) {
  const match = value?.match(/\d+/);
  if (!match) return null;
  const days = Number(match[0]);
  return Number.isFinite(days) && days > 0 ? days : null;
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

function getChildrenServiceDays(booking: Booking) {
  const recurrence = booking.recurrenceType || booking.recurrence || "ONE_TIME";
  const customDays = parseChildrenDays(booking.recurrenceCustom);

  if (recurrence === "DAILY") return customDays || 5;
  if (recurrence === "WEEKLY") return customDays || 5;
  if (recurrence === "MONTHLY") return customDays || 20;
  if (recurrence === "CUSTOM") return customDays || 1;
  return 1;
}

function getChildrenPriceBreakdown(booking: Booking, locale: Parameters<typeof formatEuro>[1], t: (key: string) => string) {
  const serviceDays = getChildrenServiceDays(booking);
  const returnLegs = booking.returnDate && booking.returnTime ? 2 : 1;
  const total = Number(booking.fareTotalFare || booking.estimatedPrice || 0);

  return t("m4.booking.priceBreakdown")
    .replace("{legs}", formatNumber(returnLegs, locale))
    .replace("{days}", formatNumber(serviceDays, locale))
    .replace("{total}", formatEuro(total, locale));
}

function StatusBadge({
  status,
}: any) {
  const { locale } = useLanguage();
  const styles: any = {
    PENDING:
      "bg-amber-100 text-amber-700",
    CONFIRMED:
      "bg-blue-100 text-blue-700",
    ASSIGNED:
      "bg-purple-100 text-purple-700",
    DRIVER_ENROUTE:
      "bg-indigo-100 text-indigo-700",
    IN_PROGRESS:
      "bg-cyan-100 text-cyan-700",
    COMPLETED:
      "bg-green-100 text-green-700",
    CANCELLED:
      "bg-red-100 text-red-700",
    NO_SHOW:
      "bg-gray-100 text-gray-700",
  };

  return (
    <div
      className={`px-3 py-2 rounded-2xl text-xs font-black text-center ${styles[status]}`}
    >
      {presentStatus("booking", status, locale)}
    </div>
  );
}

function DispatchBadge({
  status,
}: any) {
  const { locale } = useLanguage();
  const value =
    status || "NOT_STARTED";

  const styles: any = {
    NOT_STARTED:
      "bg-gray-100 text-gray-700",

    SEARCHING_DRIVER:
      "bg-blue-100 text-blue-700",

    DISPATCHING:
      "bg-yellow-100 text-yellow-700",

    ACCEPTED:
      "bg-green-100 text-green-700",

    DISPATCH_EXHAUSTED:
      "bg-red-50 text-red-700",
    NO_DRIVER_AVAILABLE:
      "bg-red-100 text-red-700",
  };

  return (
    <div
      className={`px-3 py-2 rounded-2xl text-xs font-black text-center ${styles[value]}`}
    >
      {presentStatus("dispatch", value, locale)}
    </div>
  );
}

function getServiceIcon(
  type: string
) {
  const icons: Record<
    string,
    string
  > = {
    STANDARD: "🚕",
    ACCESSIBLE: "♿",
    SENIOR: "👴",
    CHILDREN: "👶",
    AIRPORT: "✈️",
  };

  return icons[type] || "🚗";
}

function getPaymentIcon(
  type: string
) {
  const icons: Record<
    string,
    string
  > = {
    CARD: "💳",
    CASH: "💵",
    INVOICE: "🏢",
  };

  return icons[type] || "💰";
}
