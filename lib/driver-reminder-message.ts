import { getTranslation, type Locale } from "@/lib/i18n/index";

/** Notification payloads carry timing, while visible copy follows Drivo's locale. */
export function driverScheduledReminderMessage(locale: Locale, minutes: unknown) {
  const message = getTranslation(locale, "driverPortal.scheduledRideReminderMessage");
  if (typeof minutes !== "number" || !Number.isFinite(minutes) || minutes <= 0) return message;
  const unit = minutes % 1440 === 0 ? "day" : minutes >= 60 && minutes % 30 === 0 ? "hour" : "minute";
  const value = minutes / (unit === "day" ? 1440 : unit === "hour" ? 60 : 1);
  const time = new Intl.RelativeTimeFormat(locale, { numeric: "always" }).format(value, unit);
  return `${message} ${getTranslation(locale, "driverPortal.scheduledRideReminderTiming").replace("{time}", time)}`;
}
