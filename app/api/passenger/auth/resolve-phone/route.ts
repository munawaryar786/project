import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { normalizePassengerPhone } from "@/lib/passenger-auth";
import { prisma } from "@/lib/prisma";
import { rateLimits, withRateLimit } from "@/lib/rate-limit";
import { maskPhone } from "@/lib/utils";

const ResolvePhoneSchema = z.object({
  phone: z.string().trim().min(6),
  bookingId: z.string().optional().nullable(),
  draftId: z.string().optional().nullable(),
});

async function handler(request: NextRequest) {
  try {
    const parsed = ResolvePhoneSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Invalid request", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const normalizedPhone = normalizePassengerPhone(parsed.data.phone);
    if (!normalizedPhone || normalizedPhone.length < 7) {
      return NextResponse.json({ success: false, error: "Invalid phone number" }, { status: 400 });
    }

    if (parsed.data.bookingId) {
      const booking = await prisma.booking.findUnique({ where: { id: parsed.data.bookingId } });
      if (!booking) {
        return NextResponse.json({ success: false, error: "Booking not found" }, { status: 404 });
      }

      const bookingPhone =
        booking.normalizedPhone ||
        normalizePassengerPhone(`${booking.customerPhoneCode}${booking.customerPhone}`);
      if (bookingPhone !== normalizedPhone) {
        return NextResponse.json(
          { success: false, error: "Phone number does not match booking" },
          { status: 400 }
        );
      }
    }

    const passenger = await prisma.passenger.findFirst({
      where: { OR: [{ phone: normalizedPhone }, { normalizedPhone }] },
      select: { id: true, passwordHash: true },
    });

    const mode = !passenger ? "REGISTER" : passenger.passwordHash ? "LOGIN" : "LEGACY_SETUP";

    return NextResponse.json({
      success: true,
      mode,
      normalizedPhone,
      maskedPhone: maskPhone(normalizedPhone),
    });
  } catch (error) {
    console.error("Passenger phone resolve error:", error);
    return NextResponse.json(
      { success: false, error: "Could not check phone number. Please try again." },
      { status: 500 }
    );
  }
}

export const POST = withRateLimit(handler, rateLimits.passengerRegistrationPhoneCheck);
