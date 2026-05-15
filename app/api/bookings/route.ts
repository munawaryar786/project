import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { generateBookingRef, getSourceDomain } from "@/lib/utils";
import { estimateBookingPrice } from "@/lib/pricing";
import { notifyAdminNewBooking, sendCustomerConfirmation } from "@/lib/email";

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
  wheelchairNeeded: z.boolean().default(false),

  flightNumber: z.string().optional().nullable(),
  airline: z.string().optional().nullable(),
  waitAndGreet: z.boolean().default(false),

  customerName: z.string().min(2, "Name required"),
  customerEmail: z.string().email().optional().nullable(),
  customerPhone: z.string().min(6, "Phone required"),
  customerPhoneCode: z.string().default("+421"),
  languagePref: z.string().default("sk"),
  specialNotes: z.string().max(500).optional().nullable(),

  paymentMethod: z.enum(["CARD", "CASH", "INVOICE"]),
  cashAgreed: z.boolean().default(false),
});

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

    const estimate = estimateBookingPrice({
      serviceType: data.serviceType,
      pickupAddress: data.pickupAddress,
      dropoffAddress: data.dropoffAddress,
      passengerCount: data.passengerCount,
      luggageType: data.luggageType as any,
      wheelchairNeeded: data.wheelchairNeeded,
    });

    if (data.passengerCount > 6) {
      return NextResponse.json(
        { error: "Passenger capacity exceeded limit of 6." },
        { status: 400 }
      );
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
        luggageType: data.luggageType,

        wheelchairNeeded: data.wheelchairNeeded,

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

        estimatedPrice: estimate.estimatedPrice,
        distanceKm: estimate.distanceKm,
        vehicleRequired: estimate.vehicleRequired,
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
    console.log(`💰 Est. Price: €${estimate.estimatedPrice}`);
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

    const emailData = {
      bookingRef,
      serviceType: data.serviceType,
      pickupAddress: data.pickupAddress,
      dropoffAddress: data.dropoffAddress,
      scheduledDate: data.scheduledDate,
      scheduledTime: data.scheduledTime,
      passengerCount: data.passengerCount,
      customerName: data.customerName,
      customerPhone: `${data.customerPhoneCode}${data.customerPhone}`,
      customerEmail: data.customerEmail,
      languagePref: data.languagePref,
      paymentMethod: data.paymentMethod,
      wheelchairNeeded: data.wheelchairNeeded,
      luggageType: data.luggageType,
      specialNotes: data.specialNotes,
      sourceDomain,
      estimatedPrice: estimate.estimatedPrice,
      distanceKm: estimate.distanceKm,
    };

    notifyAdminNewBooking(emailData).catch((err) =>
      console.error("Failed to send admin notification:", err)
    );

    if (data.paymentMethod !== "CARD" && data.customerEmail) {
      sendCustomerConfirmation(emailData).catch((err) =>
        console.error("Failed to send customer confirmation:", err)
      );
    }

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
        wheelchairNeeded: booking.wheelchairNeeded,

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

        emailSent: {
          admin: true,
          customer: data.paymentMethod !== "CARD" && !!data.customerEmail,
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