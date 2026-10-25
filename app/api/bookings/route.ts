import { NextRequest, NextResponse } from "next/server";
import { BookingSchema } from "@/lib/booking-schema";
import { createBookingWithDrivoRules } from "@/lib/booking-creation-service";
import { prisma } from "@/lib/prisma";
import { authorizeAdmin } from "@/lib/security/authorization";
import { rateLimits, withRateLimit } from "@/lib/rate-limit";
import { isSeniorAssistedService } from "@/lib/email";
import { BookingCreateError } from "@/lib/booking-creation-service";
import { setPublicBookingAccessCookie } from "@/lib/booking-access";
import { isAllowedOrigin } from "@/lib/env";
import { authorizedOperation, claimOperation, fingerprintBooking, operationExpired, operationMode,
  privateResponse, validOperationId } from "@/lib/public-booking-operation";

function operationReply(state: string, status: number, extra: Record<string, unknown> = {}) {
  return privateResponse(NextResponse.json({ state, ...extra }, { status }));
}

async function createBooking(request: NextRequest) {
  if (!isAllowedOrigin(request.headers.get("origin"))) return NextResponse.json({ error: "Request origin is not allowed" }, { status: 403 });
  const mode = operationMode();
  const operationId = request.headers.get("X-Drivo-Booking-Operation");
  if (mode === "unavailable") return operationReply("RECOVERY_UNAVAILABLE", 503);
  if (mode === "mandatory" && !operationId) return operationReply("PREFLIGHT_REQUIRED", 428);
  if (operationId && mode === "disabled") return operationReply("RECOVERY_UNAVAILABLE", 503);
  if (operationId && !validOperationId(operationId)) return operationReply("OPERATION_UNAVAILABLE", 404);
  let claimedPublicOperation: { id: string; leaseToken: string } | null = null;
  try {
    const body = await request.json();

    const parsed = BookingSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Validation failed",
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const data = parsed.data;
    let publicOperation: { id: string; leaseToken: string; fingerprint: string; passengerId: string | null } | undefined;
    if (operationId) {
      const operation = await authorizedOperation(request, operationId);
      if (!operation) return operationReply("OPERATION_UNAVAILABLE", 404);
      if (operationExpired(operation)) return operationReply("EXPIRED", 410);
      const fingerprint = fingerprintBooking(data);
      if (operation.requestFingerprint && operation.requestFingerprint !== fingerprint) return operationReply("PAYLOAD_CONFLICT", 409);
      if (operation.state === "CREATED" && operation.bookingId) {
        const existing = await prisma.booking.findUnique({ where: { id: operation.bookingId }, select: { id: true, bookingRef: true, passengerId: true } });
        if (!existing || (operation.scope === "PASSENGER" && existing.passengerId && existing.passengerId !== operation.passengerId) ||
            (operation.scope === "GUEST" && existing.passengerId)) return operationReply("RECOVERY_UNAVAILABLE", 503);
        return operationReply("CREATED", 200, { success: true, bookingId: existing.id, bookingRef: existing.bookingRef,
          guestAccessRecoveryRequired: !existing.passengerId });
      }
      const leaseToken = await claimOperation(operationId, fingerprint);
      if (!leaseToken) return operationReply("PROCESSING", 202);
      publicOperation = { id: operationId, leaseToken, fingerprint, passengerId: operation.scope === "PASSENGER" ? operation.passengerId : null };
      claimedPublicOperation = { id: operationId, leaseToken };
    }
    const result = await createBookingWithDrivoRules(request, data, { kind: "PUBLIC" }, { publicOperation });
    const { booking, seniorAssistedAdminEmailSent, seniorAssistedDriverSafeEmailSent } = result;

    const response = NextResponse.json(
      {
        success: true,
        ...(publicOperation ? { operationId: publicOperation.id, operationState: "CREATED" } : {}),
        bookingId: booking.id,
        bookingRef: booking.bookingRef,
        status: booking.status,
        serviceType: booking.serviceType,

        pickupAddress: booking.pickupAddress,
        dropoffAddress: booking.dropoffAddress,

        pickupLat: booking.pickupLat,
        pickupLng: booking.pickupLng,
        dropoffLat: booking.dropoffLat,
        dropoffLng: booking.dropoffLng,

        scheduledDate: booking.scheduledDate,
        scheduledTime: booking.scheduledTime,
        passengerCount: booking.passengerCount,
        luggageType: booking.luggageType,
        smallBags: booking.smallBags,
        largeBags: booking.largeBags,
        wheelchairNeeded: booking.wheelchairNeeded,
        seniorPassenger: booking.seniorPassenger,
        ztpCardHolder: booking.ztpCardHolder,
        wheelchairUser: booking.wheelchairUser,
        companionRequired: booking.companionRequired,
        medicalAppointment: booking.medicalAppointment,
        waitingTimeRequired: booking.waitingTimeRequired,
        assistanceLevel: booking.assistanceLevel,
        wheelchairType: booking.wheelchairType,
        canTransferToSeat: booking.canTransferToSeat,
        wavRequired: booking.wavRequired,
        passengerRemainsInWheelchair: booking.passengerRemainsInWheelchair,
        companionCount: booking.companionCount,
        hospitalName: booking.hospitalName,
        department: booking.department,
        appointmentDate: booking.appointmentDate,
        appointmentTime: booking.appointmentTime,
        tripType: booking.tripType,
        returnDate: booking.returnDate,
        returnTime: booking.returnTime,
        waitingDuration: booking.waitingDuration,
        customWaitingDuration: booking.customWaitingDuration,
        scheduledRide: booking.scheduledRide,
        recurrence: booking.recurrence,
        recurrenceType: booking.recurrenceType,
        recurrenceCustom: booking.recurrenceCustom,
        childFullName: booking.childFullName,
        childName: booking.childName,
        childAge: booking.childAge,
        childSpecialRequirements: booking.childSpecialRequirements,
        childrenDetails: booking.childrenDetails,
        parentFullName: booking.parentFullName,
        guardianName: booking.guardianName,
        parentPrimaryPhone: booking.parentPrimaryPhone,
        guardianPhone: booking.guardianPhone,
        parentEmergencyPhone: booking.parentEmergencyPhone,
        guardianEmergencyPhone: booking.guardianEmergencyPhone,
        parentEmail: booking.parentEmail,
        guardianEmail: booking.guardianEmail,
        educationalInstitutionName: booking.educationalInstitutionName,
        institutionName: booking.institutionName,
        institutionAddress: booking.institutionAddress,
        educationalDestinationValidated: booking.educationalDestinationValidated,
        pickupDate: booking.pickupDate,
        pickupTime: booking.pickupTime,

        flightNumber: booking.flightNumber,
        airline: booking.airline,
        waitAndGreet: booking.waitAndGreet,

        customerName: booking.customerName,
        customerPhone: `${booking.customerPhoneCode}${booking.customerPhone}`,
        customerEmail: booking.customerEmail,
        languagePref: booking.languagePref,
        paymentMethod: booking.paymentMethod,
        specialNotes: booking.specialNotes,
        passengerAuthenticated: booking.passengerAuthStatus === "AUTHENTICATED",
        passengerAuthStatus: booking.passengerAuthStatus,

        estimatedPrice: booking.estimatedPrice,
        distanceKm: booking.distanceKm,
        vehicleRequired: booking.vehicleRequired,
        fareBaseFare: booking.fareBaseFare,
        fareDistanceCharge: booking.fareDistanceCharge,
        fareWaitingCharge: booking.fareWaitingCharge,
        fareOptionalFees: booking.fareOptionalFees,
        fareNightCharge: booking.fareNightCharge,
        fareMinimumAdjustment: booking.fareMinimumAdjustment,
        fareTotalFare: booking.fareTotalFare,
        fareBreakdown: booking.fareBreakdown,

        emailSent: isSeniorAssistedService(booking.serviceType)
          ? {
              admin: seniorAssistedAdminEmailSent,
              driverSafeDispatchCopy: seniorAssistedDriverSafeEmailSent,
              customer: false,
              pendingCompletion: false,
            }
          : {
              admin: false,
              customer: false,
              pendingCompletion: true,
            },
      },
      { status: 201 }
    );
    if (result.guestAccess) setPublicBookingAccessCookie(response, booking.id, result.guestAccess);
    return publicOperation ? privateResponse(response) : response;
  } catch (error) {
    if (error instanceof BookingCreateError) {
      // Every BookingCreateError in this service is raised before its booking
      // transaction. Generic failures remain uncertain and are never released.
      if (claimedPublicOperation) {
        try {
          await prisma.publicBookingOperation.updateMany({ where: { id: claimedPublicOperation.id,
            state: "PROCESSING", leaseToken: claimedPublicOperation.leaseToken, bookingId: null },
            data: { state: "RETRYABLE", leaseToken: "", leaseUntil: null } });
        } catch { return operationReply("OUTCOME_UNKNOWN", 503); }
      }
      if (operationId) return operationReply("RETRYABLE", error.status, { code: error.code || "BOOKING_CREATE_REJECTED" });
      if (error.response) return error.response;
      return NextResponse.json({ error: error.message, ...(error.code ? { code: error.code } : {}), ...(error.details ? { details: error.details } : {}) }, { status: error.status });
    }
    if (operationId) console.error("[public-booking-operation.failure]", { type: error instanceof Error ? error.name : "unknown" });
    else console.error("❌ Booking creation error:", error);

    return operationId ? privateResponse(NextResponse.json(
      { state: "OUTCOME_UNKNOWN" }, { status: 503 }
    )) : NextResponse.json(
      { error: "Failed to create booking. Please try again." },
      { status: 500 }
    );
  }
}

const rateLimitedCreateBooking = withRateLimit(createBooking, {
  ...rateLimits.public,
  scope: "booking_create",
  max: 20,
});
export async function POST(request: NextRequest) {
  return privateResponse(await rateLimitedCreateBooking(request));
}

export async function GET(request: NextRequest) {
  const auth = await authorizeAdmin(request);
  if (!auth.ok) return auth.response;
  try {
    const bookings = await prisma.booking.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    console.log(`📋 Fetched ${bookings.length} bookings from database`);

    return NextResponse.json({ bookings, source: "database" });
  } catch (error) {
    console.error("❌ Bookings fetch error:", error);

    return NextResponse.json(
      { error: "Failed to fetch bookings" },
      { status: 500 }
    );
  }
}
