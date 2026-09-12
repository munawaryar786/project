import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeDriver } from "@/lib/security/authorization";
import { isLocationFresh } from "@/lib/driver-state";
import { NAVIGATION_CONFIG, computeGoogleRoute, navigationLegForStatus, validCoordinate } from "@/lib/navigation/routes";

const NAVIGABLE_STATES = ["ASSIGNED", "CONFIRMED", "DRIVER_ENROUTE", "ARRIVED", "IN_PROGRESS"];
function json(data: unknown, status = 200) { return NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store, max-age=0" } }); }
export async function GET(request: NextRequest) {
  const auth = await authorizeDriver(request); if (!auth.ok) return auth.response;
  const requestedId = request.nextUrl.searchParams.get("bookingId");
  const booking = await prisma.booking.findFirst({ where: { ...(requestedId ? { id: requestedId } : {}), driverId: auth.actor.id, status: { in: NAVIGABLE_STATES } }, orderBy: { updatedAt: "desc" }, select: { id: true, status: true, updatedAt: true, pickupAddress: true, dropoffAddress: true, pickupLat: true, pickupLng: true, dropoffLat: true, dropoffLng: true } });
  if (!booking) return json({ error: "No active assigned trip", code: "ACTIVE_TRIP_NOT_FOUND" }, 404);
  const leg = navigationLegForStatus(booking.status);
  if (leg === "NONE") return json({ error: "Navigation is not available for this state", code: "INVALID_NAVIGATION_STATE" }, 409);
  const driver = await prisma.driver.findUnique({ where: { id: auth.actor.id }, select: { currentLat: true, currentLng: true, lastLocationReceivedAt: true, lastLocationAccuracy: true } });
  const base = { bookingId: booking.id, bookingVersion: booking.updatedAt.toISOString(), state: booking.status, leg };
  if (leg === "AT_PICKUP") return json({ ...base, route: null, waiting: true, waitingSince: booking.updatedAt.toISOString(), destination: validCoordinate(booking.pickupLat, -90, 90) && validCoordinate(booking.pickupLng, -180, 180) ? { lat: booking.pickupLat, lng: booking.pickupLng, label: booking.pickupAddress } : null });
  if (!driver || !validCoordinate(driver.currentLat, -90, 90) || !validCoordinate(driver.currentLng, -180, 180)) return json({ ...base, error: "Driver location is unavailable", code: "DRIVER_LOCATION_UNAVAILABLE" }, 409);
  if (!isLocationFresh(driver.lastLocationReceivedAt, new Date(), NAVIGATION_CONFIG.locationMaxAgeSeconds * 1000)) return json({ ...base, error: "Driver location is stale", code: "DRIVER_LOCATION_STALE" }, 409);
  const destinationLat = leg === "TO_PICKUP" ? booking.pickupLat : booking.dropoffLat;
  const destinationLng = leg === "TO_PICKUP" ? booking.pickupLng : booking.dropoffLng;
  const destinationLabel = leg === "TO_PICKUP" ? booking.pickupAddress : booking.dropoffAddress;
  if (!validCoordinate(destinationLat, -90, 90) || !validCoordinate(destinationLng, -180, 180)) return json({ ...base, error: "Navigation coordinates are unavailable", code: "NAVIGATION_NOT_AVAILABLE" }, 409);
  const destination = { lat: destinationLat, lng: destinationLng, label: destinationLabel };
  const origin = { lat: driver.currentLat, lng: driver.currentLng };
  try {
    const route = await computeGoogleRoute({ origin, destination });
    return json({ ...base, route: { ...route, origin, destination, provider: "google-routes", generatedAt: new Date().toISOString() }, gps: { receivedAt: driver.lastLocationReceivedAt, accuracy: driver.lastLocationAccuracy } });
  } catch (error) {
    const code = error instanceof Error && error.message === "NAVIGATION_NOT_AVAILABLE" ? "NAVIGATION_NOT_AVAILABLE" : "ROUTE_PROVIDER_UNAVAILABLE";
    return json({ ...base, error: code === "NAVIGATION_NOT_AVAILABLE" ? "Navigation is not configured" : "Route provider unavailable", code }, 503);
  }
}
