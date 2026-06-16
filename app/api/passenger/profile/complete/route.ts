import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  createPassengerSession,
  getPassengerFromRequest,
  publicPassenger,
  setPassengerCookie,
  validatePassengerPassword,
} from "@/lib/passenger-auth";

const ProfileSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(160),
  password: z.string().min(1).max(128),
  bookingId: z.string().optional().nullable(),
});

export async function POST(request: NextRequest) {
  const passenger = await getPassengerFromRequest(request);

  if (!passenger) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = ProfileSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const email = parsed.data.email.toLowerCase();
  const passwordError = validatePassengerPassword(parsed.data.password);
  if (passwordError) {
    return NextResponse.json({ error: passwordError }, { status: 400 });
  }
  const existingEmail = await prisma.passenger.findFirst({
    where: {
      email,
      id: { not: passenger.id },
    },
  });

  if (existingEmail) {
    return NextResponse.json({ error: "Email is already used" }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  const updated = await prisma.passenger.update({
    where: { id: passenger.id },
    data: {
      fullName: parsed.data.fullName,
      email,
      passwordHash,
      profileCompleted: true,
    },
  });

  if (parsed.data.bookingId) {
    await prisma.booking.updateMany({
      where: { id: parsed.data.bookingId, passengerId: null },
      data: { passengerId: passenger.id },
    });
  }

  const token = await createPassengerSession(updated);
  const response = NextResponse.json({
    success: true,
    passenger: publicPassenger(updated),
  });
  setPassengerCookie(response, token);

  return response;
}
