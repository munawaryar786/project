import { z } from "zod";
import type { TransactionalEmail } from "./types";
import { EmailError } from "./config";

const text = z.string().max(2000);
const booking = z.object({ bookingRef: z.string().max(100), pickupAt: z.string().datetime(), marketTimezone: z.string().max(100), pickupAddress: text, destination: text, serviceType: z.string().max(60), amount: z.number().finite().nullable().optional(), paymentMethod: z.string().max(30).optional() });
const assignment = booking.extend({ driverName: z.string().max(200), vehicle: z.string().max(200).optional(), registration: z.string().max(80).optional() });
const registry = {
  BOOKING_RECEIVED: booking, BOOKING_CONFIRMED: booking, ADMIN_BOOKING_CREATED: booking, ADMIN_ASSISTED_COPY: booking,
  DRIVER_CONFIRMED: assignment, ADMIN_DRIVER_CONFIRMED: assignment, ADMIN_NO_DRIVER: booking,
  PAYMENT_RECEIPT: z.object({ bookingRef: z.string().max(100), amount: z.number().finite().nonnegative() }),
  DISPATCH_PAYMENT_LINK: z.object({ bookingRef: z.string().max(100), amount: z.string().max(100), url: z.string().url().max(4096), expiresAt: z.string().datetime() }),
  PASSWORD_RESET: z.object({ token: z.string().min(1).max(512), attemptId: z.string().min(1).max(100), expiresAt: z.string().datetime() }),
};
const envelope = z.object({ recipient: z.string().max(254), locale: z.enum(["en", "sk", "de", "uk"]), idempotencyKey: z.string().min(1).max(250).regex(/^[A-Za-z0-9_:.\-]+$/), correlationId: z.string().max(150).regex(/^[A-Za-z0-9_:.\-]+$/), assignment: z.object({ bookingId: z.string().regex(/^[a-f0-9]{24}$/i), driverId: z.string().regex(/^[a-f0-9]{24}$/i), assignedAtMs: z.number().finite().nonnegative() }).optional() });

export function validateTransactionalEmail(value: unknown): TransactionalEmail {
  if (!value || typeof value !== "object" || !("type" in value) || typeof value.type !== "string" || !Object.hasOwn(registry, value.type)) throw new EmailError("EMAIL_TYPE_INVALID");
  const type = value.type as keyof typeof registry;
  const result = envelope.extend({ type: z.literal(type), data: registry[type] }).safeParse(value);
  if (!result.success) throw new EmailError("EMAIL_DATA_INVALID");
  // Zod strips unlisted fields, including private Prisma fields and caller metadata.
  return result.data as TransactionalEmail;
}
