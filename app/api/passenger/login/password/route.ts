import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import {
  createPassengerSession,
  normalizePassengerPhone,
  publicPassenger,
  setPassengerCookie,
} from "@/lib/passenger-auth";
import { prisma } from "@/lib/prisma";
import { rateLimits, withRateLimit } from "@/lib/rate-limit";

const PasswordLoginSchema = z.object({
  identifier: z.string().trim().min(3).max(160).optional(),
  phone: z.string().trim().min(6).optional(),
  password: z.string().min(1),
  bookingId: z.string().optional().nullable(),
}).refine((data) => Boolean(data.identifier || data.phone), { path: ["identifier"], message: "Phone number or email is required." });

async function handler(request: NextRequest) {
  try {
    const parsed = PasswordLoginSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const rawIdentifier = parsed.data.identifier || parsed.data.phone || "";
    const isEmail = rawIdentifier.includes("@");
    const normalizedEmail = isEmail ? rawIdentifier.toLowerCase() : "";
    const normalizedPhone = isEmail ? "" : normalizePassengerPhone(rawIdentifier);
    const passenger = await prisma.passenger.findFirst({
      where: isEmail
        ? { email: normalizedEmail }
        : { OR: [{ phone: normalizedPhone }, { normalizedPhone }] },
    });

    const genericError = { error: "Phone number, email, or password is incorrect." };
    if (!passenger?.passwordHash || passenger.status !== "ACTIVE") {
      return NextResponse.json(genericError, { status: 401 });
    }

    const validPassword = await bcrypt.compare(parsed.data.password, passenger.passwordHash);
    if (!validPassword) {
      return NextResponse.json(genericError, { status: 401 });
    }

    const updated = await prisma.passenger.update({
      where: { id: passenger.id },
      data: { lastLoginAt: new Date(), ...(normalizedPhone ? { normalizedPhone, phone: normalizedPhone } : {}) },
    });

    if (parsed.data.bookingId) {
      await prisma.booking.updateMany({
        where: { id: parsed.data.bookingId, ...(normalizedPhone ? { normalizedPhone } : {}) },
        data: {
          passengerId: passenger.id,
          passengerAuthStatus: "AUTHENTICATED",
          passengerAuthCompletedAt: new Date(),
          phoneVerified: true,
        },
      });
    }

    const token = await createPassengerSession(updated);
    const response = NextResponse.json({
      success: true,
      stepUpRequired: false,
      passenger: publicPassenger(updated),
    });
    setPassengerCookie(response, token);

    console.log(`Passenger login success: ${passenger.id}`);
    return response;
  } catch (error) {
    console.error("Passenger password login error:", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "Login failed." }, { status: 500 });
  }
}

export const POST = withRateLimit(handler, rateLimits.passengerLoginPassword);