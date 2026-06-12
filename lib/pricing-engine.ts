export type ServicePricingCode =
  | "STANDARD_TAXI"
  | "AIRPORT_TRANSFERS"
  | "CHILD_TRANSPORT"
  | "SENIOR_ACCESSIBLE_TRANSPORT"
  | "MEDICAL_TRANSPORT"
  | "CORPORATE_TRANSPORT"
  | "LONG_DISTANCE_TRANSPORT"
  | "TOURISM_PRIVATE_HIRE";

export type OptionalServiceCharge =
  | "airportPickup"
  | "airportMeetGreet"
  | "assistedTransport"
  | "childTransport"
  | "priorityBooking";

export interface PricingEngineConfig {
  baseFare: number;
  distanceRate: number;
  waitingRatePerMinute: number;
  minimumFare: number;
  bookingFee: number;
  surgeEnabled: boolean;
  airportPickupFee: number;
  airportMeetGreetFee: number;
  assistedTransportFee: number;
  childTransportFee: number;
  priorityBookingFee: number;
  nightServicePercentage: number;
  nightStartTime: string;
  nightEndTime: string;
  transparentPricingMessage: string;
}

export interface DistancePricingTier {
  minKm: number;
  maxKm: number | null;
  ratePerKm: number;
  label?: string;
}

export interface FareCalculationInput {
  distanceKm: number;
  waitingMinutes?: number;
  pickupDateTime?: Date | string | null;
  serviceType?: ServicePricingCode;
  optionalCharges?: Partial<Record<OptionalServiceCharge, boolean>>;
  config?: Partial<PricingEngineConfig>;
  distanceTiers?: DistancePricingTier[];
}

export interface DistanceTierCharge {
  label: string;
  fromKm: number;
  toKm: number | null;
  chargedKm: number;
  ratePerKm: number;
  amount: number;
}

export interface FareBreakdown {
  baseFare: number;
  distanceCharge: number;
  distanceTiers: DistanceTierCharge[];
  waitingCharge: number;
  bookingFee: number;
  optionalServiceCharges: Record<string, number>;
  nightServiceCharge: number;
  minimumFareAdjustment: number;
  surgeCharge: number;
  totalFare: number;
  transparentPricingMessage: string;
}

export const DEFAULT_PRICING_ENGINE_CONFIG: PricingEngineConfig = {
  baseFare: 1.49,
  distanceRate: 1.09,
  waitingRatePerMinute: 0.19,
  minimumFare: 5.0,
  bookingFee: 0,
  surgeEnabled: false,
  airportPickupFee: 3.0,
  airportMeetGreetFee: 5.0,
  assistedTransportFee: 3.0,
  childTransportFee: 3.0,
  priorityBookingFee: 2.0,
  nightServicePercentage: 10,
  nightStartTime: "22:00",
  nightEndTime: "06:00",
  transparentPricingMessage: "Transparent Pricing. No Surge Charges.",
};

export const DEFAULT_DISTANCE_TIERS: DistancePricingTier[] = [
  { minKm: 0, maxKm: 20, ratePerKm: 1.09, label: "0-20 km" },
  { minKm: 20, maxKm: 50, ratePerKm: 1.0, label: "20-50 km" },
  { minKm: 50, maxKm: null, ratePerKm: 0.95, label: "50+ km" },
];

export const DEFAULT_SERVICE_PRICING_PROFILES: Array<{
  code: ServicePricingCode;
  name: string;
  serviceFee: number;
}> = [
  { code: "STANDARD_TAXI", name: "Standard Taxi", serviceFee: 0 },
  { code: "AIRPORT_TRANSFERS", name: "Airport Transfers", serviceFee: 0 },
  { code: "CHILD_TRANSPORT", name: "Child Transport", serviceFee: 3 },
  { code: "SENIOR_ACCESSIBLE_TRANSPORT", name: "Senior & Accessible Transport", serviceFee: 3 },
  { code: "MEDICAL_TRANSPORT", name: "Medical Transport", serviceFee: 3 },
  { code: "CORPORATE_TRANSPORT", name: "Corporate Transport", serviceFee: 0 },
  { code: "LONG_DISTANCE_TRANSPORT", name: "Long Distance Transport", serviceFee: 0 },
  { code: "TOURISM_PRIVATE_HIRE", name: "Tourism & Private Hire", serviceFee: 0 },
];

export const DEFAULT_COMMISSION_RATE = 12.5;

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function toNonNegativeNumber(value: number | undefined, fallback = 0) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(0, value);
}

function parseTimeToMinutes(value: string) {
  const [hoursRaw, minutesRaw] = value.split(":");
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);

  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return 0;
  return hours * 60 + minutes;
}

function isNightService(pickupDateTime: Date | string | null | undefined, start: string, end: string) {
  if (!pickupDateTime) return false;

  const date = pickupDateTime instanceof Date ? pickupDateTime : new Date(pickupDateTime);
  if (Number.isNaN(date.getTime())) return false;

  const currentMinutes = date.getHours() * 60 + date.getMinutes();
  const startMinutes = parseTimeToMinutes(start);
  const endMinutes = parseTimeToMinutes(end);

  if (startMinutes === endMinutes) return false;
  if (startMinutes < endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  }

  return currentMinutes >= startMinutes || currentMinutes < endMinutes;
}

function calculateDistanceCharge(distanceKm: number, tiers: DistancePricingTier[]) {
  const safeDistance = toNonNegativeNumber(distanceKm);
  const activeTiers = [...tiers].sort((a, b) => a.minKm - b.minKm);
  const tierCharges: DistanceTierCharge[] = [];
  let total = 0;

  for (const tier of activeTiers) {
    if (safeDistance <= tier.minKm) continue;

    const tierEnd = tier.maxKm ?? safeDistance;
    const chargedKm = Math.max(0, Math.min(safeDistance, tierEnd) - tier.minKm);
    if (chargedKm <= 0) continue;

    const amount = roundMoney(chargedKm * tier.ratePerKm);
    total += amount;
    tierCharges.push({
      label: tier.label || `${tier.minKm}-${tier.maxKm ?? "+"} km`,
      fromKm: tier.minKm,
      toKm: tier.maxKm,
      chargedKm: roundMoney(chargedKm),
      ratePerKm: tier.ratePerKm,
      amount,
    });
  }

  return {
    distanceCharge: roundMoney(total),
    distanceTiers: tierCharges,
  };
}

export function calculateFare(input: FareCalculationInput) {
  const config: PricingEngineConfig = {
    ...DEFAULT_PRICING_ENGINE_CONFIG,
    ...input.config,
    surgeEnabled: false,
    transparentPricingMessage:
      input.config?.transparentPricingMessage ||
      DEFAULT_PRICING_ENGINE_CONFIG.transparentPricingMessage,
  };
  const tiers = input.distanceTiers?.length ? input.distanceTiers : DEFAULT_DISTANCE_TIERS;
  const distance = toNonNegativeNumber(input.distanceKm);
  const waitingMinutes = toNonNegativeNumber(input.waitingMinutes);
  const { distanceCharge, distanceTiers } = calculateDistanceCharge(distance, tiers);
  const waitingCharge = roundMoney(waitingMinutes * config.waitingRatePerMinute);

  const optionalServiceCharges: Record<string, number> = {};
  const optionalCharges = input.optionalCharges || {};
  if (optionalCharges.airportPickup) optionalServiceCharges.airportPickup = config.airportPickupFee;
  if (optionalCharges.airportMeetGreet) optionalServiceCharges.airportMeetGreet = config.airportMeetGreetFee;
  if (optionalCharges.assistedTransport) optionalServiceCharges.assistedTransport = config.assistedTransportFee;
  if (optionalCharges.childTransport) optionalServiceCharges.childTransport = config.childTransportFee;
  if (optionalCharges.priorityBooking) optionalServiceCharges.priorityBooking = config.priorityBookingFee;

  const optionalTotal = Object.values(optionalServiceCharges).reduce((sum, value) => sum + value, 0);
  const subtotalBeforeNight =
    config.baseFare + distanceCharge + waitingCharge + config.bookingFee + optionalTotal;
  const nightServiceCharge = isNightService(
    input.pickupDateTime,
    config.nightStartTime,
    config.nightEndTime
  )
    ? roundMoney(subtotalBeforeNight * (config.nightServicePercentage / 100))
    : 0;
  const subtotal = roundMoney(subtotalBeforeNight + nightServiceCharge);
  const minimumFareAdjustment = roundMoney(Math.max(0, config.minimumFare - subtotal));
  const totalFare = roundMoney(subtotal + minimumFareAdjustment);

  const breakdown: FareBreakdown = {
    baseFare: roundMoney(config.baseFare),
    distanceCharge,
    distanceTiers,
    waitingCharge,
    bookingFee: roundMoney(config.bookingFee),
    optionalServiceCharges,
    nightServiceCharge,
    minimumFareAdjustment,
    surgeCharge: 0,
    totalFare,
    transparentPricingMessage: config.transparentPricingMessage,
  };

  return {
    totalFare,
    breakdown,
  };
}
