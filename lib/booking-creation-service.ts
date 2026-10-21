import { writeBookingCreatedEmail } from "@/lib/email/domain";
import type { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { BookingSchema, type BookingInput } from "@/lib/booking-schema";
import { generateBookingRef, getSourceDomain } from "@/lib/utils";
import { estimateBookingPrice } from "@/lib/pricing";
import { calculateAuthoritativeBookingQuote } from "@/lib/booking-quote";
import { marketLocalDateTime, bookingPickupIsExpired } from "@/lib/market-booking-time";
import { authorizePassenger, getPassengerFromRequest, normalizePassengerPhone } from "@/lib/passenger-auth";
import { isCustomerServiceEnabled } from "@/lib/feature-flags";
import { signBookingPrice } from "@/lib/security/booking-price";
import { requiresWav } from "@/lib/assisted-transport";
import { startAutomaticDispatch } from "@/lib/automatic-dispatch";
import { isScheduledBooking, parseMarketDateTime, SCHEDULED_MARKET_CONFIG } from "@/lib/scheduled-marketplace";
import { recordDispatchAudit } from "@/lib/dispatch-audit";
import { createPublicBookingAccess } from "@/lib/booking-access";
import { writeBookingActivationIntent } from "@/lib/booking-activation";

export type BookingCreateActor =
  | { kind: "PUBLIC" }
  | { kind: "DISPATCH_OPERATOR"; operatorId: string };

export class BookingCreateError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string, readonly details?: unknown, readonly response?: NextResponse) { super(message); }
}

export async function createBookingWithDrivoRules(request: NextRequest, data: BookingInput, actor: BookingCreateActor, options: { requestRecordId?: string; requestLeaseToken?: string; publicOperation?: { id: string; leaseToken: string; fingerprint: string; passengerId: string | null } } = {}) {
  if (data.paymentMethod === "INVOICE") throw new BookingCreateError("Invoice requires approved corporate billing. Choose card or cash.", 409, "INVOICE_REQUIRES_CORPORATE_APPROVAL");
  const marketTimezone = SCHEDULED_MARKET_CONFIG.timezone;
  const now = new Date();
  if (data.pickupMode === "NOW" && (data.scheduledRide || data.serviceType === "CHILDREN")) {
    throw new BookingCreateError("Invalid pickup mode", 400, "INVALID_PICKUP_MODE");
  }
  const isRideNow = data.pickupMode === "NOW";
  const marketNow = isRideNow ? marketLocalDateTime(now, marketTimezone) : null;
  const bookingScheduledDate = marketNow?.date || data.scheduledDate;
  const bookingScheduledTime = marketNow?.time || data.scheduledTime;
  const pickupAt = isRideNow ? now : parseMarketDateTime(
    data.pickupDate || bookingScheduledDate,
    data.pickupTime || bookingScheduledTime,
    marketTimezone,
  );
  if (!pickupAt) throw new BookingCreateError("Invalid scheduled pickup date/time", 400, "INVALID_SCHEDULE_TIME");
  const strictFuture = data.pickupMode === "SCHEDULED" || data.scheduledRide || data.serviceType === "CHILDREN";
  if (bookingPickupIsExpired(pickupAt, now, strictFuture)) {
    throw new BookingCreateError("Pickup date/time must not be in the past", 400, "PICKUP_IN_PAST");
  }
  const scheduledIntent = !isRideNow && (
    data.scheduledRide || data.serviceType === "CHILDREN" ||
    pickupAt.getTime() > now.getTime() + 5 * 60 * 1000
  );
  if (!isCustomerServiceEnabled(data.serviceType)) throw new BookingCreateError("Children Transport is temporarily unavailable for new bookings.", 409);

  let currentPassenger: { id: string; normalizedPhone: string | null; phone: string; phoneVerified: boolean } | null = null;
  if (actor.kind === "PUBLIC") {
    currentPassenger = await getPassengerFromRequest(request);
    if (options.publicOperation && (currentPassenger?.id || null) !== options.publicOperation.passengerId) {
      throw new BookingCreateError("Passenger session changed.", 401, "BOOKING_OPERATION_AUTH_CHANGED");
    }
    if (currentPassenger) {
      const auth = await authorizePassenger(request);
      if (!auth.ok) throw new BookingCreateError("Passenger authentication required", auth.response.status, undefined, undefined, auth.response);
    }
  }

  if (data.companionRequired) {
    if (data.serviceType !== "ACCESSIBLE" && data.serviceType !== "SENIOR") throw new BookingCreateError("Companion assistance requires assisted transport.", 400, "INVALID_COMPANION_ASSISTANCE");
    if (data.companionCount < 1 || data.companionHours < 1) throw new BookingCreateError("Companion count and hours are required.", 400, "COMPANION_HOURS_REQUIRED");
  } else if (data.companionHours !== 0) {
    throw new BookingCreateError("Companion hours require companion assistance.", 400, "INVALID_COMPANION_ASSISTANCE");
  }
  const normalizedPhone = normalizePassengerPhone(`${data.customerPhoneCode}${data.customerPhone}`);
  const capacityPassengerCount = data.passengerCount + data.companionCount;
  const wavRequired = requiresWav({ ...data, passengerRemainsInWheelchair: data.passengerRemainsInWheelchair });
  if (wavRequired) throw new BookingCreateError("WAV vehicles are currently fully booked. Passengers who can transfer to a regular seat may still be transported.", 409, "WAV_FULLY_BOOKED");
  if (capacityPassengerCount > 6) throw new BookingCreateError("Passenger capacity exceeded limit of 6.", 400);

  if (data.serviceType === "CHILDREN") {
    if (!data.educationalDestinationValidated) throw new BookingCreateError("Please select a verified school, college, university, or approved educational institution.", 400);
    const educationalText = `${data.dropoffAddress} ${data.educationalInstitutionName || ""} ${data.institutionName || ""} ${data.institutionAddress || ""}`.toLowerCase();
    const allowedDestination = data.educationalDestinationValidated || ["school", "college", "university", "educational", "skola", "Å¡kola", "gymnasium", "academy"].some((term) => educationalText.includes(term));
    if (!allowedDestination) throw new BookingCreateError("Please select a verified school, college, university, or approved educational institution.", 400);
    if (data.paymentMethod === "CASH") throw new BookingCreateError("Cash is not available for children's scheduled transport.", 400);
    if ((data.childrenDetails || []).length !== data.passengerCount) throw new BookingCreateError("Child details must match the selected number of children.", 400);
  }
  if ((data.serviceType === "ACCESSIBLE" || data.serviceType === "SENIOR") && data.medicalAppointment) {
    if (!data.hospitalName?.trim() || !data.department?.trim() ||
        !data.appointmentDate || !data.appointmentTime) {
      throw new BookingCreateError("Medical appointment details are required.", 400, "MEDICAL_DETAILS_REQUIRED");
    }
    if (data.pickupMode === "NOW") {
      throw new BookingCreateError("A medical appointment requires a scheduled outbound pickup.", 400, "MEDICAL_PICKUP_SCHEDULE_REQUIRED");
    }
    if (data.tripType === "GO_RETURN" || data.tripType === "WAIT_RETURN") {
      if (!data.returnDate || (data.returnTimingPreference !== "FLEXIBLE" && !data.returnTime)) {
        throw new BookingCreateError("Return date and fixed time (if selected) are required.", 400, "MEDICAL_RETURN_REQUIRED");
      }
      if (data.returnDate < data.appointmentDate ||
          (data.returnDate === bookingScheduledDate && data.returnTime && data.returnTime <= bookingScheduledTime)) {
        throw new BookingCreateError("Return pickup cannot precede the outbound appointment.", 400, "MEDICAL_RETURN_INVALID");
      }
    }
    if (data.appointmentDate < bookingScheduledDate) {
      throw new BookingCreateError("Appointment cannot precede pickup.", 400, "MEDICAL_APPOINTMENT_INVALID");
    }
  }
  if (data.paymentMethod === "CASH" && !data.cashAgreed) throw new BookingCreateError("Cash payment requires agreement to pay before journey starts.", 400);

  const passengerRemainsInWheelchair = data.passengerRemainsInWheelchair || (data.wheelchairUser && data.canTransferToSeat === false);
  const luggageType = data.largeBags > 0 ? "LARGE" : data.smallBags > 0 ? "SMALL" : data.luggageType;
  const estimate = estimateBookingPrice({ serviceType: data.serviceType, pickupAddress: data.pickupAddress, dropoffAddress: data.dropoffAddress, passengerCount: data.passengerCount, luggageType: luggageType as any, smallBags: data.smallBags, largeBags: data.largeBags, companionCount: data.companionCount, wheelchairNeeded: data.wheelchairNeeded || data.wheelchairUser, wavRequired });
  const quote = await calculateAuthoritativeBookingQuote({
    pickupAddress: data.pickupAddress, dropoffAddress: data.dropoffAddress, serviceType: data.serviceType,
    scheduledDate: bookingScheduledDate, scheduledTime: bookingScheduledTime,
    waitingDuration: data.waitingDuration, customWaitingDuration: data.customWaitingDuration,
    assistanceLevel: data.assistanceLevel,
    companionCount: data.companionRequired ? data.companionCount : 0,
    companionHours: data.companionRequired ? data.companionHours : 0,
    waitingMinutes: data.waitingDuration === "30_MINUTES" ? 30 : data.waitingDuration === "1_HOUR" ? 60 : data.waitingDuration === "2_HOURS" ? 120 : data.waitingDuration === "3_HOURS" ? 180 : data.waitingDuration === "4_HOURS" ? 240 : data.waitingDuration === "CUSTOM" ? Number(data.customWaitingDuration?.match(/\d+/)?.[0] || 0) : 0,
    waitAndGreet: data.waitAndGreet, recurrenceType: data.recurrenceType || data.recurrence,
    recurrenceCustom: data.recurrenceCustom, returnDate: data.returnDate, returnTime: data.returnTime,
  });
  const fare = quote.breakdown;
  const samePassenger = actor.kind === "PUBLIC" && currentPassenger?.phoneVerified === true && normalizePassengerPhone(currentPassenger.normalizedPhone || currentPassenger.phone) === normalizedPhone;
  const bookingRef = generateBookingRef();
  const bookingData = {
    bookingRef, status: "PENDING", serviceType: data.serviceType,
    pickupAddress: data.pickupAddress, dropoffAddress: data.dropoffAddress,
    pickupLat: data.pickupLat ?? null, pickupLng: data.pickupLng ?? null, dropoffLat: data.dropoffLat ?? null, dropoffLng: data.dropoffLng ?? null,
    scheduledDate: bookingScheduledDate, scheduledTime: bookingScheduledTime, passengerCount: data.passengerCount, luggageType,
    smallBags: data.smallBags, largeBags: data.largeBags,
    wheelchairNeeded: data.wheelchairNeeded || data.wheelchairUser, seniorPassenger: data.seniorPassenger, ztpCardHolder: data.ztpCardHolder,
    wheelchairUser: data.wheelchairUser, companionRequired: data.companionRequired, medicalAppointment: data.medicalAppointment,
    waitingTimeRequired: data.waitingTimeRequired, assistanceLevel: data.assistanceLevel || null, wheelchairType: data.wheelchairType || null,
    canTransferToSeat: data.canTransferToSeat ?? null, wavRequired, passengerRemainsInWheelchair, companionCount: data.companionCount,
    companionHours: data.companionRequired ? data.companionHours : 0,
    hospitalName: data.hospitalName || null, department: data.department || null, appointmentDate: data.appointmentDate || null,
    appointmentTime: data.appointmentTime || null, tripType: data.tripType || null,
    returnTimingPreference: data.returnTimingPreference || null, returnDate: data.returnDate || null, returnTime: data.returnTime || null,
    waitingDuration: data.waitingDuration || null, customWaitingDuration: data.customWaitingDuration || null,
    scheduledRide: scheduledIntent, pickupAt, marketTimezone,
    recurrence: data.recurrence || data.recurrenceType || null, recurrenceCustom: data.recurrenceCustom || null,
    childrenDetails: data.childrenDetails || undefined, childFullName: data.childrenDetails?.[0]?.fullName || data.childFullName || null,
    childName: data.childrenDetails?.[0]?.fullName || data.childName || data.childFullName || null,
    childAge: data.childrenDetails?.[0]?.age ?? data.childAge ?? null,
    childSpecialRequirements: data.childrenDetails?.[0]?.specialRequirements || data.childSpecialRequirements || null,
    parentFullName: data.parentFullName || null, guardianName: data.guardianName || data.parentFullName || null,
    parentPrimaryPhone: data.parentPrimaryPhone || null, guardianPhone: data.guardianPhone || data.parentPrimaryPhone || null,
    parentEmergencyPhone: data.parentEmergencyPhone || null, guardianEmergencyPhone: data.guardianEmergencyPhone || data.parentEmergencyPhone || null,
    parentEmail: data.parentEmail || null, guardianEmail: data.guardianEmail || data.parentEmail || null,
    educationalInstitutionName: data.educationalInstitutionName || null, institutionName: data.institutionName || data.educationalInstitutionName || null,
    institutionAddress: data.institutionAddress || data.dropoffAddress || null, educationalDestinationValidated: data.educationalDestinationValidated,
    pickupDate: isRideNow ? bookingScheduledDate : (data.pickupDate || bookingScheduledDate),
    pickupTime: isRideNow ? bookingScheduledTime : (data.pickupTime || bookingScheduledTime),
    recurrenceType: data.recurrenceType || data.recurrence || null, flightNumber: data.flightNumber || null, airline: data.airline || null,
    waitAndGreet: data.waitAndGreet, customerName: data.customerName, customerEmail: data.customerEmail || null,
    customerPhone: data.customerPhone, customerPhoneCode: data.customerPhoneCode, normalizedPhone,
    languagePref: data.languagePref === "sk" ? "slovak" : data.languagePref, specialNotes: data.specialNotes || null,
    phoneVerified: Boolean(samePassenger), passengerAuthStatus: samePassenger ? "AUTHENTICATED" : "PENDING_PHONE_VERIFICATION",
    passengerAuthCompletedAt: samePassenger ? new Date() : null, passengerId: samePassenger ? currentPassenger!.id : null,
    paymentMethod: data.paymentMethod, cashAgreed: data.cashAgreed, sourceDomain: getSourceDomain(request),
    bookingSource: actor.kind === "DISPATCH_OPERATOR" ? "PHONE_DISPATCH" : "WEB",
    createdByDispatchOperatorId: actor.kind === "DISPATCH_OPERATOR" ? actor.operatorId : null,
    estimatedPrice: fare.totalFare, distanceKm: quote.distance.distanceKm, vehicleRequired: estimate.vehicleRequired,
    fareBaseFare: fare.baseFare, fareDistanceCharge: fare.distanceCharge, fareWaitingCharge: fare.waitingCharge,
    fareOptionalFees: fare.optionalServiceCharges as unknown as Prisma.InputJsonValue, fareNightCharge: fare.nightServiceCharge,
    fareMinimumAdjustment: fare.minimumFareAdjustment, fareTotalFare: fare.totalFare,
    fareBreakdown: { ...fare, serverPriceMac: signBookingPrice(bookingRef, fare.totalFare) } as unknown as Prisma.InputJsonValue,
  };
  let guestAccess: Awaited<ReturnType<typeof createPublicBookingAccess>> | null = null;
  const booking = options.requestRecordId && actor.kind === "DISPATCH_OPERATOR"
    ? await prisma.$transaction(async (tx) => {
        const claimed = await tx.dispatchBookingRequest.updateMany({ where: { id: options.requestRecordId, status: "PROCESSING", OR: [{ bookingId: null }, { bookingId: { isSet: false } }], leaseToken: options.requestLeaseToken }, data: { status: "CREATING" } });
        if (claimed.count !== 1) throw new Error("PHONE_BOOKING_IDEMPOTENCY_LEASE_LOST");
        const created = await tx.booking.create({ data: bookingData });
        await writeBookingCreatedEmail(tx, created.id, created.languagePref);
        if (created.paymentMethod === "CASH") await writeBookingActivationIntent(tx, created.id);
        await tx.dispatchBookingRequest.update({ where: { id: options.requestRecordId }, data: { bookingId: created.id, status: "CREATED" } });
        await tx.dispatchAuditEvent.create({ data: { actorType: "DISPATCH_OPERATOR", actorId: actor.operatorId, action: "PHONE_BOOKING_CREATED", targetType: "Booking", targetId: created.id, bookingRef: created.bookingRef, requestId: randomUUID(), outcome: "SUCCESS", safeMetadata: { paymentMethod: created.paymentMethod, scheduledRide: created.scheduledRide } } });
        return created;
      })
    : await prisma.$transaction(async (tx) => {
        if (options.publicOperation) {
          const claimed = await tx.publicBookingOperation.updateMany({ where: {
            id: options.publicOperation.id, state: "PROCESSING", leaseToken: options.publicOperation.leaseToken,
            requestFingerprint: options.publicOperation.fingerprint, bookingId: null, revokedAt: null,
            passengerId: options.publicOperation.passengerId,
            recoveryExpiresAt: { gt: new Date() }, leaseUntil: { gt: new Date() },
          }, data: { state: "CREATING" } });
          if (claimed.count !== 1) throw new Error("PUBLIC_BOOKING_OPERATION_FENCE_LOST");
        }
        const created = await tx.booking.create({ data: bookingData });
        if (actor.kind === "PUBLIC" && !samePassenger) guestAccess = await createPublicBookingAccess(tx, created);
        await writeBookingCreatedEmail(tx, created.id, created.languagePref);
        if (created.paymentMethod === "CASH" && samePassenger) await writeBookingActivationIntent(tx, created.id);
        if (options.publicOperation) {
          const operation = await tx.publicBookingOperation.findUniqueOrThrow({ where: { id: options.publicOperation.id }, select: { issuedAt: true } });
          await tx.publicBookingOperation.update({ where: { id: options.publicOperation.id }, data: {
            state: "CREATED", bookingId: created.id, leaseToken: "", leaseUntil: null,
            recoveryExpiresAt: new Date(operation.issuedAt.getTime() + 24 * 60 * 60 * 1000),
          } });
        }
        return created;
      });

  if (!isScheduledBooking(booking) && booking.paymentMethod !== "CARD" && (actor.kind === "DISPATCH_OPERATOR" || samePassenger)) {
    const dispatch = await startAutomaticDispatch(booking.id);
    if (!dispatch.ok) console.warn("[dispatch] immediate start deferred", { bookingId: booking.id, code: dispatch.code });
    if (actor.kind === "DISPATCH_OPERATOR") await recordDispatchAudit({ actorType: "DISPATCH_OPERATOR", actorId: actor.operatorId, action: "DISPATCH_STARTED", targetType: "Booking", targetId: booking.id, bookingRef: booking.bookingRef, outcome: dispatch.ok ? "SUCCESS" : "FAILURE", safeMetadata: { code: dispatch.ok ? null : dispatch.code || "DISPATCH_PENDING" } }).catch(() => undefined);
  }
  // The committed creation event delivers localized Admin and passenger mail asynchronously.
  const seniorAssistedAdminEmailSent = false;
  const seniorAssistedDriverSafeEmailSent = false;
  return { booking, guestAccess, estimate, quote, seniorAssistedAdminEmailSent, seniorAssistedDriverSafeEmailSent };
}

export const DispatchBookingSchema = BookingSchema.extend({
  customerEmail: z.string().trim().email().max(254).optional().nullable(),
});

export function parseBookingInput(value: unknown) {
  return BookingSchema.safeParse(value);
}
