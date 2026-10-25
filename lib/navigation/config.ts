export const NAVIGATION_LEGS = ["TO_PICKUP", "AT_PICKUP", "TO_DROPOFF", "COMPLETE", "NONE"] as const;
export type NavigationLeg = (typeof NAVIGATION_LEGS)[number];
export type NavigationQuality = "GOOD" | "LOW_ACCURACY" | "STALE" | "UNAVAILABLE" | "PERMISSION_DENIED";

function positiveNumber(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}
export const NAVIGATION_CONFIG = {
  routeMaxAgeSeconds: positiveNumber("NAVIGATION_ROUTE_MAX_AGE_SECONDS", 120),
  routeRefreshDistanceMeters: positiveNumber("NAVIGATION_ROUTE_REFRESH_DISTANCE_METERS", 250),
  rerouteDeviationMeters: positiveNumber("NAVIGATION_REROUTE_DEVIATION_METERS", 150),
  locationIntervalMs: positiveNumber("NAVIGATION_LOCATION_INTERVAL_MS", 10000),
  locationMaxAgeSeconds: positiveNumber("NAVIGATION_LOCATION_MAX_AGE_SECONDS", 45),
};

export function navigationLegForStatus(status: string): NavigationLeg {
  if (["ASSIGNED", "CONFIRMED", "DRIVER_ENROUTE"].includes(status)) return "TO_PICKUP";
  if (status === "ARRIVED") return "AT_PICKUP";
  if (status === "IN_PROGRESS") return "TO_DROPOFF";
  if (status === "COMPLETED") return "COMPLETE";
  return "NONE";
}
export function navigationQuality(input: { accuracy?: number | null; receivedAt?: Date | string | null; now?: Date; permissionDenied?: boolean }) {
  if (input.permissionDenied) return "PERMISSION_DENIED" as const;
  if (input.accuracy === null || input.accuracy === undefined || !Number.isFinite(input.accuracy)) return "UNAVAILABLE" as const;
  if (input.accuracy > 100) return "LOW_ACCURACY" as const;
  if (!input.receivedAt) return "STALE" as const;
  const age = (input.now || new Date()).getTime() - new Date(input.receivedAt).getTime();
  return Number.isFinite(age) && age <= NAVIGATION_CONFIG.locationMaxAgeSeconds * 1000 ? "GOOD" as const : "STALE" as const;
}
export function validCoordinate(value: unknown, min: number, max: number): value is number { return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max; }
export function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const rad = Math.PI / 180; const dLat = (b.lat - a.lat) * rad; const dLng = (b.lng - a.lng) * rad;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}
export function routeNeedsRefresh(input: { routeGeneratedAt: Date | string; driver: { lat: number; lng: number }; routeOrigin: { lat: number; lng: number } }) {
  const age = Date.now() - new Date(input.routeGeneratedAt).getTime();
  return age >= NAVIGATION_CONFIG.routeMaxAgeSeconds * 1000 || haversineMeters(input.routeOrigin, input.driver) >= NAVIGATION_CONFIG.routeRefreshDistanceMeters;
}
