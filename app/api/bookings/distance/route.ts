import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { calculateDistance } from "@/lib/google-maps";
import { getPricingEngineConfig } from "@/lib/pricing-engine-config";
import { calculateFare, type FareBreakdown, type OptionalServiceCharge } from "@/lib/pricing-engine";

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

function buildPickupDateTime(date?: string | null, time?: string | null) {
  if (!date || !time) return null;
  return `${date}T${time}:00`;
}

function optionalChargesFor(serviceType: string, waitAndGreet: boolean) {
  const normalized = serviceType.toLowerCase();
  const optionalCharges: Partial<Record<OptionalServiceCharge, boolean>> = {};

  if (normalized === "airport") {
    optionalCharges.airportPickup = true;
    optionalCharges.airportMeetGreet = waitAndGreet;
  }
  if (normalized === "accessible" || normalized === "senior") {
    optionalCharges.assistedTransport = true;
  }
  if (normalized === "children") {
    optionalCharges.childTransport = true;
  }

  return optionalCharges;
}

function childrenBreakdown(
  breakdown: FareBreakdown,
  recurrenceType: string | null | undefined,
  recurrenceCustom: string | null | undefined,
  returnDate: string | null | undefined,
  returnTime: string | null | undefined
) {
  const serviceDays = childrenServiceDays(recurrenceType, recurrenceCustom);
  const returnLegs = returnDate && returnTime ? 2 : 1;
  const multiplier = returnLegs * serviceDays;
  const multiply = (value: number) => Number((value * multiplier).toFixed(2));
  const optionalServiceCharges = Object.fromEntries(
    Object.entries(breakdown.optionalServiceCharges).map(([key, value]) => [
      key,
      multiply(value),
    ])
  );

  return {
    ...breakdown,
    baseFare: multiply(breakdown.baseFare),
    distanceCharge: multiply(breakdown.distanceCharge),
    distanceTiers: breakdown.distanceTiers.map((tier) => ({
      ...tier,
      amount: multiply(tier.amount),
      chargedKm: multiply(tier.chargedKm),
    })),
    waitingCharge: multiply(breakdown.waitingCharge),
    bookingFee: multiply(breakdown.bookingFee),
    optionalServiceCharges,
    nightServiceCharge: multiply(breakdown.nightServiceCharge),
    minimumFareAdjustment: multiply(breakdown.minimumFareAdjustment),
    totalFare: multiply(breakdown.totalFare),
    childTransport: {
      returnIncluded: Boolean(returnDate && returnTime),
      recurrence: recurrenceType || "ONE_TIME",
      estimatedServiceDays: serviceDays,
      returnLegs,
      pricingSource: "Pricing Engine V1",
    },
  };
}

export async function POST(request: NextRequest) {
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
    const distanceResult = await calculateDistance(data.pickupAddress, data.dropoffAddress);
    const { config, distanceTiers } = await getPricingEngineConfig();
    const pickupDateTime = buildPickupDateTime(data.scheduledDate, data.scheduledTime);
    const fare = calculateFare({
      distanceKm: distanceResult.distanceKm,
      waitingMinutes: data.waitingMinutes,
      pickupDateTime,
      optionalCharges: optionalChargesFor(data.serviceType, data.waitAndGreet),
      config,
      distanceTiers,
    });
    const breakdown =
      data.serviceType.toLowerCase() === "children"
        ? childrenBreakdown(
            fare.breakdown,
            data.recurrenceType,
            data.recurrenceCustom,
            data.returnDate,
            data.returnTime
          )
        : fare.breakdown;

    return NextResponse.json({
      success: true,
      distance: {
        km: distanceResult.distanceKm,
        duration: distanceResult.durationMinutes,
        origin: distanceResult.origin,
        destination: distanceResult.destination,
      },
      pricing: {
        estimatedPrice: breakdown.totalFare,
        breakdown,
        currency: "EUR",
      },
    });
  } catch (error: any) {
    console.error("Distance calculation error:", error.message);
    return NextResponse.json(
      {
        error: "Failed to calculate distance. Please check addresses and try again.",
        details: error.message,
      },
      { status: 500 }
    );
  }
}

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
    const distanceResult = await calculateDistance(pickup, dropoff);
    const { config, distanceTiers } = await getPricingEngineConfig();
    const fare = calculateFare({
      distanceKm: distanceResult.distanceKm,
      config,
      distanceTiers,
    });

    return NextResponse.json({
      success: true,
      distanceKm: distanceResult.distanceKm,
      durationMinutes: distanceResult.durationMinutes,
      estimatedPrice: fare.totalFare,
      breakdown: fare.breakdown,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
