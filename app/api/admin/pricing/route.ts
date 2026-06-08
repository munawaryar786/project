import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const PricingSchema = z.object({
  standardTaxiBasePrice: z.coerce.number().min(0),
  pricePerKm: z.coerce.number().min(0),
  airportTransferPrice: z.coerce.number().min(0),
  tourismTransferPrice: z.coerce.number().min(0),
  weeklyVehicleRentalPrice: z.coerce.number().min(0),
  dailyVehicleRentalPrice: z.coerce.number().min(0),
  minimumFare: z.coerce.number().min(0),
});

const DEFAULT_PRICING = {
  standardTaxiBasePrice: 3,
  pricePerKm: 1.5,
  airportTransferPrice: 5,
  tourismTransferPrice: 0,
  weeklyVehicleRentalPrice: 120,
  dailyVehicleRentalPrice: 25,
  minimumFare: 5,
};

async function getOrCreatePricing() {
  const existing = await prisma.pricingSettings.findUnique({
    where: { key: "default" },
  });

  if (existing) return existing;

  return prisma.pricingSettings.create({
    data: {
      key: "default",
      ...DEFAULT_PRICING,
    },
  });
}

export async function GET() {
  try {
    const pricing = await getOrCreatePricing();
    return NextResponse.json({ success: true, pricing });
  } catch (error) {
    console.error("Pricing fetch error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch pricing settings" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = PricingSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing or invalid pricing fields",
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const pricing = await prisma.pricingSettings.upsert({
      where: { key: "default" },
      update: parsed.data,
      create: {
        key: "default",
        ...parsed.data,
      },
    });

    return NextResponse.json({ success: true, pricing });
  } catch (error) {
    console.error("Pricing update error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to save pricing settings" },
      { status: 500 }
    );
  }
}
