import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:mm format");

const PricingSchema = z.object({
  standardTaxiBasePrice: z.coerce.number().min(0).optional(),
  pricePerKm: z.coerce.number().min(0).optional(),
  airportTransferPrice: z.coerce.number().min(0).optional(),
  tourismTransferPrice: z.coerce.number().min(0).optional(),
  weeklyVehicleRentalPrice: z.coerce.number().min(0).optional(),
  dailyVehicleRentalPrice: z.coerce.number().min(0).optional(),
  baseFare: z.coerce.number().min(0),
  distanceRate: z.coerce.number().min(0),
  waitingRatePerMinute: z.coerce.number().min(0),
  minimumFare: z.coerce.number().min(0),
  bookingFee: z.coerce.number().min(0),
  surgeEnabled: z.boolean().default(false),
  airportPickupFee: z.coerce.number().min(0),
  airportMeetGreetFee: z.coerce.number().min(0),
  assistedTransportFee: z.coerce.number().min(0),
  childTransportFee: z.coerce.number().min(0),
  priorityBookingFee: z.coerce.number().min(0),
  nightServicePercentage: z.coerce.number().min(0).max(100),
  nightStartTime: timeSchema,
  nightEndTime: timeSchema,
  globalDefaultCommission: z.coerce.number().min(0).max(100).optional(),
  transparentPricingMessage: z.string().min(1).max(160).optional(),
});

const TierSchema = z.object({
  id: z.string().optional(),
  key: z.string().optional(),
  label: z.string().min(1),
  minKm: z.coerce.number().min(0),
  maxKm: z.coerce.number().min(0).nullable().optional(),
  ratePerKm: z.coerce.number().min(0),
  sortOrder: z.coerce.number().int().min(0),
  active: z.boolean().default(true),
});

const PayloadSchema = z.object({
  pricing: PricingSchema,
  tiers: z.array(TierSchema).min(1),
});

const DEFAULT_PRICING = {
  key: "default",
  standardTaxiBasePrice: 3,
  pricePerKm: 1.5,
  airportTransferPrice: 5,
  tourismTransferPrice: 0,
  weeklyVehicleRentalPrice: 120,
  dailyVehicleRentalPrice: 25,
  minimumFare: 5,
  baseFare: 1.49,
  distanceRate: 1.09,
  waitingRatePerMinute: 0.19,
  bookingFee: 0,
  surgeEnabled: false,
  airportPickupFee: 3,
  airportMeetGreetFee: 5,
  assistedTransportFee: 3,
  childTransportFee: 3,
  priorityBookingFee: 2,
  nightServicePercentage: 10,
  nightStartTime: "22:00",
  nightEndTime: "06:00",
  globalDefaultCommission: 12.5,
  transparentPricingMessage: "Transparent Pricing. No Surge Charges.",
};

const DEFAULT_TIERS = [
  { key: "default:0-20", label: "0-20 km", minKm: 0, maxKm: 20, ratePerKm: 1.09, sortOrder: 1 },
  { key: "default:20-50", label: "20-50 km", minKm: 20, maxKm: 50, ratePerKm: 1, sortOrder: 2 },
  { key: "default:50-plus", label: "50+ km", minKm: 50, maxKm: null, ratePerKm: 0.95, sortOrder: 3 },
];

async function getOrCreatePricing() {
  const existing = await prisma.pricingSettings.findUnique({ where: { key: "default" } });
  if (existing) return existing;

  return prisma.pricingSettings.create({ data: DEFAULT_PRICING });
}

async function getOrCreateTiers() {
  const tiers = await prisma.pricingDistanceTier.findMany({
    where: { configKey: "default" },
    orderBy: { sortOrder: "asc" },
  });

  if (tiers.length) return tiers;

  await Promise.all(
    DEFAULT_TIERS.map((tier) =>
      prisma.pricingDistanceTier.upsert({
        where: { key: tier.key },
        update: { ...tier, configKey: "default", active: true },
        create: { ...tier, configKey: "default", active: true },
      })
    )
  );

  return prisma.pricingDistanceTier.findMany({
    where: { configKey: "default" },
    orderBy: { sortOrder: "asc" },
  });
}

function validateTiers(tiers: z.infer<typeof TierSchema>[]) {
  const sorted = [...tiers].sort((a, b) => a.sortOrder - b.sortOrder);

  for (const tier of sorted) {
    if (tier.maxKm !== null && tier.maxKm !== undefined && tier.maxKm <= tier.minKm) {
      return "Tier max km must be greater than min km.";
    }
  }

  return "";
}

export async function GET() {
  try {
    const [pricing, tiers] = await Promise.all([getOrCreatePricing(), getOrCreateTiers()]);
    return NextResponse.json({ success: true, pricing, tiers });
  } catch (error) {
    console.error("Pricing fetch error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch pricing settings" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = PayloadSchema.safeParse(body);

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

    const tierError = validateTiers(parsed.data.tiers);
    if (tierError) {
      return NextResponse.json({ success: false, error: tierError }, { status: 400 });
    }

    const pricingData = {
      ...parsed.data.pricing,
      standardTaxiBasePrice: parsed.data.pricing.standardTaxiBasePrice ?? parsed.data.pricing.baseFare,
      pricePerKm: parsed.data.pricing.pricePerKm ?? parsed.data.pricing.distanceRate,
      airportTransferPrice: parsed.data.pricing.airportTransferPrice ?? parsed.data.pricing.airportPickupFee,
      tourismTransferPrice: parsed.data.pricing.tourismTransferPrice ?? 0,
      weeklyVehicleRentalPrice: parsed.data.pricing.weeklyVehicleRentalPrice ?? 120,
      dailyVehicleRentalPrice: parsed.data.pricing.dailyVehicleRentalPrice ?? 25,
      transparentPricingMessage:
        parsed.data.pricing.transparentPricingMessage ||
        "Transparent Pricing. No Surge Charges.",
    };

    const pricing = await prisma.pricingSettings.upsert({
      where: { key: "default" },
      update: pricingData,
      create: { key: "default", ...pricingData },
    });

    const existing = await prisma.pricingDistanceTier.findMany({
      where: { configKey: "default" },
      select: { id: true },
    });
    const incomingIds = parsed.data.tiers.map((tier) => tier.id).filter(Boolean) as string[];
    const staleIds = existing.map((tier) => tier.id).filter((id) => !incomingIds.includes(id));

    if (staleIds.length) {
      await prisma.pricingDistanceTier.deleteMany({ where: { id: { in: staleIds } } });
    }

    await Promise.all(
      parsed.data.tiers.map((tier, index) => {
        const data = {
          key: tier.key || `default:tier-${index + 1}`,
          configKey: "default",
          label: tier.label,
          minKm: tier.minKm,
          maxKm: tier.maxKm ?? null,
          ratePerKm: tier.ratePerKm,
          sortOrder: tier.sortOrder,
          active: tier.active,
        };

        return tier.id
          ? prisma.pricingDistanceTier.update({ where: { id: tier.id }, data })
          : prisma.pricingDistanceTier.upsert({
              where: { key: data.key },
              update: data,
              create: data,
            });
      })
    );

    const tiers = await getOrCreateTiers();
    return NextResponse.json({ success: true, pricing, tiers });
  } catch (error) {
    console.error("Pricing update error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to save pricing settings" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  return PUT(request);
}
