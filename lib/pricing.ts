export const PRICING_RATES = {
  BASE_FARE: 3.0,
  PER_KM: 1.5,
  AIRPORT_SURCHARGE: 5.0,
  MINIMUM_FARE: 5.0,
  WAV_SURCHARGE: 0.0, // Subsidized or no extra charge for accessible
  MAX_PASSENGERS_STANDARD: 4,
  MAX_PASSENGERS_MINIVAN: 6, // 7-seater vehicles
};

export interface PriceEstimateRequest {
  serviceType: string;
  pickupAddress: string;
  dropoffAddress: string;
  passengerCount: number;
  luggageType: "NONE" | "SMALL" | "LARGE";
  wheelchairNeeded: boolean;
}

export interface PriceEstimateResponse {
  estimatedPrice: number;
  distanceKm: number;
  warnings: string[];
  vehicleRequired: "STANDARD" | "MINIVAN" | "WAV";
}

/**
 * Mock distance calculator for MVP
 */
function mockCalculateDistance(pickup: string, dropoff: string): number {
  // Simple deterministic variation based on string length
  const combined = pickup + dropoff;
  const hash = combined.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  // Distance between 2km and 20km for MVP
  return 2 + (hash % 18) + (hash % 10) * 0.1;
}

/**
 * Validates payload (passengers + luggage) vs vehicle capacity
 * and estimates price based on distance and service.
 */
export function estimateBookingPrice(req: PriceEstimateRequest): PriceEstimateResponse {
  const warnings: string[] = [];
  let vehicleRequired: "STANDARD" | "MINIVAN" | "WAV" = "STANDARD";
  
  // 1. Validate Capacity & Assign Vehicle
  if (req.wheelchairNeeded || req.serviceType === "ACCESSIBLE") {
    vehicleRequired = "WAV";
    if (req.passengerCount > 4) {
      warnings.push("WAV vehicles can typically hold 1 wheelchair + up to 3 regular passengers. Dispatch may contact you.");
    }
  } else if (req.passengerCount > PRICING_RATES.MAX_PASSENGERS_STANDARD) {
    vehicleRequired = "MINIVAN";
    if (req.passengerCount > PRICING_RATES.MAX_PASSENGERS_MINIVAN) {
      warnings.push(`Warning: Maximum passenger capacity is ${PRICING_RATES.MAX_PASSENGERS_MINIVAN}.`);
    }
  }

  // Luggage validation
  if (req.luggageType === "LARGE" && req.passengerCount >= 4) {
    if (vehicleRequired !== "WAV") {
      vehicleRequired = "MINIVAN";
      warnings.push("Upgraded to Minivan due to combination of large luggage and passenger count.");
    } else {
      warnings.push("Large luggage with WAV usage might have limited space. Dispatch will confirm.");
    }
  }

  // 2. Distance Estimation (mock for now, will be replaced by Google Maps in API route)
  const distanceKm = mockCalculateDistance(req.pickupAddress, req.dropoffAddress);

  // 3. Price Calculation
  let estimatedPrice = PRICING_RATES.BASE_FARE + (distanceKm * PRICING_RATES.PER_KM);

  // Minivan surcharge
  if (vehicleRequired === "MINIVAN") estimatedPrice *= 1.2;

  // Airport surcharge
  if (req.serviceType === "AIRPORT" || 
      req.pickupAddress.toLowerCase().includes("airport") || 
      req.dropoffAddress.toLowerCase().includes("airport")) {
    estimatedPrice += PRICING_RATES.AIRPORT_SURCHARGE;
  }

  // Ensure minimum fare
  estimatedPrice = Math.max(estimatedPrice, PRICING_RATES.MINIMUM_FARE);

  return {
    estimatedPrice: parseFloat(estimatedPrice.toFixed(2)),
    distanceKm: parseFloat(distanceKm.toFixed(1)),
    warnings,
    vehicleRequired,
  };
}

/**
 * Calculate price from real distance (Google Maps)
 * This function is used when distance is already calculated via Google Maps API
 */
export function calculatePriceFromDistance(
  distanceKm: number,
  serviceType: string,
  passengerCount: number,
  vehicleRequired: "STANDARD" | "MINIVAN" | "WAV"
): number {
  // Base fare + distance
  let estimatedPrice = PRICING_RATES.BASE_FARE + (distanceKm * PRICING_RATES.PER_KM);

  // Minivan surcharge
  if (vehicleRequired === "MINIVAN") estimatedPrice *= 1.2;

  // Airport surcharge
  if (serviceType === "AIRPORT") {
    estimatedPrice += PRICING_RATES.AIRPORT_SURCHARGE;
  }

  // Ensure minimum fare
  estimatedPrice = Math.max(estimatedPrice, PRICING_RATES.MINIMUM_FARE);

  return parseFloat(estimatedPrice.toFixed(2));
}
