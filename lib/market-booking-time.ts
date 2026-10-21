export const MARKET_TIMEZONE = "Europe/Bratislava";

export function marketLocalDateTime(instant: Date = new Date(), timeZone = MARKET_TIMEZONE) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(instant);
  const values = Object.fromEntries(parts.filter(part => part.type !== "literal").map(part => [part.type, part.value]));
  return { date: `${values.year}-${values.month}-${values.day}`, time: `${values.hour}:${values.minute}` };
}

export function bookingPickupIsExpired(pickupAt: Date, now: Date = new Date(), strict = false) {
  if (!Number.isFinite(pickupAt.getTime())) return true;
  if (strict) return pickupAt.getTime() <= now.getTime();
  return pickupAt.getTime() < now.getTime() - 120_000;
}
