import { prisma } from "@/lib/prisma";
import {
  DEFAULT_DISTANCE_TIERS,
  DEFAULT_PRICING_ENGINE_CONFIG,
  type DistancePricingTier,
  type PricingEngineConfig,
} from "@/lib/pricing-engine";

export async function getPricingEngineConfig(): Promise<{
  config: PricingEngineConfig;
  distanceTiers: DistancePricingTier[];
}> {
  const [settings, tiers] = await Promise.all([
    prisma.pricingSettings.findUnique({ where: { key: "default" } }),
    prisma.pricingDistanceTier.findMany({
      where: { configKey: "default", active: true },
      orderBy: { sortOrder: "asc" },
    }),
  ]);

  return {
    config: {
      ...DEFAULT_PRICING_ENGINE_CONFIG,
      baseFare: settings?.baseFare ?? DEFAULT_PRICING_ENGINE_CONFIG.baseFare,
      distanceRate: settings?.distanceRate ?? DEFAULT_PRICING_ENGINE_CONFIG.distanceRate,
      waitingRatePerMinute:
        settings?.waitingRatePerMinute ?? DEFAULT_PRICING_ENGINE_CONFIG.waitingRatePerMinute,
      minimumFare: settings?.minimumFare ?? DEFAULT_PRICING_ENGINE_CONFIG.minimumFare,
      bookingFee: settings?.bookingFee ?? DEFAULT_PRICING_ENGINE_CONFIG.bookingFee,
      surgeEnabled: false,
      airportPickupFee: settings?.airportPickupFee ?? DEFAULT_PRICING_ENGINE_CONFIG.airportPickupFee,
      airportMeetGreetFee:
        settings?.airportMeetGreetFee ?? DEFAULT_PRICING_ENGINE_CONFIG.airportMeetGreetFee,
      assistedTransportFee:
        settings?.assistedTransportFee ?? DEFAULT_PRICING_ENGINE_CONFIG.assistedTransportFee,
      childTransportFee: settings?.childTransportFee ?? DEFAULT_PRICING_ENGINE_CONFIG.childTransportFee,
      priorityBookingFee:
        settings?.priorityBookingFee ?? DEFAULT_PRICING_ENGINE_CONFIG.priorityBookingFee,
      nightServicePercentage:
        settings?.nightServicePercentage ?? DEFAULT_PRICING_ENGINE_CONFIG.nightServicePercentage,
      nightStartTime: settings?.nightStartTime ?? DEFAULT_PRICING_ENGINE_CONFIG.nightStartTime,
      nightEndTime: settings?.nightEndTime ?? DEFAULT_PRICING_ENGINE_CONFIG.nightEndTime,
      transparentPricingMessage:
        settings?.transparentPricingMessage ||
        DEFAULT_PRICING_ENGINE_CONFIG.transparentPricingMessage,
    },
    distanceTiers: tiers.length
      ? tiers.map((tier) => ({
          minKm: tier.minKm,
          maxKm: tier.maxKm,
          ratePerKm: tier.ratePerKm,
          label: tier.label,
        }))
      : DEFAULT_DISTANCE_TIERS,
  };
}
