import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authorizeDispatchOperator } from "@/lib/security/authorization";
import { isCustomerServiceEnabled } from "@/lib/feature-flags";
import { calculateAuthoritativeBookingQuote } from "@/lib/booking-quote";
import { parseMarketDateTime, SCHEDULED_MARKET_CONFIG } from "@/lib/scheduled-marketplace";

const QuoteSchema = z.object({
  pickupAddress: z.string().trim().min(3).max(300), dropoffAddress: z.string().trim().min(3).max(300),
  serviceType: z.enum(["STANDARD", "ACCESSIBLE", "SENIOR", "CHILDREN", "AIRPORT"]),
  scheduledDate: z.string().min(1), scheduledTime: z.string().min(1),
  waitingDuration: z.enum(["30_MINUTES", "1_HOUR", "2_HOURS", "3_HOURS", "4_HOURS", "CUSTOM"]).nullable().optional(),
  customWaitingDuration: z.string().max(80).nullable().optional(), assistanceLevel: z.enum(["LIGHT", "DOOR_TO_DOOR", "BOARDING_HELP"]).nullable().optional(),
  waitAndGreet: z.boolean().default(false), recurrenceType: z.string().nullable().optional(), recurrenceCustom: z.string().nullable().optional(),
  returnDate: z.string().nullable().optional(), returnTime: z.string().nullable().optional(),
}).strict();

export async function POST(request: NextRequest) {
  const auth = await authorizeDispatchOperator(request); if (!auth.ok) return auth.response;
  const parsed = QuoteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid quote request", details: parsed.error.flatten().fieldErrors }, { status: 400 });
  const data = parsed.data;
  if (!isCustomerServiceEnabled(data.serviceType)) return NextResponse.json({ error: "Children Transport is temporarily unavailable for new bookings." }, { status: 409 });
  const pickupAt = parseMarketDateTime(data.scheduledDate, data.scheduledTime, SCHEDULED_MARKET_CONFIG.timezone);
  if (!pickupAt) return NextResponse.json({ error: "Invalid scheduled pickup date/time", code: "INVALID_SCHEDULE_TIME" }, { status: 400 });
  const waitingMinutes = data.waitingDuration === "30_MINUTES" ? 30 : data.waitingDuration === "1_HOUR" ? 60 : data.waitingDuration === "2_HOURS" ? 120 : data.waitingDuration === "3_HOURS" ? 180 : data.waitingDuration === "4_HOURS" ? 240 : data.waitingDuration === "CUSTOM" ? Number(data.customWaitingDuration?.match(/\d+/)?.[0] || 0) : 0;
  try {
    const quote = await calculateAuthoritativeBookingQuote({ ...data, waitingMinutes });
    return NextResponse.json({ success: true, quote: { distanceKm: quote.distance.distanceKm, durationMinutes: quote.distance.durationMinutes, breakdown: quote.breakdown, totalFare: quote.breakdown.totalFare, currency: quote.currency } });
  } catch {
    return NextResponse.json({ error: "Could not calculate authoritative fare" }, { status: 503 });
  }
}
