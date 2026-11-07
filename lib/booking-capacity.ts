/**
 * Capacity policy for Drivo's Phase 1 seven-seat vehicles:
 * six passenger seats (including companions), or five seats when luggage is
 * selected. Larger-vehicle requests require a separately supported category;
 * choosing Airport alone does not increase a standard vehicle's capacity.
 *
 * Called at server booking creation and again before any assignment.
 */
export type BookingCapacityInput = {
  passengerCount: number;
  companionCount?: number | null;
  smallBags?: number | null;
  largeBags?: number | null;
  luggageType?: string | null;
};

export type BookingCapacityIssue = "CAPACITY_EXCEEDED" | "LUGGAGE_CAPACITY_EXCEEDED";

export function standardVehicleCapacityIssue(input: BookingCapacityInput): BookingCapacityIssue | null {
  const companions = input.companionCount ?? 0;
  const smallBags = input.smallBags ?? 0;
  const largeBags = input.largeBags ?? 0;
  const counts = [input.passengerCount, companions, smallBags, largeBags];
  if (!counts.every(Number.isSafeInteger) || input.passengerCount < 1 ||
      companions < 0 || smallBags < 0 || largeBags < 0 ||
      smallBags > 12 || largeBags > 12) return "CAPACITY_EXCEEDED";

  const totalPassengers = input.passengerCount + companions;
  if (totalPassengers > 6) return "CAPACITY_EXCEEDED";
  const hasLuggage = smallBags > 0 || largeBags > 0 ||
    input.luggageType === "SMALL" || input.luggageType === "LARGE";
  if (totalPassengers > 5 && hasLuggage) return "LUGGAGE_CAPACITY_EXCEEDED";
  return null;
}
