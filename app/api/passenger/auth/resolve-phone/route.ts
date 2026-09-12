import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isValidE164Phone, normalizePassengerPhone } from "@/lib/passenger-auth";
import { prisma } from "@/lib/prisma";
import { authRateLimitResponse, enforceAuthRateLimit, rateLimits, resolveClientIp } from "@/lib/rate-limit";
import { maskPhone } from "@/lib/utils";

const ResolvePhoneSchema = z.object({ phone: z.string().trim().min(6), bookingId: z.string().optional().nullable(), draftId: z.string().optional().nullable() });

async function handler(request: NextRequest) {
  try {
    const parsed = ResolvePhoneSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ success: false, error: "Invalid request" }, { status: 400 });
    const normalizedPhone = normalizePassengerPhone(parsed.data.phone);
    if (!isValidE164Phone(normalizedPhone)) return NextResponse.json({ success: false, error: "Invalid phone number" }, { status: 400 });
    const distributedLimit = await enforceAuthRateLimit({ domain: "phone-resolve", identities: [
      { dimension: "ip", value: resolveClientIp(request), max: rateLimits.passengerRegistrationPhoneCheck.max, windowMs: rateLimits.passengerRegistrationPhoneCheck.windowMs },
      { dimension: "phone", value: normalizedPhone, max: rateLimits.passengerRegistrationPhoneCheck.max, windowMs: rateLimits.passengerRegistrationPhoneCheck.windowMs },
    ] });
    if (!distributedLimit.allowed) return authRateLimitResponse(distributedLimit, "Too many phone checks. Please wait and try again.");
    if (parsed.data.bookingId) {
      const booking = await prisma.booking.findUnique({ where: { id: parsed.data.bookingId } });
      if (!booking) return NextResponse.json({ success: false, error: "Booking not found" }, { status: 404 });
      const bookingPhone = booking.normalizedPhone || normalizePassengerPhone(`${booking.customerPhoneCode}${booking.customerPhone}`, booking.customerPhoneCode);
      if (bookingPhone !== normalizedPhone) return NextResponse.json({ success: false, error: "Phone number does not match booking" }, { status: 400 });
    }
    const digits = normalizedPhone.replace(/\D/g, "");
    const candidates = await prisma.passenger.findMany({ where: { OR: [{ phone: normalizedPhone }, { normalizedPhone }, { phone: { contains: digits.slice(-7) } }, { normalizedPhone: { contains: digits.slice(-7) } }] }, select: { id: true, passwordHash: true, phone: true, normalizedPhone: true }, take: 25 });
    const passenger = candidates.find((candidate) => normalizePassengerPhone(candidate.normalizedPhone || candidate.phone) === normalizedPhone);
    const mode = !passenger ? "REGISTER" : passenger.passwordHash ? "LOGIN" : "LEGACY_SETUP";
    return NextResponse.json({ success: true, mode, normalizedPhone, maskedPhone: maskPhone(normalizedPhone) });
  } catch (error) {
    console.error("Passenger phone resolve error", { type: error instanceof Error ? error.name : "unknown" });
    return NextResponse.json({ success: false, error: "Could not check phone number. Please try again." }, { status: 500 });
  }
}
export const runtime = "nodejs";
export const POST = handler;
