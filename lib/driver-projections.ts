import type { Prisma } from "@prisma/client";

// Only assigned drivers may read this projection; it excludes auth, fare internals,
// email, sourceDomain, private free-form booking notes and medical appointment data.
export const DRIVER_TRIP_SELECT = {
  id: true, bookingRef: true, status: true, dispatchStatus: true, serviceType: true,
  pickupAddress: true, dropoffAddress: true, pickupLat: true, pickupLng: true, dropoffLat: true, dropoffLng: true,
  scheduledDate: true, scheduledTime: true, pickupDate: true, pickupTime: true, pickupAt: true, marketTimezone: true,
  passengerCount: true, luggageType: true, smallBags: true, largeBags: true,
  wheelchairNeeded: true, seniorPassenger: true, ztpCardHolder: true, wheelchairUser: true,
  companionRequired: true, assistanceLevel: true, wheelchairType: true, canTransferToSeat: true,
  wavRequired: true, passengerRemainsInWheelchair: true, companionCount: true,
  waitingTimeRequired: true, waitingDuration: true, customWaitingDuration: true,
  tripType: true, returnDate: true, returnTime: true, scheduledRide: true,
  recurrence: true, recurrenceType: true, recurrenceCustom: true,
  childFullName: true, childName: true, childAge: true, childSpecialRequirements: true,
  childrenDetails: true, parentFullName: true, guardianName: true,
  parentPrimaryPhone: true, guardianPhone: true, parentEmergencyPhone: true, guardianEmergencyPhone: true,
  institutionName: true, educationalInstitutionName: true, institutionAddress: true,
  customerName: true, customerPhone: true, customerPhoneCode: true,
  paymentMethod: true, cashAgreed: true, flightNumber: true, waitAndGreet: true, languagePref: true,
} satisfies Prisma.BookingSelect;

export const OFFER_BOOKING_SELECT = {
  id: true, bookingRef: true, status: true, dispatchStatus: true, serviceType: true,
  scheduledDate: true, scheduledTime: true, passengerCount: true, luggageType: true,
  smallBags: true, largeBags: true, wavRequired: true, wheelchairNeeded: true, wheelchairType: true, canTransferToSeat: true, waitingTimeRequired: true, vehicleRequired: true, tripType: true,
  returnDate: true, returnTime: true, scheduledRide: true, pickupDate: true, pickupTime: true, pickupAt: true, marketTimezone: true, distanceKm: true,
} satisfies Prisma.BookingSelect;
type OfferBooking = Prisma.BookingGetPayload<{ select: typeof OFFER_BOOKING_SELECT }>;
export function serializeOfferBooking(booking: OfferBooking) {
  // Do not guess locality by splitting a free-text address: arbitrary comma
  // layouts may still expose a street or building. No trusted locality exists.
  const safe = Object.fromEntries(Object.keys(OFFER_BOOKING_SELECT).map(key => [key, booking[key as keyof OfferBooking]]));
  return { ...safe, pickupArea: "Area unavailable", dropoffArea: "Area unavailable" };
}

export function serializeDriverTrip<T extends { childrenDetails?: Prisma.JsonValue }>(booking: T) {
  // Legacy JSON can contain keys outside the booking form's validated structure.
  // Keep only the fields used by assigned-driver Children operations.
  const childrenDetails = Array.isArray(booking.childrenDetails)
    ? booking.childrenDetails.filter(child => child !== null && typeof child === "object" && !Array.isArray(child))
      .map(child => {
        const row = child as Record<string, Prisma.JsonValue>;
        return {
          fullName: typeof row.fullName === "string" ? row.fullName : "",
          age: typeof row.age === "number" && Number.isFinite(row.age) ? row.age : null,
          specialRequirements: typeof row.specialRequirements === "string" ? row.specialRequirements : "",
        };
      })
    : null;
  return { ...booking, childrenDetails };
}
