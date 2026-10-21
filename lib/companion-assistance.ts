/** Companion assistance is separately priced labour, not ride waiting time.
 * Hours are selected in 30-minute steps; the fixed rate is €8/person/hour.
 * Keep the same validation and options for UI, preview and final server fare.
 */
export const COMPANION_ASSISTANCE_EUR_PER_HOUR = 8;
export const MAX_COMPANIONS_PER_BOOKING = 3;
export const MAX_COMPANION_HOURS = 24;
export const COMPANION_HOUR_STEP = 0.5;

export const COMPANION_HOUR_OPTIONS: readonly number[] = Array.from(
  { length: MAX_COMPANION_HOURS / COMPANION_HOUR_STEP },
  (_, index) => (index + 1) * COMPANION_HOUR_STEP,
);

export function validCompanionHours(hours: number): boolean {
  return Number.isFinite(hours) &&
    hours >= COMPANION_HOUR_STEP &&
    hours <= MAX_COMPANION_HOURS &&
    Number.isSafeInteger(hours / COMPANION_HOUR_STEP);
}

export function calculateCompanionAssistanceCharge(count: number, hours: number): number {
  if (!Number.isSafeInteger(count) || count < 1 || count > MAX_COMPANIONS_PER_BOOKING ||
      !validCompanionHours(hours)) {
    throw new RangeError("INVALID_COMPANION_ASSISTANCE");
  }
  return Math.round(count * hours * COMPANION_ASSISTANCE_EUR_PER_HOUR * 100) / 100;
}
