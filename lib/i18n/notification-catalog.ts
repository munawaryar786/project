import { getTranslation, type Locale } from "./index";

const NOTIFICATION_TYPES = new Set([
  "DRIVER_ASSIGNED",
  "DISPATCH_EXHAUSTED",
  "SCHEDULED_READINESS_FAILED",
  "DRIVER_OFFER_UPDATED",
]);

/** Render persisted notification identifiers only at the recipient's UI boundary. */
export function presentNotification(type: unknown, locale: Locale): string {
  return getTranslation(locale, NOTIFICATION_TYPES.has(String(type))
    ? `m5.notifications.${type}` : "m5.notifications.unknown");
}
