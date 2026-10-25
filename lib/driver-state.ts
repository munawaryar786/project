export const DRIVER_PRESENCE_STATES = [
  "OFFLINE",
  "AVAILABLE",
  "BUSY",
  "LOCATION_NOT_READY",
] as const;

export type DriverPresenceState = (typeof DRIVER_PRESENCE_STATES)[number];

export function isLocationFresh(
  receivedAt: Date | string | null | undefined,
  now = new Date(),
  maxAgeMs?: number,
) {
  if (!receivedAt) return false;
  const age = now.getTime() - new Date(receivedAt).getTime();
  if (!Number.isFinite(age) || age < 0) return false;
  if (maxAgeMs !== undefined && (!Number.isFinite(maxAgeMs) || maxAgeMs < 0)) return false;
  return maxAgeMs === undefined ? true : age <= maxAgeMs;
}

export function evaluateDriverPresence(input: {
  isOnline: boolean;
  isOnTrip: boolean;
  lastLocationReceivedAt?: Date | string | null;
  now?: Date;
  maxLocationAgeMs?: number;
}): DriverPresenceState {
  if (!input.isOnline) return "OFFLINE";
  if (input.isOnTrip) return "BUSY";
  if (!isLocationFresh(input.lastLocationReceivedAt, input.now, input.maxLocationAgeMs)) {
    return "LOCATION_NOT_READY";
  }
  return "AVAILABLE";
}

export const ACTIVE_TRIP_STATUSES = [
  "PENDING",
  "ASSIGNED",
  "CONFIRMED",
  "DRIVER_ENROUTE",
  "ARRIVED",
  "IN_PROGRESS",
  "SEARCHING_DRIVER",
] as const;

export function isActiveTripStatus(status: string) {
  return (ACTIVE_TRIP_STATUSES as readonly string[]).includes(status);
}

export function isTerminalTripStatus(status: string) {
  return ["COMPLETED", "CANCELLED", "NO_SHOW"].includes(status);
}

export const DRIVER_TRIP_TRANSITIONS: Record<string, string[]> = {
  ASSIGNED: ["DRIVER_ENROUTE"],
  CONFIRMED: ["DRIVER_ENROUTE"],
  DRIVER_ENROUTE: ["ARRIVED"],
  ARRIVED: ["IN_PROGRESS"],
  IN_PROGRESS: ["COMPLETED"],
};

export function canTransitionTrip(from: string, to: string) {
  return (DRIVER_TRIP_TRANSITIONS[from] || []).includes(to);
}

export function transitionError(from: string, to: string) {
  return "Cannot change booking from " + from + " to " + to;
}

export function parseClientTimestamp(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  const date = new Date(typeof value === "number" ? value : String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

export const DRIVER_ERROR_CODES = {
  AUTHENTICATION_REQUIRED: "AUTHENTICATION_REQUIRED",
  INVALID_REQUEST: "INVALID_REQUEST",
  DRIVER_NOT_FOUND: "DRIVER_NOT_FOUND",
  BOOKING_NOT_FOUND: "BOOKING_NOT_FOUND",
  OFFER_NOT_FOUND: "OFFER_NOT_FOUND",
  OFFER_EXPIRED: "OFFER_EXPIRED",
  OFFER_ALREADY_RESPONDED: "OFFER_ALREADY_RESPONDED",
  DRIVER_NOT_AVAILABLE: "DRIVER_NOT_AVAILABLE",
  BOOKING_ALREADY_CLAIMED: "BOOKING_ALREADY_CLAIMED",
  CONFLICTING_ACTIVE_TRIP: "CONFLICTING_ACTIVE_TRIP",
  INVALID_TRANSITION: "INVALID_TRANSITION",
  TRANSACTION_UNAVAILABLE: "TRANSACTION_UNAVAILABLE",
} as const;

export function errorBody(code: string, message: string) {
  return { error: message, code };
}
