export const REALTIME_QUEUES = { OUTBOX: "drivo-outbox-delivery", OFFER_EXPIRY: "drivo-offer-expiry" } as const;
export const MAX_OUTBOX_ATTEMPTS = 8;
export const OUTBOX_STATES = { PENDING: "PENDING", QUEUED: "QUEUED", PROCESSING: "PROCESSING", RETRY: "RETRY", PUBLISHED: "PUBLISHED", FAILED: "FAILED" } as const;
export const REALTIME_EVENTS = {
  OFFER_UPDATED: "driver.offer.updated", DISPATCH_UPDATED: "dispatch.updated", BOOKING_UPDATED: "booking.updated",
  TRIP_UPDATED: "trip.updated", NOTIFICATION_CREATED: "notification.created", CONNECTION: "realtime.connection",
} as const;
export type ActorType = "DRIVER" | "ADMIN" | "PASSENGER";
