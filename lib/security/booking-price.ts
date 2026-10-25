import { createHmac, timingSafeEqual } from "crypto";
import { getServerEnvironment } from "@/lib/env";

// Persist provenance in the existing fare JSON. Historical browser quotes have
// no valid MAC and must be reviewed before accepting payment; never bless them.
export function signBookingPrice(bookingRef: string, amount: number) {
  return createHmac("sha256", getServerEnvironment().csrfHmacSecret)
    .update(JSON.stringify(["drivo-price-v1", bookingRef, amount, "EUR"]))
    .digest("hex");
}

export function hasAuthoritativeBookingPrice(booking: {
  bookingRef: string; estimatedPrice: number | null; fareBreakdown: unknown;
}) {
  const amount = booking.estimatedPrice;
  if (amount === null || !Number.isFinite(amount) || amount <= 0) return false;
  const fare = booking.fareBreakdown;
  if (!fare || typeof fare !== "object" || !("serverPriceMac" in fare) ||
      typeof fare.serverPriceMac !== "string" || !/^[a-f0-9]{64}$/.test(fare.serverPriceMac)) return false;
  return timingSafeEqual(Buffer.from(fare.serverPriceMac, "hex"),
    Buffer.from(signBookingPrice(booking.bookingRef, amount), "hex"));
}
