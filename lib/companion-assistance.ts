/** Companion assistance is a separate, fixed-price labour service.
 * Do not treat companion hours as waiting minutes, distance, night surcharge,
 * or the driver's assistance-level flat fee.
 */
export const COMPANION_ASSISTANCE_EUR_PER_HOUR = 8;
export const MAX_COMPANIONS_PER_BOOKING = 3;
export const MAX_COMPANION_HOURS = 24;

export function calculateCompanionAssistanceCharge(count: number, hours: number): number {
  if (!Number.isSafeInteger(count) || count < 1 || count > MAX_COMPANIONS_PER_BOOKING ||
      !Number.isSafeInteger(hours) || hours < 1 || hours > MAX_COMPANION_HOURS) {
    throw new RangeError("INVALID_COMPANION_ASSISTANCE");
  }
  return count * hours * COMPANION_ASSISTANCE_EUR_PER_HOUR;
}
