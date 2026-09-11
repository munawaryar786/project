import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { rateLimits, withRateLimit } from "@/lib/rate-limit";
import { calculateAuthoritativeBookingQuote } from "@/lib/booking-quote";

const DistanceSchema = z.object({
  pickupAddress: z.string().min(3),
  dropoffAddress: z.string().min(3),
  serviceType: z.string().optional().default("standard"),
  passengerCount: z.coerce.number().min(1).optional().default(1),
  waitingMinutes: z.coerce.number().min(0).optional().default(0),
  scheduledDate: z.string().optional().nullable(),
  scheduledTime: z.string().optional().nullable(),
  waitAndGreet: z.boolean().optional().default(false),
  recurrenceType: z.string().optional().nullable(),
  recurrenceCustom: z.string().optional().nullable(),
  returnDate: z.string().optional().nullable(),
  returnTime: z.string().optional().nullable(),
});

function parseCustomDays(value: string | null | undefined) {
  const match = value?.match(/\d+/);
  if (!match) return null;
  const days = Number(match[0]);
  return Number.isFinite(days) && days > 0 ? days : null;
}

function childrenServiceDays(recurrenceType: string | null | undefined, recurrenceCustom: string | null | undefined) {
  const customDays = parseCustomDays(recurrenceCustom);
  if (recurrenceType === "DAILY") return customDays || 5;
  if (recurrenceType === "WEEKLY") return customDays || 5;
  if (recurrenceType === "MONTHLY") return customDays || 20;
  if (recurrenceType === "CUSTOM") return customDays || 1;
  return 1;
}

async function calculateBookingDistance(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = DistanceSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const data = parsed.data;
    const quote = await calculateAuthoritativeBookingQuote({
      pickupAddress: data.pickupAddress,
      dropoffAddress: data.dropoffAddress,
      serviceType: data.serviceType,
      waitingMinutes: data.waitingMinutes,
      scheduledDate: data.scheduledDate,
      scheduledTime: data.scheduledTime,
      waitAndGreet: data.waitAndGreet,
      recurrenceType: data.recurrenceType,
      recurrenceCustom: data.recurrenceCustom,
      returnDate: data.returnDate,
      returnTime: data.returnTime,
    });

    return NextResponse.json({
      success: true,
      distance: {
        km: quote.distance.distanceKm,
        duration: quote.distance.durationMinutes,
        origin: quote.distance.origin,
        destination: quote.distance.destination,
      },
      pricing: {
        estimatedPrice: quote.breakdown.totalFare,
        breakdown: quote.breakdown,
        currency: quote.currency,
      },
    });
  } catch (error: any) {
    console.error("Distance calculation error:", error.message);
    return NextResponse.json(
      {
        error: "Failed to calculate distance. Please check addresses and try again.",
      },
      { status: 500 }
    );
  }
}

export const POST = withRateLimit(calculateBookingDistance, {
  ...rateLimits.public,
  scope: "booking_distance",
  max: 30,
});

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const pickup = searchParams.get("pickup");
  const dropoff = searchParams.get("dropoff");

  if (!pickup || !dropoff) {
    return NextResponse.json(
      { error: "Missing pickup or dropoff parameter" },
      { status: 400 }
    );
  }

  try {
    const quote = await calculateAuthoritativeBookingQuote({
      pickupAddress: pickup,
      dropoffAddress: dropoff,
      serviceType: "standard",
    });

    return NextResponse.json({
      success: true,
      distanceKm: quote.distance.distanceKm,
      durationMinutes: quote.distance.durationMinutes,
      estimatedPrice: quote.breakdown.totalFare,
      breakdown: quote.breakdown,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
