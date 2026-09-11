import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authorizePassenger, clearPassengerCookies } from "@/lib/passenger-auth";

const DeleteSchema = z.object({ confirmation: z.literal(true) }).strict();

export async function POST(request: NextRequest) {
  const auth = await authorizePassenger(request);
  if (!auth.ok) return auth.response;

  const parsed = DeleteSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Deletion confirmation is required" }, { status: 400 });
  }

  try {
    const passenger = auth.actor;
    const bookings = await prisma.booking.findMany({
      where: { passengerId: passenger.id },
      select: { id: true },
    });
    const bookingIds = bookings.map((booking) => booking.id);
    const phones = [passenger.phone, passenger.normalizedPhone].filter(Boolean) as string[];

    const [deletedOtps, deletedBookings, deletedContacts, deletedInquiries] =
      await prisma.$transaction([
        prisma.oTP.deleteMany({ where: { bookingId: { in: bookingIds } } }),
        prisma.booking.deleteMany({ where: { passengerId: passenger.id } }),
        // Never delete someone else's contacts using an unverified profile email.
        prisma.contactMessage.deleteMany({ where: { id: { in: [] } } }),
        prisma.rentalInquiry.deleteMany({ where: { phone: { in: phones } } }),
      ]);

    await prisma.passengerSession.updateMany({
      where: { passengerId: passenger.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    const response = NextResponse.json({
      success: true,
      deleted: {
        bookings: deletedBookings.count,
        bookingOtps: deletedOtps.count,
        contactMessages: deletedContacts.count,
        rentalInquiries: deletedInquiries.count,
      },
    });
    clearPassengerCookies(response);
    return response;
  } catch {
    return NextResponse.json({ error: "Failed to delete your data" }, { status: 500 });
  }
}
