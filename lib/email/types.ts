import type { Locale } from "../i18n";

export type BookingMail = {
  bookingRef: string;
  pickupAt: string;
  marketTimezone: string;
  pickupAddress: string;
  destination: string;
  serviceType: string;
  amount?: number | null;
  paymentMethod?: string;
};
export type AssignmentMail = BookingMail & { driverName: string; vehicle?: string; registration?: string };
export type EmailData = {
  BOOKING_RECEIVED: BookingMail;
  BOOKING_CONFIRMED: BookingMail;
  ADMIN_BOOKING_CREATED: BookingMail;
  ADMIN_ASSISTED_COPY: BookingMail;
  DRIVER_CONFIRMED: AssignmentMail;
  ADMIN_DRIVER_CONFIRMED: AssignmentMail;
  PAYMENT_RECEIPT: { bookingRef: string; amount: number };
  DISPATCH_PAYMENT_LINK: { bookingRef: string; amount: string; url: string; expiresAt: string };
  PASSWORD_RESET: { token: string; attemptId: string; expiresAt: string };
  ADMIN_NO_DRIVER: BookingMail;
};
export type EmailType = keyof EmailData;
export type TransactionalEmail = { [K in EmailType]: {
  type: K; recipient: string; locale: Locale; data: EmailData[K]; idempotencyKey: string; correlationId: string;
  assignment?: { bookingId: string; driverId: string; assignedAtMs: number };
} }[EmailType];
export type RenderedEmail = { subject: string; html: string; text: string };
export type DeliveryResult = { success: boolean; provider: string; retryable?: boolean; error?: string; warning?: string };
