import { ACTIVE_TRIP_STATUSES, isLocationFresh } from "@/lib/driver-state";

export const DISPATCH_REASON = {
  BOOKING_NOT_DISPATCHABLE: "BOOKING_NOT_DISPATCHABLE",
  BOOKING_ALREADY_ASSIGNED: "BOOKING_ALREADY_ASSIGNED",
  SCHEDULED_RIDE: "SCHEDULED_RIDE",
  PAYMENT_NOT_CONFIRMED: "PAYMENT_NOT_CONFIRMED",
  NO_PICKUP_COORDINATES: "NO_PICKUP_COORDINATES",
  DRIVER_OFFLINE: "DRIVER_OFFLINE",
  DRIVER_LOCATION_MISSING: "DRIVER_LOCATION_MISSING",
  DRIVER_LOCATION_STALE: "DRIVER_LOCATION_STALE",
  DRIVER_BUSY: "DRIVER_BUSY",
  DRIVER_INACTIVE: "DRIVER_INACTIVE",
  SERVICE_INCOMPATIBLE: "SERVICE_INCOMPATIBLE",
  VEHICLE_INCOMPATIBLE: "VEHICLE_INCOMPATIBLE",
  CAPACITY_EXCEEDED: "CAPACITY_EXCEEDED",
  LUGGAGE_INCOMPATIBLE: "LUGGAGE_INCOMPATIBLE",
  ACCESSIBILITY_INCOMPATIBLE: "ACCESSIBILITY_INCOMPATIBLE",
  WAV_REQUIRED: "WAV_REQUIRED",
  ALREADY_OFFERED: "ALREADY_OFFERED",
  NO_ELIGIBLE_DRIVER: "NO_ELIGIBLE_DRIVER",
  DISPATCH_STATE_CONFLICT: "DISPATCH_STATE_CONFLICT",
} as const;

export type DispatchReasonCode = (typeof DISPATCH_REASON)[keyof typeof DISPATCH_REASON];

const finiteCoordinate = (value: unknown, min: number, max: number) => {
  if (typeof value !== "number") return null;
  return Number.isFinite(value) && value >= min && value <= max ? value : null;
};

export function bookingDispatchEligibility(booking: any, options: { allowScheduled?: boolean } = {}) {
  if (!booking) return { eligible: false as const, reason: DISPATCH_REASON.BOOKING_NOT_DISPATCHABLE };
  if (booking.driverId) return { eligible: false as const, reason: DISPATCH_REASON.BOOKING_ALREADY_ASSIGNED };
  if (["CANCELLED", "COMPLETED", "NO_SHOW"].includes(booking.status)) {
    return { eligible: false as const, reason: DISPATCH_REASON.BOOKING_NOT_DISPATCHABLE };
  }
  if (!["PENDING", "CONFIRMED", "SEARCHING_DRIVER"].includes(booking.status)) {
    return { eligible: false as const, reason: DISPATCH_REASON.BOOKING_NOT_DISPATCHABLE };
  }
  if (booking.dispatchStatus === "ACCEPTED") {
    return { eligible: false as const, reason: DISPATCH_REASON.BOOKING_ALREADY_ASSIGNED };
  }
  if (booking.scheduledRide === true && options.allowScheduled !== true) {
    return { eligible: false as const, reason: DISPATCH_REASON.SCHEDULED_RIDE };
  }
  if (booking.paymentMethod === "CARD" && booking.status === "PENDING") {
    return { eligible: false as const, reason: DISPATCH_REASON.PAYMENT_NOT_CONFIRMED };
  }
  if (finiteCoordinate(booking.pickupLat, -90, 90) === null || finiteCoordinate(booking.pickupLng, -180, 180) === null) {
    return { eligible: false as const, reason: DISPATCH_REASON.NO_PICKUP_COORDINATES };
  }
  return { eligible: true as const };
}

export type DriverCompatibilityInput = {
  booking: any;
  driver: any;
  hasConflictingTrip: boolean;
  attempted: boolean;
  now: Date;
  locationMaxAgeSeconds: number;
  requireOnline?: boolean;
  requireFreshLocation?: boolean;
  rejectBusy?: boolean;
};

function normalized(value: unknown) {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

export function driverCompatibility(input: DriverCompatibilityInput) {
  const { booking, driver } = input;
  if (input.attempted) return { eligible: false as const, reason: DISPATCH_REASON.ALREADY_OFFERED };
  if (!driver || driver.status !== "ACTIVE") return { eligible: false as const, reason: DISPATCH_REASON.DRIVER_INACTIVE };
  if (input.requireOnline !== false && !driver.isOnline) return { eligible: false as const, reason: DISPATCH_REASON.DRIVER_OFFLINE };
  if (input.rejectBusy !== false && (driver.isOnTrip || input.hasConflictingTrip)) return { eligible: false as const, reason: DISPATCH_REASON.DRIVER_BUSY };
  if (input.requireFreshLocation !== false && (driver.currentLat === null || driver.currentLat === undefined || driver.currentLng === null || driver.currentLng === undefined)) {
    return { eligible: false as const, reason: DISPATCH_REASON.DRIVER_LOCATION_MISSING };
  }
  if (input.requireFreshLocation !== false && !isLocationFresh(driver.lastLocationReceivedAt, input.now, input.locationMaxAgeSeconds * 1000)) {
    return { eligible: false as const, reason: DISPATCH_REASON.DRIVER_LOCATION_STALE };
  }

  const vehicle = driver.vehicle;
  const vehicleStatus = vehicle?.status ?? "ACTIVE";
  if (vehicle && vehicleStatus !== "ACTIVE") return { eligible: false as const, reason: DISPATCH_REASON.VEHICLE_INCOMPATIBLE };
  const type = normalized(vehicle?.type || driver.vehicleType);
  const capacity = Number(vehicle?.maxPassengers ?? driver.vehicleCapacity);
  if (!type || !Number.isFinite(capacity) || capacity < 1) {
    return { eligible: false as const, reason: DISPATCH_REASON.VEHICLE_INCOMPATIBLE };
  }

  const passengerCount = Number(booking.passengerCount || 0) + Number(booking.companionCount || 0);
  if (!Number.isFinite(passengerCount) || passengerCount < 1 || passengerCount > capacity) {
    return { eligible: false as const, reason: DISPATCH_REASON.CAPACITY_EXCEEDED };
  }

  const luggage = normalized(booking.luggageType);
  const hasLuggage = Number(booking.smallBags || 0) + Number(booking.largeBags || 0) > 0 || luggage !== "NONE";
  if (hasLuggage && passengerCount >= 5 && ["STANDARD", "SEDAN", "TAXI"].includes(type)) {
    return { eligible: false as const, reason: DISPATCH_REASON.LUGGAGE_INCOMPATIBLE };
  }

  const requiresWav = booking.wavRequired === true;
  if (requiresWav && !(vehicle?.wheelchairAccessible === true || type === "WAV")) {
    return { eligible: false as const, reason: DISPATCH_REASON.WAV_REQUIRED };
  }
  if (booking.wheelchairNeeded === true && booking.canTransferToSeat === false &&
      !(vehicle?.wheelchairAccessible === true || type === "WAV")) {
    return { eligible: false as const, reason: DISPATCH_REASON.ACCESSIBILITY_INCOMPATIBLE };
  }

  const service = normalized(booking.serviceType);
  if (service === "ACCESSIBLE" || service === "SENIOR") {
    if (booking.canTransferToSeat === false && !(vehicle?.wheelchairAccessible === true || type === "WAV")) {
      return { eligible: false as const, reason: DISPATCH_REASON.ACCESSIBILITY_INCOMPATIBLE };
    }
  }
  if (service === "CHILDREN" && passengerCount > capacity) {
    return { eligible: false as const, reason: DISPATCH_REASON.CAPACITY_EXCEEDED };
  }

  return { eligible: true as const, capacity, vehicleType: type };
}

export function haversineDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const radius = 6371;
  const latDelta = ((lat2 - lat1) * Math.PI) / 180;
  const lngDelta = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(latDelta / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(lngDelta / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function rankDrivers(booking: any, drivers: any[]) {
  const pickupLat = finiteCoordinate(booking.pickupLat, -90, 90);
  const pickupLng = finiteCoordinate(booking.pickupLng, -180, 180);
  if (pickupLat === null || pickupLng === null) return [];
  return drivers.map(driver => ({
    driver,
    distanceKm: haversineDistanceKm(pickupLat, pickupLng, Number(driver.currentLat), Number(driver.currentLng)),
  })).sort((a, b) => a.distanceKm - b.distanceKm || String(a.driver.id).localeCompare(String(b.driver.id)));
}

export { ACTIVE_TRIP_STATUSES };
