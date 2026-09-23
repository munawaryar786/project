import type { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { BookingSchema, type BookingInput } from "@/lib/booking-schema";
import { generateBookingRef, getSourceDomain } from "@/lib/utils";
import { estimateBookingPrice } from "@/lib/pricing";
import { calculateAuthoritativeBookingQuote } from "@/lib/booking-quote";
import { authorizePassenger, getPassengerFromRequest, normalizePassengerPhone } from "@/lib/passenger-auth";
import { isCustomerServiceEnabled } from "@/lib/feature-flags";
import { signBookingPrice } from "@/lib/security/booking-price";
import { requiresWav } from "@/lib/assisted-transport";
import { startAutomaticDispatch } from "@/lib/automatic-dispatch";
import { isScheduledBooking, parseMarketDateTime, SCHEDULED_MARKET_CONFIG } from "@/lib/scheduled-marketplace";
import { bookingToEmailData, isSeniorAssistedService, sendSeniorAssistedBookingEmails } from "@/lib/email";
import { recordDispatchAudit } from "@/lib/dispatch-audit";

export type BookingCreateActor =
  | { kind: "PUBLIC" }
  | { kind: "DISPATCH_OPERATOR"; operatorId: string };

export class BookingCreateError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string, readonly details?: unknown, readonly response?: NextResponse) { super(message); }
}

export async function createBookingWithDrivoRules(request: NextRequest, data: BookingInput, actor: BookingCreateActor, options: { requestRecordId?: string; requestLeaseToken?: string } = {}) {
  const marketTimezone = SCHEDULED_MARKET_CONFIG.timezone;
  const pickupAt = parseMarketDateTime(data.pickupDate || data.scheduledDate, data.pickupTime || data.scheduledTime, marketTimezone);
  if (!pickupAt) throw new BookingCreateError("Invalid scheduled pickup date/time", 400, "INVALID_SCHEDULE_TIME");
  const scheduledIntent = data.scheduledRide || data.serviceType === "CHILDREN" || pickupAt.getTime() > Date.now() + 5 * 60 * 1000;
  if (!isCustomerServiceEnabled(data.serviceType)) throw new BookingCreateError("Children Transport is temporarily unavailable for new bookings.", 409);

  let currentPassenger: { id: string; normalizedPhone: string | null } | null = null;
  if (actor.kind === "PUBLIC") {
    currentPassenger = await getPassengerFromRequest(request);
    if (currentPassenger) {
      const auth = await authorizePassenger(request);
      if (!auth.ok) throw new BookingCreateError("Passenger authentication required", auth.response.status, undefined, undefined, auth.response);
    }
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
  if (data.paymentMethod === "CASH" && !data.cashAgreed) throw new BookingCreateError("Cash payment requires agreement to pay before journey starts.", 400);

  const passengerRemainsInWheelchair = data.passengerRemainsInWheelchair || (data.wheelchairUser && data.canTransferToSeat === false);
  const luggageType = data.largeBags > 0 ? "LARGE" : data.smallBags > 0 ? "SMALL" : data.luggageType;
  const estimate = estimateBookingPrice({ serviceType: data.serviceType, pickupAddress: data.pickupAddress, dropoffAddress: data.dropoffAddress, passengerCount: data.passengerCount, luggageType: luggageType as any, smallBags: data.smallBags, largeBags: data.largeBags, companionCount: data.companionCount, wheelchairNeeded: data.wheelchairNeeded || data.wheelchairUser, wavRequired });
  const quote = await calculateAuthoritativeBookingQuote({
    pickupAddress: data.pickupAddress, dropoffAddress: data.dropoffAddress, serviceType: data.serviceType,
    scheduledDate: data.scheduledDate, scheduledTime: data.scheduledTime,
    waitingDuration: data.waitingDuration, customWaitingDuration: data.customWaitingDuration,
    assistanceLevel: data.assistanceLevel,
    waitingMinutes: data.waitingDuration === "30_MINUTES" ? 30 : data.waitingDuration === "1_HOUR" ? 60 : data.waitingDuration === "2_HOURS" ? 120 : data.waitingDuration === "3_HOURS" ? 180 : data.waitingDuration === "4_HOURS" ? 240 : data.waitingDuration === "CUSTOM" ? Number(data.customWaitingDuration?.match(/\d+/)?.[0] || 0) : 0,
    waitAndGreet: data.waitAndGreet, recurrenceType: data.recurrenceType || data.recurrence,
    recurrenceCustom: data.recurrenceCustom, returnDate: data.returnDate, returnTime: data.returnTime,
  });
  const fare = quote.breakdown;
  const samePassenger = actor.kind === "PUBLIC" && currentPassenger?.normalizedPhone === normalizedPhone;
  const bookingRef = generateBookingRef();
  const bookingData = {
    bookingRef, status: "PENDING", serviceType: data.serviceType,
    pickupAddress: data.pickupAddress, dropoffAddress: data.dropoffAddress,
    pickupLat: data.pickupLat ?? null, pickupLng: data.pickupLng ?? null, dropoffLat: data.dropoffLat ?? null, dropoffLng: data.dropoffLng ?? null,
    scheduledDate: data.scheduledDate, scheduledTime: data.scheduledTime, passengerCount: data.passengerCount, luggageType,
    smallBags: data.smallBags, largeBags: data.largeBags,
    wheelchairNeeded: data.wheelchairNeeded || data.wheelchairUser, seniorPassenger: data.seniorPassenger, ztpCardHolder: data.ztpCardHolder,
    wheelchairUser: data.wheelchairUser, companionRequired: data.companionRequired, medicalAppointment: data.medicalAppointment,
    waitingTimeRequired: data.waitingTimeRequired, assistanceLevel: data.assistanceLevel || null, wheelchairType: data.wheelchairType || null,
    canTransferToSeat: data.canTransferToSeat ?? null, wavRequired, passengerRemainsInWheelchair, companionCount: data.companionCount,
    hospitalName: data.hospitalName || null, department: data.department || null, appointmentDate: data.appointmentDate || null,
    appointmentTime: data.appointmentTime || null, tripType: data.tripType || null, returnDate: data.returnDate || null, returnTime: data.returnTime || null,
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
    pickupDate: data.pickupDate || data.scheduledDate, pickupTime: data.pickupTime || data.scheduledTime,
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
  const booking = options.requestRecordId && actor.kind === "DISPATCH_OPERATOR"
    ? await prisma.$transaction(async (tx) => {
        const claimed = await tx.dispatchBookingRequest.updateMany({ where: { id: options.requestRecordId, status: "PROCESSING", bookingId: null, leaseToken: options.requestLeaseToken }, data: { status: "CREATING" } });
        if (claimed.count !== 1) throw new Error("PHONE_BOOKING_IDEMPOTENCY_LEASE_LOST");
        const created = await tx.booking.create({ data: bookingData });
        await tx.dispatchBookingRequest.update({ where: { id: options.requestRecordId }, data: { bookingId: created.id, status: "CREATED" } });
        await tx.dispatchAuditEvent.create({ data: { actorType: "DISPATCH_OPERATOR", actorId: actor.operatorId, action: "PHONE_BOOKING_CREATED", targetType: "Booking", targetId: created.id, bookingRef: created.bookingRef, requestId: randomUUID(), outcome: "SUCCESS", safeMetadata: { paymentMethod: created.paymentMethod, scheduledRide: created.scheduledRide } } });
        return created;
      })
    : await prisma.booking.create({ data: bookingData });

  if (!isScheduledBooking(booking) && booking.paymentMethod !== "CARD" && (actor.kind === "DISPATCH_OPERATOR" || Boolean(currentPassenger))) {
    const dispatch = await startAutomaticDispatch(booking.id);
    if (!dispatch.ok) console.warn("[dispatch] immediate start deferred", { bookingId: booking.id, code: dispatch.code });
    if (actor.kind === "DISPATCH_OPERATOR") await recordDispatchAudit({ actorType: "DISPATCH_OPERATOR", actorId: actor.operatorId, action: "DISPATCH_STARTED", targetType: "Booking", targetId: booking.id, bookingRef: booking.bookingRef, outcome: dispatch.ok ? "SUCCESS" : "FAILURE", safeMetadata: { code: dispatch.ok ? null : dispatch.code || "DISPATCH_PENDING" } }).catch(() => undefined);
  }
  let seniorAssistedAdminEmailSent = false;
  let seniorAssistedDriverSafeEmailSent = false;
  if (isSeniorAssistedService(booking.serviceType)) {
    try {
      const emailResult = await sendSeniorAssistedBookingEmails(bookingToEmailData(booking));
      seniorAssistedAdminEmailSent = emailResult.adminFull.success;
      seniorAssistedDriverSafeEmailSent = emailResult.driverSafe.success;
    } catch (error) {
      console.warn("[email] Senior/assisted booking emails failed after booking creation", { bookingRef: booking.bookingRef, error: error instanceof Error ? error.message : "Unknown email error" });
    }
  }
  return { booking, estimate, quote, seniorAssistedAdminEmailSent, seniorAssistedDriverSafeEmailSent };
}

export const DispatchBookingSchema = BookingSchema.extend({
  customerEmail: z.string().trim().email().max(254).optional().nullable(),
});

export function parseBookingInput(value: unknown) {
  return BookingSchema.safeParse(value);
}
