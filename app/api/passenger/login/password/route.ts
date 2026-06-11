import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  createPassengerSession,
  publicPassenger,
  setPassengerCookie,
} from "@/lib/passenger-auth";

const PasswordLoginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

export async function POST(request: NextRequest) {
  const body = await request.json();
  const parsed = PasswordLoginSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const passenger = await prisma.passenger.findFirst({
    where: { email: parsed.data.email.toLowerCase() },
  });

  if (!passenger?.passwordHash) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const validPassword = await bcrypt.compare(parsed.data.password, passenger.passwordHash);
  if (!validPassword) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const token = await createPassengerSession(passenger);
  const response = NextResponse.json({
    success: true,
    passenger: publicPassenger(passenger),
  });
  setPassengerCookie(response, token);

  return response;
}
