import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizePassenger } from "@/lib/passenger-auth";

export async function POST(request: NextRequest) {
  const auth = await authorizePassenger(request);
  if (!auth.ok) return auth.response;

  try {
    const passenger = auth.actor;
    const phones = [passenger.phone, passenger.normalizedPhone].filter(Boolean) as string[];
    const [bookings, contactMessages, rentalInquiries] = await Promise.all([
      prisma.booking.findMany({
        where: { passengerId: passenger.id },
        orderBy: { createdAt: "desc" },
      }),
      // Profile email is editable and unverified; it cannot establish ownership.
      Promise.resolve([]),
      prisma.rentalInquiry.findMany({
        where: { phone: { in: phones } },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        exportDate: new Date().toISOString(),
        passenger: {
          fullName: passenger.fullName,
          email: passenger.email,
          phone: passenger.phone,
          profileCompleted: passenger.profileCompleted,
          createdAt: passenger.createdAt,
          updatedAt: passenger.updatedAt,
        },
        bookings,
        contactMessages,
        rentalInquiries,
      },
    });
  } catch {
    return NextResponse.json({ error: "Failed to generate data export" }, { status: 500 });
  }
}
