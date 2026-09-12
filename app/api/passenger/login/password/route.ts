import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { createPassengerSession, isValidE164Phone, normalizePassengerEmail, normalizePassengerPhone, publicPassenger, setPassengerCookie } from "@/lib/passenger-auth";
import { prisma } from "@/lib/prisma";
import { rateLimits, withRateLimit } from "@/lib/rate-limit";

const PasswordLoginSchema = z.object({
  identifier: z.string().trim().min(3).max(160).optional(),
  phone: z.string().trim().min(6).optional(),
  password: z.string().min(1).max(128),
  bookingId: z.string().optional().nullable(),
}).refine((data) => Boolean(data.identifier || data.phone), { path: ["identifier"], message: "Phone number or email is required." });

const genericError = { error: "Phone number, email, or password is incorrect." };

async function findPassenger(identifier: string) {
  if (identifier.includes("@")) {
    const email = normalizePassengerEmail(identifier);
    return prisma.passenger.findFirst({ where: { email: { equals: email, mode: "insensitive" } } });
  }
  const normalizedPhone = normalizePassengerPhone(identifier);
  if (!isValidE164Phone(normalizedPhone)) return null;
  const direct = await prisma.passenger.findFirst({ where: { OR: [{ phone: normalizedPhone }, { normalizedPhone }] } });
  if (direct && normalizePassengerPhone(direct.normalizedPhone || direct.phone) === normalizedPhone) return direct;
  const digits = normalizedPhone.replace(/\D/g, "");
  const candidates = await prisma.passenger.findMany({
    where: { OR: [{ phone: { contains: digits.slice(-7) } }, { normalizedPhone: { contains: digits.slice(-7) } }] },
    take: 25,
  });
  return candidates.find((candidate) => normalizePassengerPhone(candidate.normalizedPhone || candidate.phone) === normalizedPhone) || null;
}

async function handler(request: NextRequest) {
  try {
    const parsed = PasswordLoginSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json(genericError, { status: 401 });
    const rawIdentifier = (parsed.data.identifier || parsed.data.phone || "").trim();
    const normalizedPhone = rawIdentifier.includes("@") ? "" : normalizePassengerPhone(rawIdentifier);
    const passenger = await findPassenger(rawIdentifier);
    if (!passenger?.passwordHash || passenger.status !== "ACTIVE") return NextResponse.json(genericError, { status: 401 });
    if (!(await bcrypt.compare(parsed.data.password, passenger.passwordHash))) return NextResponse.json(genericError, { status: 401 });

    const updated = await prisma.passenger.update({ where: { id: passenger.id }, data: { lastLoginAt: new Date(), ...(normalizedPhone ? { normalizedPhone, phone: normalizedPhone } : {}) } });
    if (parsed.data.bookingId) await prisma.booking.updateMany({ where: { id: parsed.data.bookingId, ...(normalizedPhone ? { normalizedPhone } : {}) }, data: { passengerId: passenger.id, passengerAuthStatus: "AUTHENTICATED", passengerAuthCompletedAt: new Date(), phoneVerified: true } });
    const token = await createPassengerSession(updated);
    const response = NextResponse.json({ success: true, stepUpRequired: false, passenger: publicPassenger(updated) });
    setPassengerCookie(response, token);
    console.info("Passenger password login succeeded", { passengerIdPresent: Boolean(passenger.id) });
    return response;
  } catch (error) {
    console.error("Passenger password login error", { type: error instanceof Error ? error.name : "unknown" });
    return NextResponse.json({ error: "Login failed." }, { status: 500 });
  }
}

export const POST = withRateLimit(handler, rateLimits.passengerLoginPassword);
