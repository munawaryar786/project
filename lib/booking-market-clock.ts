import { MARKET_TIME_ZONE } from "./i18n/locale-resolution";

// Bookings are fulfilled in Bratislava. A browser's local timezone (or UTC
// calendar date) must never be combined with a Bratislava wall-clock pickup.
// The server's scheduled-marketplace parser interprets these wall values in
// Europe/Bratislava, including daylight-saving transitions.
export function currentBookingMarketWallTime(at: Date = new Date()): { date: string; time: string } {
  if (!Number.isFinite(at.getTime())) throw new Error("Invalid booking clock");
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: MARKET_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  if (!values.year || !values.month || !values.day || !values.hour || !values.minute) {
    throw new Error("Booking timezone unavailable");
  }
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    time: `${values.hour}:${values.minute}`,
  };
}
