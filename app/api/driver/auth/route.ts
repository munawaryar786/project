import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createCanonicalToken, setSessionCookies } from "@/lib/security/session";
import { rateLimits, withRateLimit } from "@/lib/rate-limit";

const LoginSchema = z.object({
  phone: z.string().trim().min(3).max(40),
  password: z.string().min(1).max(128),
}).strict();

async function login(request: NextRequest) {
  try {
    const parsed = LoginSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const driver = await prisma.driver.findUnique({
      where: { phone: parsed.data.phone },
      include: { vehicle: true },
    });
    const validPassword = Boolean(
      driver?.passwordHash &&
      await bcrypt.compare(parsed.data.password, driver.passwordHash)
    );
    if (!driver || !validPassword || driver.status !== "ACTIVE") {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const session = await createCanonicalToken({
      sub: driver.id,
      actor: "DRIVER",
      role: "DRIVER",
      ver: driver.authVersion ?? 0,
    });
    const response = NextResponse.json({
      success: true,
      driver: {
        id: driver.id,
        fullName: driver.fullName,
        phone: driver.phone,
        vehicleType: driver.vehicleType,
        vehiclePlate: driver.vehiclePlate,
        vehicle: driver.vehicle,
        isOnline: driver.isOnline,
      },
    });
    setSessionCookies(response, "DRIVER", session);
    return response;
  } catch {
    return NextResponse.json({ error: "Authentication failed" }, { status: 500 });
  }
}

export const POST = withRateLimit(login, {
  ...rateLimits.auth,
  scope: "driver_login",
});
