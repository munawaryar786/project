// Public compatibility API. All provider calls go through the transactional service.
import type { Booking } from "@prisma/client";
import { emailAddress, emailOrigin, EmailError } from "./email/config";
import { emailLocale } from "./email/templates";
import type { DeliveryResult, BookingMail, TransactionalEmail } from "./email/types";
import { sendTransactionalEmail } from "./email/send";
import { parseMarketDateTime } from "./scheduled-marketplace";
export type EmailSendResult = DeliveryResult;
export interface BookingEmailData {
  bookingId?: string;
  pickupAt?: Date | string | null;
  marketTimezone?: string | null;
  bookingRef: string;
  serviceType: string;
  pickupAddress: string;
  dropoffAddress: string;
  scheduledDate: string;
  scheduledTime: string;
  passengerCount: number;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  languagePref?: string | null;
  paymentMethod: string;
  wheelchairNeeded: boolean;
  luggageType: string;
  specialNotes?: string | null;
  sourceDomain?: string | null;
  estimatedPrice?: number | null;
  distanceKm?: number | null;
  driverName?: string | null;
  driverPhone?: string | null;
  flightNumber?: string | null;
  airline?: string | null;
  waitAndGreet?: boolean | null;
  status?: string | null;
  createdAt?: Date | string | null;
  smallBags?: number | null;
  largeBags?: number | null;
  seniorPassenger?: boolean | null;
  ztpCardHolder?: boolean | null;
  wheelchairUser?: boolean | null;
  companionRequired?: boolean | null;
  medicalAppointment?: boolean | null;
  waitingTimeRequired?: boolean | null;
  assistanceLevel?: string | null;
  wheelchairType?: string | null;
  canTransferToSeat?: boolean | null;
  wavRequired?: boolean | null;
  passengerRemainsInWheelchair?: boolean | null;
  companionCount?: number | null;
  hospitalName?: string | null;
  department?: string | null;
  appointmentDate?: string | null;
  appointmentTime?: string | null;
  tripType?: string | null;
  returnDate?: string | null;
  returnTime?: string | null;
  waitingDuration?: string | null;
  customWaitingDuration?: string | null;
}

export function bookingToEmailData(booking: Booking): BookingEmailData {
  return {
    bookingId: booking.id, pickupAt: booking.pickupAt, marketTimezone: booking.marketTimezone,
    bookingRef: booking.bookingRef,
    serviceType: booking.serviceType,
    pickupAddress: booking.pickupAddress,
    dropoffAddress: booking.dropoffAddress,
    scheduledDate: booking.scheduledDate,
    scheduledTime: booking.scheduledTime,
    passengerCount: booking.passengerCount,
    customerName: booking.customerName,
    customerPhone: `${booking.customerPhoneCode}${booking.customerPhone}`,
    customerEmail: booking.customerEmail || "",
    languagePref: booking.languagePref,
    paymentMethod: booking.paymentMethod,
    wheelchairNeeded: booking.wheelchairNeeded,
    luggageType: booking.luggageType,
    specialNotes: booking.specialNotes,
    sourceDomain: booking.sourceDomain,
    estimatedPrice: booking.fareTotalFare ?? booking.estimatedPrice,
    distanceKm: booking.distanceKm,
    flightNumber: booking.flightNumber,
    airline: booking.airline,
    waitAndGreet: booking.waitAndGreet,
    status: booking.status,
    createdAt: booking.createdAt,
    smallBags: booking.smallBags,
    largeBags: booking.largeBags,
    seniorPassenger: booking.seniorPassenger,
    ztpCardHolder: booking.ztpCardHolder,
    wheelchairUser: booking.wheelchairUser,
    companionRequired: booking.companionRequired,
    medicalAppointment: booking.medicalAppointment,
    waitingTimeRequired: booking.waitingTimeRequired,
    assistanceLevel: booking.assistanceLevel,
    wheelchairType: booking.wheelchairType,
    canTransferToSeat: booking.canTransferToSeat,
    wavRequired: booking.wavRequired,
    passengerRemainsInWheelchair: booking.passengerRemainsInWheelchair,
    companionCount: booking.companionCount,
    hospitalName: booking.hospitalName,
    department: booking.department,
    appointmentDate: booking.appointmentDate,
    appointmentTime: booking.appointmentTime,
    tripType: booking.tripType,
    returnDate: booking.returnDate,
    returnTime: booking.returnTime,
    waitingDuration: booking.waitingDuration,
    customWaitingDuration: booking.customWaitingDuration,
  };
}


export function getAdminEmail() {
  const recipient = process.env.ADMIN_BOOKING_EMAIL || process.env.BOOKING_NOTIFICATION_EMAIL || process.env.ADMIN_EMAIL;
  if (!recipient) throw new EmailError("EMAIL_ADMIN_RECIPIENT_MISSING");
  return emailAddress(recipient);
}
export function isSeniorAssistedService(value?: string | null) { return ["SENIOR", "ACCESSIBLE"].includes(String(value || "").toUpperCase()); }
export function bookingMail(data: BookingEmailData): BookingMail {
  const pickup = data.pickupAt ? new Date(data.pickupAt) : parseMarketDateTime(data.scheduledDate, data.scheduledTime, data.marketTimezone || "Europe/Bratislava");
  if (!pickup || !Number.isFinite(pickup.getTime())) throw new EmailError("EMAIL_PICKUP_INVALID");
  return { bookingRef: data.bookingRef, pickupAt: pickup.toISOString(), marketTimezone: data.marketTimezone || "Europe/Bratislava", pickupAddress: data.pickupAddress, destination: data.dropoffAddress, serviceType: data.serviceType, amount: data.estimatedPrice, paymentMethod: data.paymentMethod };
}
function bookingRequest(data: BookingEmailData, type: "BOOKING_CONFIRMED" | "ADMIN_BOOKING_CREATED" | "ADMIN_ASSISTED_COPY" | "ADMIN_NO_DRIVER", recipient: string): TransactionalEmail {
  // Preserve keys already recorded by the previous sender across deployment.
  const idempotencyKey = type === "BOOKING_CONFIRMED" ? "BOOKING_CONFIRMATION_INVOICE:" + data.bookingRef
    : type === "ADMIN_NO_DRIVER" ? "NO_DRIVER_ADMIN_ESCALATION:" + data.bookingRef
    : type + ":" + (data.bookingId || data.bookingRef);
  return { type, recipient, locale: emailLocale(data.languagePref), data: bookingMail(data), idempotencyKey, correlationId: data.bookingId || data.bookingRef };
}
async function sendBookingMail(data: BookingEmailData, type: Parameters<typeof bookingRequest>[1], recipient: () => string): Promise<DeliveryResult> {
  try { return await sendTransactionalEmail(bookingRequest(data, type, recipient())); }
  catch (error) {
    const code = error instanceof EmailError ? error.code : "EMAIL_REQUEST_FAILED";
    console.error("[email.request.failed]", { emailType: type, code });
    return { success: false, provider: "none", error: code };
  }
}
export async function notifyAdminNewBooking(data: BookingEmailData) { return sendBookingMail(data, "ADMIN_BOOKING_CREATED", getAdminEmail); }
export async function sendSeniorAssistedBookingEmails(data: BookingEmailData) {
  const adminFull = await notifyAdminNewBooking(data);
  const driverSafe = await sendBookingMail(data, "ADMIN_ASSISTED_COPY", getAdminEmail);
  return { adminFull, driverSafe };
}
export async function sendBookingConfirmationInvoice(data: BookingEmailData): Promise<EmailSendResult> {
  if (data.status !== "CONFIRMED" || !data.customerEmail) return { success: false, provider: "none", warning: "EMAIL_INELIGIBLE" };
  return sendBookingMail(data, "BOOKING_CONFIRMED", () => data.customerEmail);
}
export async function sendCustomerConfirmation(data: BookingEmailData) { return sendBookingConfirmationInvoice(data); }
export async function sendBookingCompletionEmails(data: BookingEmailData) {
  if (data.status !== "CONFIRMED") return { skipped: true, customer: { success: false, provider: "none" }, admin: { success: false, provider: "none" } };
  const customer = await sendBookingConfirmationInvoice(data);
  const admin = await notifyAdminNewBooking(data);
  return { customer, admin, skipped: false };
}
export async function sendNoDriverAdminEscalation(data: BookingEmailData) { return sendBookingMail(data, "ADMIN_NO_DRIVER", getAdminEmail); }
export async function sendPaymentReceipt(data: BookingEmailData & { amount: number; paymentId: string }) {
  if (!data.customerEmail) return { success: false, provider: "none", warning: "EMAIL_RECIPIENT_MISSING" };
  return sendTransactionalEmail({ type: "PAYMENT_RECEIPT", recipient: data.customerEmail, locale: emailLocale(data.languagePref), data: { bookingRef: data.bookingRef, amount: data.amount }, idempotencyKey: "PAYMENT_RECEIPT:" + data.paymentId, correlationId: data.bookingId || data.bookingRef });
}
export async function sendDispatchPaymentLinkEmail(input: { to: string; bookingRef: string; amount: string; url: string; expiresAt: Date; language?: string | null; paymentId: string }) {
  const request: TransactionalEmail = { type: "DISPATCH_PAYMENT_LINK", recipient: input.to, locale: emailLocale(input.language), data: { bookingRef: input.bookingRef, amount: input.amount, url: input.url, expiresAt: input.expiresAt.toISOString() }, idempotencyKey: "DISPATCH_PAYMENT_LINK:" + input.paymentId, correlationId: input.paymentId };
  // Preserve the operator's existing "emailed" result: queued is not delivered.
  const result = await sendTransactionalEmail(request, { synchronous: true });
  if (!result.success && result.retryable) await sendTransactionalEmail(request);
  return result;
}
export async function sendPassengerPasswordResetEmail(input: { to: string; resetToken: string; resetAttemptId: string; expiresAt: Date; sourceDomain?: string | null; language?: string | null }) {
  // Reset tokens remain only in the synchronous message, never in outbox/Redis.
  emailOrigin();
  return sendTransactionalEmail({ type: "PASSWORD_RESET", recipient: input.to, locale: emailLocale(input.language), data: { token: input.resetToken, attemptId: input.resetAttemptId, expiresAt: input.expiresAt.toISOString() }, idempotencyKey: "PASSWORD_RESET_EMAIL:" + input.resetAttemptId, correlationId: "password-reset" }, { synchronous: true });
}
