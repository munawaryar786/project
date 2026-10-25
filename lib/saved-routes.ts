import { createHash } from "node:crypto";
import type { Booking, Prisma, SavedRoute } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isCustomerServiceEnabled } from "@/lib/feature-flags";

// No medical/child/guardian details, phone numbers, notes, payments or prices are
// persisted in saved-route templates. Coordinates/addresses are stored only by consent.
export const MAX_SAVED_ROUTES = 25;
export const SAVEABLE_SERVICES = ["STANDARD", "ACCESSIBLE", "SENIOR", "AIRPORT", "CHILDREN"] as const;
export type SaveRoutesDb = Pick<Prisma.TransactionClient, "savedRoute" | "booking" | "passenger">;
type RouteSource = Pick<Booking,
  "serviceType" | "pickupAddress" | "dropoffAddress" | "pickupLat" | "pickupLng" |
  "dropoffLat" | "dropoffLng" | "passengerCount" | "smallBags" | "largeBags" |
  "airline" | "waitAndGreet">;
export type RouteFields = Pick<SavedRoute,
  "label" | "fingerprint" | "serviceType" | "pickupAddress" | "dropoffAddress" |
  "pickupLat" | "pickupLng" | "dropoffLat" | "dropoffLng" | "passengerCount" |
  "smallBags" | "largeBags" | "luggageType" | "airline" | "waitAndGreet">;

export function normalizeRouteService(service: string) {
  const normalized = service.trim().toUpperCase();
  if (!SAVEABLE_SERVICES.includes(normalized as typeof SAVEABLE_SERVICES[number])) return null;
  return isCustomerServiceEnabled(normalized) ? normalized : null;
}

export function routeFingerprint(pickup: string, dropoff: string, service: string) {
  const canonical = (s: string) => s.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en");
  return createHash("sha256").update(JSON.stringify([canonical(pickup), canonical(dropoff), service])).digest("hex");
}

export function routeFromBooking(booking: RouteSource): RouteFields | null {
  const service = normalizeRouteService(booking.serviceType);
  if (!service || booking.pickupAddress.trim().length < 3 || booking.pickupAddress.trim().length > 240 ||
      booking.dropoffAddress.trim().length < 3 || booking.dropoffAddress.trim().length > 240 ||
      /[\u0000-\u001f\u007f]/.test(booking.pickupAddress + booking.dropoffAddress) ||
      booking.passengerCount < 1 || booking.passengerCount > 6 ||
      (booking.passengerCount === 6 && booking.largeBags > 0)) return null;
  const pickupAddress = booking.pickupAddress.trim().slice(0, 240);
  const dropoffAddress = booking.dropoffAddress.trim().slice(0, 240);
  const smallBags = Math.max(0, Math.min(12, booking.smallBags || 0));
  const largeBags = service === "CHILDREN" ? 0 : Math.max(0, Math.min(12, booking.largeBags || 0));
  return {
    label: `${pickupAddress.slice(0, 29)} → ${dropoffAddress.slice(0, 29)}`.slice(0, 80),
    fingerprint: routeFingerprint(pickupAddress, dropoffAddress, service),
    serviceType: service, pickupAddress, dropoffAddress,
    pickupLat: booking.pickupLat, pickupLng: booking.pickupLng,
    dropoffLat: booking.dropoffLat, dropoffLng: booking.dropoffLng,
    passengerCount: booking.passengerCount,
    smallBags: service === "CHILDREN" ? 0 : smallBags,
    largeBags,
    luggageType: service === "CHILDREN" ? "NONE" : largeBags ? "LARGE" : smallBags ? "SMALL" : "NONE",
    airline: service === "AIRPORT" ? booking.airline?.slice(0, 80) || null : null,
    waitAndGreet: service === "AIRPORT" && Boolean(booking.waitAndGreet),
  };
}

export const savedRouteSelect = {
  id: true, label: true, serviceType: true, pickupAddress: true, dropoffAddress: true,
  pickupLat: true, pickupLng: true, dropoffLat: true, dropoffLng: true,
  passengerCount: true, smallBags: true, largeBags: true, luggageType: true,
  airline: true, waitAndGreet: true, createdAt: true, updatedAt: true,
} as const;

export type SaveRouteResult = { ok: true } | { ok: false; code: "ROUTE_LIMIT" | "ROUTE_NOT_ELIGIBLE" };
export async function saveRouteFromBooking(
  passengerId: string, booking: RouteSource, db: SaveRoutesDb = prisma,
): Promise<SaveRouteResult> {
  const fields = routeFromBooking(booking);
  if (!fields) return { ok: false, code: "ROUTE_NOT_ELIGIBLE" };
  const existing = await db.savedRoute.findUnique({ where: { passengerId_fingerprint: { passengerId, fingerprint: fields.fingerprint } }, select: { id: true } });
  if (!existing && await db.savedRoute.count({ where: { passengerId } }) >= MAX_SAVED_ROUTES) return { ok: false, code: "ROUTE_LIMIT" };
  const { label, ...reusableFields } = fields;
  await db.savedRoute.upsert({
    where: { passengerId_fingerprint: { passengerId, fingerprint: fields.fingerprint } },
    create: { passengerId, ...fields },
    update: reusableFields,
  });
  return { ok: true };
}

// Called ONLY for verified, owned public bookings from inside the booking creation
// transaction. CHILDREN routes require explicit manual consent and are never autosaved.
export async function autoSaveVerifiedBooking(
  passengerId: string, booking: RouteSource, db: SaveRoutesDb,
) {
  if (booking.serviceType === "CHILDREN") return;
  const passenger = await db.passenger.findUnique({ where: { id: passengerId }, select: { autoSaveRoutes: true } });
  if (!passenger?.autoSaveRoutes) return;
  // Saving a route is a convenience, never a reason to reject a paid/valid booking.
  // A route-limit condition is deliberately a no-op.
  await saveRouteFromBooking(passengerId, booking, db);
}

export function editedRouteFields(existing: RouteFields, update: {
  label?: string; pickupAddress?: string; dropoffAddress?: string; serviceType?: string;
  passengerCount?: number; smallBags?: number; largeBags?: number;
  airline?: string | null; waitAndGreet?: boolean;
}): RouteFields | null {
  // A disabled legacy service remains renameable/deletable, but cannot be
  // selected as a new service for fresh templates or rebooked.
  const serviceType = update.serviceType !== undefined
    ? (update.serviceType === existing.serviceType ? existing.serviceType : normalizeRouteService(update.serviceType))
    : (SAVEABLE_SERVICES.includes(existing.serviceType as typeof SAVEABLE_SERVICES[number]) ? existing.serviceType : null);
  if (!serviceType) return null;
  const pickupAddress = (update.pickupAddress ?? existing.pickupAddress).trim();
  const dropoffAddress = (update.dropoffAddress ?? existing.dropoffAddress).trim();
  const passengerCount = update.passengerCount ?? existing.passengerCount;
  const smallBags = serviceType === "CHILDREN" ? 0 : update.smallBags ?? existing.smallBags;
  const largeBags = serviceType === "CHILDREN" ? 0 : update.largeBags ?? existing.largeBags;
  if (pickupAddress.length < 3 || pickupAddress.length > 240 || dropoffAddress.length < 3 || dropoffAddress.length > 240 ||
      /[\u0000-\u001f\u007f]/.test(pickupAddress + dropoffAddress + (update.label ?? existing.label)) ||
      !Number.isInteger(passengerCount) || passengerCount < 1 || passengerCount > 6 ||
      !Number.isInteger(smallBags) || smallBags < 0 || smallBags > 12 ||
      !Number.isInteger(largeBags) || largeBags < 0 || largeBags > 12 ||
      (passengerCount >= 6 && largeBags > 0)) return null;
  const pickupChanged = pickupAddress !== existing.pickupAddress;
  const dropoffChanged = dropoffAddress !== existing.dropoffAddress;
  return {
    label: update.label ?? existing.label,
    serviceType, pickupAddress, dropoffAddress, passengerCount, smallBags, largeBags,
    luggageType: largeBags ? "LARGE" : smallBags ? "SMALL" : "NONE",
    fingerprint: routeFingerprint(pickupAddress, dropoffAddress, serviceType),
    pickupLat: pickupChanged ? null : existing.pickupLat,
    pickupLng: pickupChanged ? null : existing.pickupLng,
    dropoffLat: dropoffChanged ? null : existing.dropoffLat,
    dropoffLng: dropoffChanged ? null : existing.dropoffLng,
    airline: serviceType === "AIRPORT" ? (update.airline === undefined ? existing.airline : update.airline) : null,
    waitAndGreet: serviceType === "AIRPORT" && (update.waitAndGreet ?? existing.waitAndGreet),
  };
}
