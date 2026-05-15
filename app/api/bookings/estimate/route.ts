import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { estimateBookingPrice } from "@/lib/pricing";

const EstimateSchema = z.object({
  serviceType: z.enum(["STANDARD", "ACCESSIBLE", "SENIOR", "CHILDREN", "AIRPORT"]),
  pickupAddress: z.string().min(3),
  dropoffAddress: z.string().min(3),
  passengerCount: z.number().min(1).max(6),
  luggageType: z.enum(["NONE", "SMALL", "LARGE"]).default("NONE"),
  wheelchairNeeded: z.boolean().default(false),
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
    
    // Calculate estimate based on pricing rules and constraints
    const estimate = estimateBookingPrice(parsed.data);
    
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
