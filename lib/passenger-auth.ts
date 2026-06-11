import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createToken, verifyToken } from "@/lib/auth";

export const PASSENGER_COOKIE = "drivo_passenger_token";

type PassengerTokenPayload = {
  id?: string;
  phone?: string;
  type?: string;
};

export async function createPassengerSession(passenger: {
  id: string;
  phone: string;
  email?: string | null;
}) {
  return createToken({
    id: passenger.id,
    phone: passenger.phone,
    email: passenger.email || undefined,
    type: "PASSENGER",
  });
}

export function setPassengerCookie(response: NextResponse, token: string) {
  response.cookies.set({
    name: PASSENGER_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function getPassengerFromRequest(request: NextRequest) {
  const token = request.cookies.get(PASSENGER_COOKIE)?.value;
  if (!token) return null;

  const payload = (await verifyToken(token)) as PassengerTokenPayload | null;
  if (!payload?.id || payload.type !== "PASSENGER") return null;

  return prisma.passenger.findUnique({
    where: { id: payload.id },
  });
}

export function publicPassenger(passenger: {
  id: string;
  phone: string;
  phoneVerified: boolean;
  fullName?: string | null;
  email?: string | null;
  profileCompleted: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}) {
  return {
    id: passenger.id,
    phone: passenger.phone,
    phoneVerified: passenger.phoneVerified,
    fullName: passenger.fullName || "",
    email: passenger.email || "",
    profileCompleted: passenger.profileCompleted,
    createdAt: passenger.createdAt,
    updatedAt: passenger.updatedAt,
  };
}
