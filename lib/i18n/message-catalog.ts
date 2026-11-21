import { getTranslation, type Locale } from "./index";

// Presentation codes are additive. Existing API error/status payloads are unchanged.
// Never use arbitrary server error strings as display copy.
export const MESSAGE_CODE_KEYS = {
  AUTH_INVALID_CREDENTIALS: "error.auth",
  AUTH_SESSION_EXPIRED: "error.auth",
  AUTH_REQUIRED: "error.auth",
  AUTHENTICATION_REQUIRED: "error.auth",
  OTP_INVALID: "error.otp",
  OTP_EXPIRED: "error.otp",
  OTP_RATE_LIMITED: "error.otp",
  BOOKING_ACCESS_DENIED: "error.bookingAccess",
  BOOKING_CAPABILITY_INVALID: "error.bookingAccess",
  BOOKING_AUTHORIZATION_REQUIRED: "error.bookingAccess",
  BOOKING_CONTINUE_FAILED: "error.bookingAccess",
  PASSENGER_VERIFICATION_REQUIRED: "error.otp",
  BOOKING_VALIDATION_FAILED: "error.bookingValidation",
  BOOKING_NOT_DISPATCHABLE: "error.bookingValidation",
  INVALID_SCHEDULE_TIME: "error.bookingValidation",
  CASH_AGREEMENT_REQUIRED: "error.bookingValidation",
  INVOICE_REQUIRES_CORPORATE_APPROVAL: "error.bookingValidation",
  PAYMENT_NOT_VERIFIED: "error.payment",
  PAYMENT_NOT_CONFIRMED: "error.payment",
  PAYMENT_RECONCILIATION_REQUIRED: "error.payment",
  DISPATCH_UNAVAILABLE: "error.dispatch",
  DISPATCH_CONFIG_MISSING: "error.dispatch",
  NO_PICKUP_COORDINATES: "error.dispatch",
  DISPATCH_NOT_ALLOWED: "error.dispatch",
  ROUTE_FEASIBILITY_UNAVAILABLE: "error.dispatch",
  ADMIN_OPERATION_FAILED: "error.admin",
  AUDIT_REASON_REQUIRED: "error.admin",
  STATE_CONFLICT: "error.admin",
  DRIVER_OFFER_EXPIRED: "error.driver",
  OFFER_EXPIRED: "error.driver",
  OFFER_NOT_FOUND: "error.driver",
  OFFER_ALREADY_RESPONDED: "error.driver",
  BOOKING_ALREADY_CLAIMED: "error.driver",
  DRIVER_SCHEDULE_CONFLICT: "error.driver",
  CONFLICTING_ACTIVE_TRIP: "error.driver",
  INVALID_TRANSITION: "error.driver",
  DRIVER_NOT_AVAILABLE: "error.driver",
  CONTACT_SEND_FAILED: "error.contact",
  RENTAL_REQUEST_FAILED: "error.rental",
  SERVICE_UNAVAILABLE: "error.service",
  RATE_LIMITED: "error.retryAfter",
  RATE_LIMITED_GENERIC: "error.rateLimitedGeneric",
  PASSWORD_RESET_EXPIRED: "passenger.resetExpired",
  PASSWORD_RESET_VALIDATION_FAILED: "passenger.resetFailed",
} as const;

export type MessageCode = keyof typeof MESSAGE_CODE_KEYS;
export type MessageParams = { minutes?: number };

export function messageKeyForCode(code: unknown): string {
  return typeof code === "string" && Object.prototype.hasOwnProperty.call(MESSAGE_CODE_KEYS, code)
    ? MESSAGE_CODE_KEYS[code as MessageCode]
    : "error.unknown";
}

export function presentMessage(code: unknown, locale: Locale, params: MessageParams = {}): string {
  const key = messageKeyForCode(code);
  let message = getTranslation(locale, key);
  if (key === "error.retryAfter") {
    const minutes = params.minutes;
    if (typeof minutes !== "number" || !Number.isSafeInteger(minutes) || minutes < 1 || minutes > 1440) {
      return getTranslation(locale, "error.service");
    }
    message = message.replaceAll("{minutes}", String(minutes));
  }
  return message;
}
