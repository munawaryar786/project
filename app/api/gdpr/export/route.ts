import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * GDPR Data Export Endpoint
 * Allows users to request a copy of all their personal data
 * POST /api/gdpr/export
 * Body: { email: string } or { phone: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, phone } = body;

    if (!email && !phone) {
      return NextResponse.json(
        { error: 'Please provide either email or phone number to identify your account.' },
        { status: 400 }
      );
    }

    // Build query filter
    const filter: any = {};
    if (email) filter.customerEmail = email;
    if (phone) filter.customerPhone = phone;

    // Fetch all user data
    const bookings = await prisma.booking.findMany({
      where: filter,
      include: {
        otps: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Contact messages
    const contactMessages = await prisma.contactMessage.findMany({
      where: { email: email || undefined },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Rental inquiries
    const rentalInquiries = await prisma.rentalInquiry.findMany({
      where: { phone: phone || undefined },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Compile data export
    const exportData = {
      exportDate: new Date().toISOString(),
      requestedBy: { email, phone },
      bookings: bookings.map((b: any) => ({
        bookingRef: b.bookingRef,
        serviceType: b.serviceType,
        pickupAddress: b.pickupAddress,
        dropoffAddress: b.dropoffAddress,
        scheduledDate: b.scheduledDate,
        scheduledTime: b.scheduledTime,
        passengerCount: b.passengerCount,
        luggageType: b.luggageType,
        wheelchairNeeded: b.wheelchairNeeded,
        flightNumber: b.flightNumber,
        airline: b.airline,
        waitAndGreet: b.waitAndGreet,
        customerName: b.customerName,
        customerEmail: b.customerEmail,
        customerPhone: b.customerPhone,
        languagePref: b.languagePref,
        specialNotes: b.specialNotes,
        paymentMethod: b.paymentMethod,
        status: b.status,
        createdAt: b.createdAt,
        updatedAt: b.updatedAt,
      })),
      contactMessages,
      rentalInquiries,
      totalRecords: {
        bookings: bookings.length,
        contactMessages: contactMessages.length,
        rentalInquiries: rentalInquiries.length,
      },
    };

    return NextResponse.json({
      success: true,
      message: 'Data export generated successfully.',
      data: exportData,
    });
  } catch (error) {
    console.error('Data export error:', error);
    return NextResponse.json(
      { error: 'Failed to generate data export. Please try again.' },
      { status: 500 }
    );
  }
}
