import { NAVIGATION_CONFIG, navigationLegForStatus, validCoordinate, type NavigationLeg } from "@/lib/navigation/config";

export type NavigationRoute = {
  bookingId: string; bookingVersion: string; state: string; leg: NavigationLeg;
  origin: { lat: number; lng: number; label?: string }; destination: { lat: number; lng: number; label?: string };
  distanceMeters: number; durationSeconds: number; polyline: string; provider: string; generatedAt: string;
};
export type RouteFailureCode = "NAVIGATION_NOT_AVAILABLE" | "ROUTE_PROVIDER_UNAVAILABLE";

function routeKey() { return process.env.GOOGLE_ROUTES_API_KEY?.trim() || process.env.GOOGLE_MAPS_API_KEY?.trim() || ""; }
function parseDuration(value: unknown) { const match = /^([0-9]+(?:\.[0-9]+)?)s$/.exec(String(value || "")); return match ? Math.max(0, Math.round(Number(match[1]))) : 0; }
export async function computeGoogleRoute(input: { origin: { lat: number; lng: number }; destination: { lat: number; lng: number }; }) {
  const key = routeKey(); if (!key) throw new Error("NAVIGATION_NOT_AVAILABLE");
  const response = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
    method: "POST", headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": "routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline" },
    body: JSON.stringify({ origin: { location: { latLng: { latitude: input.origin.lat, longitude: input.origin.lng } } }, destination: { location: { latLng: { latitude: input.destination.lat, longitude: input.destination.lng } } }, travelMode: "DRIVE", routingPreference: "TRAFFIC_AWARE", polylineQuality: "OVERVIEW", polylineEncoding: "ENCODED_POLYLINE" }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("ROUTE_PROVIDER_UNAVAILABLE");
  const data = await response.json() as any; const route = data.routes?.[0];
  if (!route || !Number.isFinite(Number(route.distanceMeters)) || !route.polyline?.encodedPolyline) throw new Error("ROUTE_PROVIDER_UNAVAILABLE");
  return { distanceMeters: Number(route.distanceMeters), durationSeconds: parseDuration(route.duration), polyline: String(route.polyline.encodedPolyline) };
}
export { NAVIGATION_CONFIG, navigationLegForStatus, validCoordinate };
