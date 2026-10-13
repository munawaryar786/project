import { getTranslation, type Locale } from "./index";

export const BOOKING_STATES = ["PENDING", "CONFIRMED", "SEARCHING_DRIVER", "ASSIGNED", "DRIVER_ENROUTE", "ARRIVED", "IN_PROGRESS", "COMPLETED", "CANCELLED", "NO_SHOW"] as const;
export const PAYMENT_STATES = ["PENDING", "AWAITING_PAYMENT", "PROCESSING", "PAID", "EXPIRED", "FAILED", "CANCELLED", "RECONCILIATION_REQUIRED"] as const;
export const DISPATCH_STATES = ["NOT_STARTED", "DISPATCHING", "SEARCHING_DRIVER", "ACCEPTED", "NO_DRIVER_AVAILABLE", "DISPATCH_EXHAUSTED"] as const;
export const DRIVER_STATES = ["PENDING", "CONFIRMED", "SEARCHING_DRIVER", "ASSIGNED", "DRIVER_ENROUTE", "ARRIVED", "IN_PROGRESS", "COMPLETED", "CANCELLED", "NO_SHOW"] as const;
export const DRIVER_OFFER_STATES = ["PENDING", "ACCEPTED", "DECLINED", "REJECTED", "EXPIRED", "CANCELLED"] as const;
export const DRIVER_ACCOUNT_STATES = ["ACTIVE", "INACTIVE", "PENDING", "SUSPENDED", "BLOCKED"] as const;

type StatusKind = "booking" | "payment" | "dispatch" | "driver" | "driverOffer" | "driverAccount";

const families = {
  booking: { states: BOOKING_STATES, prefix: "status.", unknown: "status.unknown" },
  payment: { states: PAYMENT_STATES, prefix: "payment.status.", unknown: "payment.status.unknown" },
  dispatch: { states: DISPATCH_STATES, prefix: "dispatch.", unknown: "dispatch.status.unknown" },
  driver: { states: DRIVER_STATES, prefix: "driverPortal.status.", unknown: "driverPortal.status.unknown" },
  driverOffer: { states: DRIVER_OFFER_STATES, prefix: "driverPortal.offer.", unknown: "driverPortal.offer.unknown" },
  driverAccount: { states: DRIVER_ACCOUNT_STATES, prefix: "m4.driverAccount.", unknown: "m4.common.unknownState" },
} as const;

export function statusKey(kind: StatusKind, value: unknown): string {
  const family = families[kind];
  return typeof value === "string" && (family.states as readonly string[]).includes(value)
    ? `${family.prefix}${value}`
    : family.unknown;
}

export function presentStatus(kind: StatusKind, value: unknown, locale: Locale): string {
  return getTranslation(locale, statusKey(kind, value));
}
