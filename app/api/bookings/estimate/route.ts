import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { estimateBookingPrice, PRICING_RATES } from "@/lib/pricing";
import { prisma } from "@/lib/prisma";

const EstimateSchema = z.object({
  serviceType: z.enum(["STANDARD", "ACCESSIBLE", "SENIOR", "CHILDREN", "AIRPORT"]),
  pickupAddress: z.string().min(3),
  dropoffAddress: z.string().min(3),
  passengerCount: z.number().min(1).max(6),
  luggageType: z.enum(["NONE", "SMALL", "LARGE"]).default("NONE"),
  smallBags: z.number().min(0).max(12).default(0),
  largeBags: z.number().min(0).max(12).default(0),
  companionCount: z.number().min(0).max(3).default(0),
  wheelchairNeeded: z.boolean().default(false),
  wavRequired: z.boolean().default(false),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate request
    const parsed = EstimateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed - invalid parameters for estimation", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }
    
    const settings = await prisma.pricingSettings.findUnique({
      where: { key: "default" },
    });

    const rates = settings
      ? {
          ...PRICING_RATES,
          BASE_FARE: settings.standardTaxiBasePrice,
          PER_KM: settings.pricePerKm,
          AIRPORT_SURCHARGE: settings.airportTransferPrice,
          MINIMUM_FARE: settings.minimumFare,
        }
      : PRICING_RATES;

    // Calculate estimate based on pricing rules and constraints
    const estimate = estimateBookingPrice(parsed.data, rates);
    
    return NextResponse.json({
      success: true,
      estimate
    });
    
  } catch (error) {
    console.error("❌ Estimation error:", error);
    return NextResponse.json(
      { error: "Failed to estimate booking." },
      { status: 500 }
    );
  }
}
