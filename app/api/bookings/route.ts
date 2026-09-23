import { NextRequest, NextResponse } from "next/server";
import { BookingSchema } from "@/lib/booking-schema";
import { createBookingWithDrivoRules } from "@/lib/booking-creation-service";
import { prisma } from "@/lib/prisma";
import { authorizeAdmin } from "@/lib/security/authorization";
import { rateLimits, withRateLimit } from "@/lib/rate-limit";
import { isSeniorAssistedService } from "@/lib/email";
import { BookingCreateError } from "@/lib/booking-creation-service";

async function createBooking(request: NextRequest) {
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
    const result = await createBookingWithDrivoRules(request, data, { kind: "PUBLIC" });
    const { booking, seniorAssistedAdminEmailSent, seniorAssistedDriverSafeEmailSent } = result;

    return NextResponse.json(
      {
        success: true,
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
  } catch (error) {
    if (error instanceof BookingCreateError) {
      if (error.response) return error.response;
      return NextResponse.json({ error: error.message, ...(error.code ? { code: error.code } : {}), ...(error.details ? { details: error.details } : {}) }, { status: error.status });
    }
    console.error("❌ Booking creation error:", error);

    return NextResponse.json(
      { error: "Failed to create booking. Please try again." },
      { status: 500 }
    );
  }
}

export const POST = withRateLimit(createBooking, {
  ...rateLimits.public,
  scope: "booking_create",
  max: 20,
});

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
