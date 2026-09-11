import { calculateDistance } from "@/lib/google-maps";
import { getPricingEngineConfig } from "@/lib/pricing-engine-config";
import { calculateFare, type FareBreakdown, type OptionalServiceCharge } from "@/lib/pricing-engine";

type QuoteInput = {
  pickupAddress: string;
  dropoffAddress: string;
  serviceType: string;
  waitingMinutes?: number;
  waitingDuration?: string | null;
  customWaitingDuration?: string | null;
  assistanceLevel?: string | null;
  scheduledDate?: string | null;
  scheduledTime?: string | null;
  waitAndGreet?: boolean;
  recurrenceType?: string | null;
  recurrenceCustom?: string | null;
  returnDate?: string | null;
  returnTime?: string | null;
};

function waitingMinutesFromInput(input: QuoteInput) {
  if (typeof input.waitingMinutes === "number") return Math.max(0, input.waitingMinutes);
  const value = input.waitingDuration || "";
  if (value === "30_MINUTES") return 30;
  if (value === "1_HOUR") return 60;
  if (value === "2_HOURS") return 120;
  if (value === "3_HOURS") return 180;
  if (value === "4_HOURS") return 240;
  const match = input.customWaitingDuration?.match(/\d+/);
  return match ? Math.max(0, Number(match[0])) : 0;
}

function customDays(value?: string | null) {
  const valueMatch = value?.match(/\d+/);
  const days = valueMatch ? Number(valueMatch[0]) : 0;
  return Number.isFinite(days) && days > 0 ? days : null;
}

function serviceDays(type?: string | null, custom?: string | null) {
  const days = customDays(custom);
  if (type === "DAILY" || type === "WEEKLY") return days || 5;
  if (type === "MONTHLY") return days || 20;
  if (type === "CUSTOM") return days || 1;
  return 1;
}

function optionalCharges(serviceType: string, waitAndGreet: boolean) {
  const service = serviceType.toLowerCase();
  const values: Partial<Record<OptionalServiceCharge, boolean>> = {};
  if (service === "airport") {
    values.airportPickup = true;
    values.airportMeetGreet = waitAndGreet;
  }
  if (service === "accessible" || service === "senior") values.assistedTransport = true;
  if (service === "children") values.childTransport = true;
  return values;
}

function childrenFare(input: QuoteInput, breakdown: FareBreakdown) {
  const multiplier = serviceDays(input.recurrenceType, input.recurrenceCustom) *
    (input.returnDate && input.returnTime ? 2 : 1);
  const multiply = (value: number) => Number((value * multiplier).toFixed(2));
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
    optionalServiceCharges: Object.fromEntries(
      Object.entries(breakdown.optionalServiceCharges).map(([key, value]) => [key, multiply(value)])
    ),
    nightServiceCharge: multiply(breakdown.nightServiceCharge),
    minimumFareAdjustment: multiply(breakdown.minimumFareAdjustment),
    totalFare: multiply(breakdown.totalFare),
  };
}

export async function calculateAuthoritativeBookingQuote(input: QuoteInput) {
  const distance = await calculateDistance(input.pickupAddress, input.dropoffAddress);
  const { config, distanceTiers } = await getPricingEngineConfig();
  const pickupDateTime = input.scheduledDate && input.scheduledTime
    ? `${input.scheduledDate}T${input.scheduledTime}:00`
    : null;
  const fare = calculateFare({
    distanceKm: distance.distanceKm,
    waitingMinutes: waitingMinutesFromInput(input),
    tripDurationMinutes: distance.durationMinutes,
    driverAssistanceRequired: Boolean(input.assistanceLevel),
    pickupDateTime,
    optionalCharges: optionalCharges(input.serviceType, Boolean(input.waitAndGreet)),
    config,
    distanceTiers,
  });
  const breakdown = input.serviceType.toLowerCase() === "children"
    ? childrenFare(input, fare.breakdown)
    : fare.breakdown;
  return { distance, breakdown, currency: "EUR" as const };
}
