import { NextRequest, NextResponse } from "next/server";
import{Prisma} from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { generateBookingRef, getSourceDomain } from "@/lib/utils";
import { estimateBookingPrice } from "@/lib/pricing";

const BookingSchema = z.object({
  serviceType: z.enum([
    "STANDARD",
    "ACCESSIBLE",
    "SENIOR",
    "CHILDREN",
    "AIRPORT",
    "RENTAL",
  ]),

  pickupAddress: z.string().min(3, "Pickup address required"),
  dropoffAddress: z.string().min(3, "Drop-off address required"),

  pickupLat: z.number().optional().nullable(),
  pickupLng: z.number().optional().nullable(),
  dropoffLat: z.number().optional().nullable(),
  dropoffLng: z.number().optional().nullable(),

  scheduledDate: z.string().min(1, "Date required"),
  scheduledTime: z.string().min(1, "Time required"),
  passengerCount: z.number().min(1).max(6),
  luggageType: z.enum(["NONE", "SMALL", "LARGE"]).default("NONE"),
  smallBags: z.number().min(0).max(12).default(0),
  largeBags: z.number().min(0).max(12).default(0),
  wheelchairNeeded: z.boolean().default(false),
  seniorPassenger: z.boolean().default(false),
  ztpCardHolder: z.boolean().default(false),
  wheelchairUser: z.boolean().default(false),
  companionRequired: z.boolean().default(false),
  medicalAppointment: z.boolean().default(false),
  waitingTimeRequired: z.boolean().default(false),
  assistanceLevel: z.enum(["LIGHT", "DOOR_TO_DOOR", "BOARDING_HELP"]).optional().nullable(),
  wheelchairType: z.enum(["MANUAL", "ELECTRIC", "FOLDABLE"]).optional().nullable(),
  canTransferToSeat: z.boolean().optional().nullable(),
  wavRequired: z.boolean().default(false),
  passengerRemainsInWheelchair: z.boolean().default(false),
  companionCount: z.number().min(0).max(3).default(0),
  hospitalName: z.string().max(120).optional().nullable(),
  department: z.string().max(120).optional().nullable(),
  appointmentDate: z.string().optional().nullable(),
  appointmentTime: z.string().optional().nullable(),
  tripType: z.enum(["GO_ONLY", "GO_RETURN", "WAIT_RETURN"]).optional().nullable(),
  returnDate: z.string().optional().nullable(),
  returnTime: z.string().optional().nullable(),
  waitingDuration: z.enum(["30_MINUTES", "1_HOUR", "2_HOURS", "3_HOURS", "4_HOURS", "CUSTOM"]).optional().nullable(),
  customWaitingDuration: z.string().max(80).optional().nullable(),
  scheduledRide: z.boolean().default(false),
  recurrence: z.enum(["ONE_TIME", "DAILY", "WEEKLY", "MONTHLY", "CUSTOM"]).optional().nullable(),
  recurrenceCustom: z.string().max(120).optional().nullable(),
  childrenDetails: z.array(
    z.object({
      fullName: z.string().min(1).max(120),
      age: z.coerce.number().min(0).max(18),
      specialRequirements: z.string().max(500).nullable().optional(),
    })
  ).max(6).optional().nullable(),
  childFullName: z.string().max(120).optional().nullable(),
  childName: z.string().max(120).optional().nullable(),
  childAge: z.number().min(0).max(18).optional().nullable(),
  childSpecialRequirements: z.string().max(500).optional().nullable(),
  parentFullName: z.string().max(120).optional().nullable(),
  guardianName: z.string().max(120).optional().nullable(),
  parentPrimaryPhone: z.string().max(40).optional().nullable(),
  guardianPhone: z.string().max(40).optional().nullable(),
  parentEmergencyPhone: z.string().max(40).optional().nullable(),
  guardianEmergencyPhone: z.string().max(40).optional().nullable(),
  parentEmail: z.string().email().optional().nullable(),
  guardianEmail: z.string().email().optional().nullable(),
  educationalInstitutionName: z.string().max(160).optional().nullable(),
  institutionName: z.string().max(160).optional().nullable(),
  institutionAddress: z.string().max(240).optional().nullable(),
  educationalDestinationValidated: z.boolean().default(false),
  pickupDate: z.string().optional().nullable(),
  pickupTime: z.string().optional().nullable(),
  recurrenceType: z.enum(["ONE_TIME", "DAILY", "WEEKLY", "MONTHLY", "CUSTOM"]).optional().nullable(),

  flightNumber: z.string().optional().nullable(),
  airline: z.string().optional().nullable(),
  waitAndGreet: z.boolean().default(false),

  customerName: z.string().min(2, "Name required"),
  customerEmail: z.string().trim().email("Valid customer email required"),
  customerPhone: z.string().min(6, "Phone required"),
  customerPhoneCode: z.string().default("+421"),
  languagePref: z.string().default("sk"),
  specialNotes: z.string().max(500).optional().nullable(),

  paymentMethod: z.enum(["CARD", "CASH", "INVOICE"]),
  cashAgreed: z.boolean().default(false),
  estimatedPrice: z.number().optional().nullable(),
  fareBreakdown: z.unknown().optional().nullable(),
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function POST(request: NextRequest) {
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
    const capacityPassengerCount = data.passengerCount + data.companionCount;
    const wavRequired =
      data.wavRequired ||
      (data.wheelchairUser && data.canTransferToSeat === false);
    const passengerRemainsInWheelchair =
      data.passengerRemainsInWheelchair ||
      (data.wheelchairUser && data.canTransferToSeat === false);
    const luggageType =
      data.largeBags > 0 ? "LARGE" : data.smallBags > 0 ? "SMALL" : data.luggageType;

    const estimate = estimateBookingPrice({
      serviceType: data.serviceType,
      pickupAddress: data.pickupAddress,
      dropoffAddress: data.dropoffAddress,
      passengerCount: data.passengerCount,
      luggageType: luggageType as any,
      smallBags: data.smallBags,
      largeBags: data.largeBags,
      companionCount: data.companionCount,
      wheelchairNeeded: data.wheelchairNeeded || data.wheelchairUser,
      wavRequired,
    });
    const finalEstimatedPrice =
      (isRecord(data.fareBreakdown) ? readNumber(data.fareBreakdown.totalFare) : null) ??
      readNumber(data.estimatedPrice) ??
      estimate.estimatedPrice;
    const optionalFees =
      isRecord(data.fareBreakdown) && isRecord(data.fareBreakdown.optionalServiceCharges)
        ? data.fareBreakdown.optionalServiceCharges
        : undefined;

    if (capacityPassengerCount > 6) {
      return NextResponse.json(
        { error: "Passenger capacity exceeded limit of 6." },
        { status: 400 }
      );
    }

    if (data.serviceType === "CHILDREN") {
      if (!data.educationalDestinationValidated) {
        return NextResponse.json(
          {
            error:
              "Please select a verified school, college, university, or approved educational institution.",
          },
          { status: 400 }
        );
      }

      const educationalText = `${data.dropoffAddress} ${data.educationalInstitutionName || ""} ${data.institutionName || ""} ${data.institutionAddress || ""}`.toLowerCase();
      const allowedDestination =
        data.educationalDestinationValidated ||
        ["school", "college", "university", "educational", "skola", "škola", "gymnasium", "academy"].some((term) =>
          educationalText.includes(term)
        );

      if (!allowedDestination) {
        return NextResponse.json(
          {
            error:
              "Please select a verified school, college, university, or approved educational institution.",
          },
          { status: 400 }
        );
      }

      if (data.paymentMethod === "CASH") {
        return NextResponse.json(
          { error: "Cash is not available for children's scheduled transport." },
          { status: 400 }
        );
      }

      const children = data.childrenDetails || [];
      if (children.length !== data.passengerCount) {
        return NextResponse.json(
          { error: "Child details must match the selected number of children." },
          { status: 400 }
        );
      }
    }

    if (data.paymentMethod === "CASH" && !data.cashAgreed) {
      return NextResponse.json(
        {
          error:
            "Cash payment requires agreement to pay before journey starts.",
        },
        { status: 400 }
      );
    }

    if (data.passengerCount >= 5 && data.luggageType !== "NONE") {
      console.log(
        `⚠️ Luggage warning: ${data.passengerCount} passengers with ${data.luggageType} luggage`
      );
    }

    const bookingRef = generateBookingRef();
    const sourceDomain = getSourceDomain(request);

    const booking = await prisma.booking.create({
      data: {
        bookingRef,
        status: "PENDING",

        serviceType: data.serviceType,

        pickupAddress: data.pickupAddress,
        dropoffAddress: data.dropoffAddress,

        pickupLat: data.pickupLat ?? null,
        pickupLng: data.pickupLng ?? null,
        dropoffLat: data.dropoffLat ?? null,
        dropoffLng: data.dropoffLng ?? null,

        scheduledDate: data.scheduledDate,
        scheduledTime: data.scheduledTime,
        passengerCount: data.passengerCount,
        luggageType,
        smallBags: data.smallBags,
        largeBags: data.largeBags,

        wheelchairNeeded: data.wheelchairNeeded || data.wheelchairUser,
        seniorPassenger: data.seniorPassenger,
        ztpCardHolder: data.ztpCardHolder,
        wheelchairUser: data.wheelchairUser,
        companionRequired: data.companionRequired,
        medicalAppointment: data.medicalAppointment,
        waitingTimeRequired: data.waitingTimeRequired,
        assistanceLevel: data.assistanceLevel || null,
        wheelchairType: data.wheelchairType || null,
        canTransferToSeat: data.canTransferToSeat ?? null,
        wavRequired,
        passengerRemainsInWheelchair,
        companionCount: data.companionCount,
        hospitalName: data.hospitalName || null,
        department: data.department || null,
        appointmentDate: data.appointmentDate || null,
        appointmentTime: data.appointmentTime || null,
        tripType: data.tripType || null,
        returnDate: data.returnDate || null,
        returnTime: data.returnTime || null,
        waitingDuration: data.waitingDuration || null,
        customWaitingDuration: data.customWaitingDuration || null,
        scheduledRide: data.scheduledRide,
        recurrence: data.recurrence || data.recurrenceType || null,
        recurrenceCustom: data.recurrenceCustom || null,
        childrenDetails: data.childrenDetails || undefined,
        childFullName: data.childrenDetails?.[0]?.fullName || data.childFullName || null,
        childName: data.childrenDetails?.[0]?.fullName || data.childName || data.childFullName || null,
        childAge: data.childrenDetails?.[0]?.age ?? data.childAge ?? null,
        childSpecialRequirements:
          data.childrenDetails?.[0]?.specialRequirements || data.childSpecialRequirements || null,
        parentFullName: data.parentFullName || null,
        guardianName: data.guardianName || data.parentFullName || null,
        parentPrimaryPhone: data.parentPrimaryPhone || null,
        guardianPhone: data.guardianPhone || data.parentPrimaryPhone || null,
        parentEmergencyPhone: data.parentEmergencyPhone || null,
        guardianEmergencyPhone: data.guardianEmergencyPhone || data.parentEmergencyPhone || null,
        parentEmail: data.parentEmail || null,
        guardianEmail: data.guardianEmail || data.parentEmail || null,
        educationalInstitutionName: data.educationalInstitutionName || null,
        institutionName: data.institutionName || data.educationalInstitutionName || null,
        institutionAddress: data.institutionAddress || data.dropoffAddress || null,
        educationalDestinationValidated: data.educationalDestinationValidated,
        pickupDate: data.pickupDate || data.scheduledDate,
        pickupTime: data.pickupTime || data.scheduledTime,
        recurrenceType: data.recurrenceType || data.recurrence || null,

        flightNumber: data.flightNumber || null,
        airline: data.airline || null,
        waitAndGreet: data.waitAndGreet,

        customerName: data.customerName,
        customerEmail: data.customerEmail || null,
        customerPhone: data.customerPhone,
        customerPhoneCode: data.customerPhoneCode,
        languagePref: data.languagePref === "sk" ? "slovak" : data.languagePref,
        specialNotes: data.specialNotes || null,

        paymentMethod: data.paymentMethod,
        cashAgreed: data.cashAgreed,

        sourceDomain,

        estimatedPrice: finalEstimatedPrice,
        distanceKm: estimate.distanceKm,
        vehicleRequired: estimate.vehicleRequired,
        fareBaseFare: isRecord(data.fareBreakdown) ? readNumber(data.fareBreakdown.baseFare) : null,
        fareDistanceCharge: isRecord(data.fareBreakdown) ? readNumber(data.fareBreakdown.distanceCharge) : null,
        fareWaitingCharge: isRecord(data.fareBreakdown) ? readNumber(data.fareBreakdown.waitingCharge) : null,
        fareOptionalFees: optionalFees as Prisma.InputJsonValue,
        fareNightCharge: isRecord(data.fareBreakdown) ? readNumber(data.fareBreakdown.nightServiceCharge) : null,
        fareMinimumAdjustment: isRecord(data.fareBreakdown) ? readNumber(data.fareBreakdown.minimumFareAdjustment) : null,
        fareTotalFare: isRecord(data.fareBreakdown) ? readNumber(data.fareBreakdown.totalFare) : finalEstimatedPrice,
        fareBreakdown: isRecord(data.fareBreakdown) ? (data.fareBreakdown as Prisma.InputJsonValue) : undefined,
      },
    });

    console.log("═══════════════════════════════════════");
    console.log("🆕 NEW BOOKING — SAVED TO DATABASE ✅");
    console.log("═══════════════════════════════════════");
    console.log(`📋 Ref:        ${bookingRef}`);
    console.log(`🆔 DB ID:      ${booking.id}`);
    console.log(`🚕 Service:    ${data.serviceType}`);
    console.log(`📍 From:       ${data.pickupAddress}`);
    console.log(`📍 To:         ${data.dropoffAddress}`);
    console.log(
      `🧭 Pickup GPS: ${data.pickupLat ?? "N/A"}, ${data.pickupLng ?? "N/A"}`
    );
    console.log(
      `🧭 Dropoff GPS:${data.dropoffLat ?? "N/A"}, ${data.dropoffLng ?? "N/A"}`
    );
    console.log(`📏 Distance:   ${estimate.distanceKm} km`);
    console.log(`💰 Est. Price: €${finalEstimatedPrice}`);
    console.log(`🚗 Vehicle Req:${estimate.vehicleRequired}`);
    console.log(`📅 Date:       ${data.scheduledDate} ${data.scheduledTime}`);
    console.log(`👥 Passengers: ${data.passengerCount}`);
    console.log(`👤 Name:       ${data.customerName}`);
    console.log(`📱 Phone:      ${data.customerPhoneCode}${data.customerPhone}`);
    console.log(`💳 Payment:    ${data.paymentMethod}`);
    if (data.wheelchairNeeded) console.log("♿ Wheelchair:  YES");
    if (data.flightNumber) console.log(`✈️ Flight:     ${data.flightNumber}`);
    if (data.specialNotes) console.log(`📝 Notes:      ${data.specialNotes}`);
    console.log("💾 Saved to:   DATABASE ✅");
    console.log("═══════════════════════════════════════");

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

        emailSent: {
          admin: false,
          customer: false,
          pendingCompletion: true,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("❌ Booking creation error:", error);

    return NextResponse.json(
      { error: "Failed to create booking. Please try again." },
      { status: 500 }
    );
  }
}

export async function GET() {
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
