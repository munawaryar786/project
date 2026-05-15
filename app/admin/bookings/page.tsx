"use client";

import { useEffect, useMemo, useState } from "react";

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
  wheelchairNeeded: boolean;

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

  driverId?: string | null;
  driver?: Driver | null;

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
  "ACCEPTED",
  "NO_DRIVER_AVAILABLE",
];

export default function AdminBookingsPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [selectedBooking, setSelectedBooking] =
    useState<Booking | null>(null);

  const [search, setSearch] = useState("");

  const [statusFilter, setStatusFilter] = useState("ALL");

  const [dispatchFilter, setDispatchFilter] =
    useState("ALL");

  const [lastUpdated, setLastUpdated] =
    useState<string>("");

  const [updating, setUpdating] = useState(false);

  const [dispatchingId, setDispatchingId] =
    useState<string | null>(null);

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

      const res = await fetch(
        "/api/admin/bookings",
        {
          cache: "no-store",
        }
      );

      const data: any = await safeJson(res);

      const list = data.bookings || [];

      setBookings(list);

      setLastUpdated(
        new Date().toLocaleTimeString()
      );

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
      const res = await fetch(
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

      const res = await fetch(
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
        alert(data.error);
        return;
      }

      await fetchBookings(false);
    } catch (err) {
      console.error(err);

      alert("Update failed");
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

      const res = await fetch(
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
        alert(data.error);
        return;
      }

      await fetchBookings(false);
    } catch (err) {
      console.error(err);

      alert("Driver assign failed");
    } finally {
      setUpdating(false);
    }
  };

  const startDispatch = async (
    bookingId: string
  ) => {
    try {
      setDispatchingId(bookingId);

      const res = await fetch(
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
        alert(data.error);
        return;
      }

      alert(
        data.driver?.fullName
          ? `Dispatch sent to ${data.driver.fullName}`
          : "Dispatch started"
      );

      await fetchBookings(false);
    } catch (err) {
      console.error(err);

      alert("Dispatch failed");
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
          "SEARCHING_DRIVER"
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
            Loading Admin System...
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
                📋 Booking Operations
              </h1>

              <div className="px-3 py-1 rounded-full bg-green-100 text-green-700 text-xs font-bold flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                LIVE
              </div>
            </div>

            <p className="text-sm text-gray-500 mt-2">
              Real-time dispatch &
              booking management
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-xs text-gray-400">
                Last Sync
              </div>

              <div className="text-sm font-semibold text-gray-700">
                {lastUpdated || "--"}
              </div>
            </div>

            <button
              onClick={refreshData}
              className="h-11 px-5 rounded-2xl bg-green-700 hover:bg-green-800 text-white font-semibold text-sm transition-all"
            >
              {refreshing
                ? "🔄 Refreshing..."
                : "🔄 Refresh"}
            </button>
          </div>
        </div>
      </div>

      {/* STATS */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <DashboardCard
          title="Total"
          value={stats.total}
          icon="📦"
          color="gray"
        />

        <DashboardCard
          title="Pending"
          value={stats.pending}
          icon="🆕"
          color="amber"
        />

        <DashboardCard
          title="Active"
          value={stats.active}
          icon="🚕"
          color="blue"
        />

        <DashboardCard
          title="Searching"
          value={stats.searching}
          icon="📡"
          color="purple"
        />

        <DashboardCard
          title="Completed"
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
            placeholder="Search booking, customer, route..."
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
            ✕ Reset
          </button>
        </div>

        <div className="mt-5">
          <p className="text-xs font-bold text-gray-500 mb-2">
            BOOKING STATUS
          </p>

          <div className="flex flex-wrap gap-2">
            <FilterButton
              label="ALL"
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
                label={status}
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
            DISPATCH STATUS
          </p>

          <div className="flex flex-wrap gap-2">
            <FilterButton
              label="ALL"
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
                  label={status}
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
                🚖 Active Reservations
              </h2>

              <p className="text-sm text-gray-500 mt-1">
                {
                  filteredBookings.length
                }{" "}
                bookings found
              </p>
            </div>
          </div>

          <div className="overflow-auto max-h-[80vh]">
            <table className="w-full min-w-[1200px]">
              <thead className="sticky top-0 bg-gray-50 z-20">
                <tr className="border-b border-gray-100">
                  <TableHead>
                    Ref
                  </TableHead>

                  <TableHead>
                    Status
                  </TableHead>

                  <TableHead>
                    Dispatch
                  </TableHead>

                  <TableHead>
                    Service
                  </TableHead>

                  <TableHead>
                    Customer
                  </TableHead>

                  <TableHead>
                    Route
                  </TableHead>

                  <TableHead>
                    Driver
                  </TableHead>

                  <TableHead>
                    Payment
                  </TableHead>

                  <TableHead>
                    Price
                  </TableHead>
                </tr>
              </thead>

              <tbody>
                {filteredBookings.map(
                  (booking) => (
                    <tr
                      key={booking.id}
                      onClick={() =>
                        setSelectedBooking(
                          booking
                        )
                      }
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
                          {
                            booking.scheduledDate
                          }{" "}
                          •{" "}
                          {
                            booking.scheduledTime
                          }
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
                          {
                            booking.serviceType
                          }
                        </div>

                        <div className="text-xs text-gray-400 mt-1">
                          👥{" "}
                          {
                            booking.passengerCount
                          }
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
                                ? "🟢 Online"
                                : "⚫ Offline"}
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs text-red-500 font-semibold">
                            No Driver
                          </span>
                        )}
                      </TableCell>

                      <TableCell>
                        <div className="font-semibold text-sm">
                          {getPaymentIcon(
                            booking.paymentMethod
                          )}{" "}
                          {
                            booking.paymentMethod
                          }
                        </div>
                      </TableCell>

                      <TableCell>
                        <div className="font-black text-green-700">
                          €
                          {booking.estimatedPrice?.toFixed(
                            2
                          ) || "0"}
                        </div>

                        <div className="text-xs text-gray-400">
                          {
                            booking.distanceKm
                          }
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
                Select Booking
              </h3>

              <p className="text-sm text-gray-500 mt-2">
                Click any booking to open
                operational controls
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
  return (
    <div className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="p-5 border-b border-gray-100 bg-gradient-to-r from-green-50 to-white">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs text-green-700 font-black uppercase tracking-wide">
              Booking Detail
            </div>

            <h3 className="font-black text-gray-900 text-lg mt-1">
              {booking.bookingRef}
            </h3>
          </div>

          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-gray-100 hover:bg-gray-200"
          >
            ✕
          </button>
        </div>
      </div>

      <div className="p-5 space-y-5 max-h-[80vh] overflow-auto">
        <Section title="Ride Status">
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

        <Section title="Customer">
          <Info
            label="Name"
            value={booking.customerName}
          />

          <Info
            label="Phone"
            value={`${booking.customerPhoneCode}${booking.customerPhone}`}
          />

          <Info
            label="Email"
            value={
              booking.customerEmail ||
              "N/A"
            }
          />
        </Section>

        <Section title="Trip">
          <Info
            label="Pickup"
            value={
              booking.pickupAddress
            }
          />

          <Info
            label="Dropoff"
            value={
              booking.dropoffAddress
            }
          />

          <Info
            label="Date"
            value={`${booking.scheduledDate} ${booking.scheduledTime}`}
          />

          <Info
            label="Distance"
            value={`${booking.distanceKm} km`}
          />

          <Info
            label="Price"
            value={`€${booking.estimatedPrice}`}
          />
        </Section>

        <Section title="Dispatch">
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
              ? "⏳ Dispatching..."
              : "📡 Start Dispatch"}
          </button>
        </Section>

        <Section title="Driver Assign">
          <select
            className="w-full h-12 rounded-2xl border border-gray-200 px-4 text-sm"
            value={
              booking.driverId ||
              ""
            }
            onChange={(e) =>
              onAssignDriver(
                booking.id,
                e.target.value
              )
            }
          >
            <option value="">
              Select Driver
            </option>

            {drivers.map(
              (driver: Driver) => (
                <option
                  key={driver.id}
                  value={driver.id}
                >
                  {
                    driver.fullName
                  }{" "}
                  •{" "}
                  {driver.isOnline
                    ? "🟢"
                    : "⚫"}
                </option>
              )
            )}
          </select>
        </Section>

        <Section title="Change Status">
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
                  {status}
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

function StatusBadge({
  status,
}: any) {
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
      {status}
    </div>
  );
}

function DispatchBadge({
  status,
}: any) {
  const value =
    status || "NOT_STARTED";

  const styles: any = {
    NOT_STARTED:
      "bg-gray-100 text-gray-700",

    SEARCHING_DRIVER:
      "bg-blue-100 text-blue-700",

    ACCEPTED:
      "bg-green-100 text-green-700",

    NO_DRIVER_AVAILABLE:
      "bg-red-100 text-red-700",
  };

  return (
    <div
      className={`px-3 py-2 rounded-2xl text-xs font-black text-center ${styles[value]}`}
    >
      {value}
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