import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { calculateDistance, calculatePriceEstimate } from "@/lib/google-maps";

const DistanceSchema = z.object({
  pickupAddress: z.string().min(3),
  dropoffAddress: z.string().min(3),
  serviceType: z.string().optional().default("standard"),
  passengerCount: z.number().optional().default(1),
});

/**
 * POST /api/bookings/distance - Calculate real distance and price estimate
 */
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

    const { pickupAddress, dropoffAddress, serviceType, passengerCount } = parsed.data;

    // Calculate real distance using Google Maps
    const distanceResult = await calculateDistance(pickupAddress, dropoffAddress);

    // Calculate price estimate
    const priceEstimate = calculatePriceEstimate(
      distanceResult.distanceKm,
      serviceType,
      passengerCount
    );

    return NextResponse.json({
      success: true,
      distance: {
        km: distanceResult.distanceKm,
        duration: distanceResult.durationMinutes,
        origin: distanceResult.origin,
        destination: distanceResult.destination,
      },
      pricing: {
        estimatedPrice: priceEstimate.price,
        breakdown: priceEstimate.breakdown,
        currency: "EUR",
      },
    });
  } catch (error: any) {
    console.error("❌ Distance calculation error:", error.message);
    return NextResponse.json(
      { 
        error: "Failed to calculate distance. Please check addresses and try again.",
        details: error.message 
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/bookings/distance - Quick distance check (for autocomplete)
 */
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
    const priceEstimate = calculatePriceEstimate(distanceResult.distanceKm);

    return NextResponse.json({
      success: true,
      distanceKm: distanceResult.distanceKm,
      durationMinutes: distanceResult.durationMinutes,
      estimatedPrice: priceEstimate.price,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
