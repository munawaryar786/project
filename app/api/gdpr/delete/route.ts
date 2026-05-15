import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * GDPR Data Deletion Endpoint
 * Allows users to request deletion of all their personal data
 * POST /api/gdpr/delete
 * Body: { email: string, phone: string, confirmation: boolean }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, phone, confirmation } = body;

    if (!email && !phone) {
      return NextResponse.json(
        { error: 'Please provide either email or phone number to identify your account.' },
        { status: 400 }
      );
    }

    if (!confirmation) {
      return NextResponse.json(
        { error: 'You must confirm that you want to delete all your personal data.' },
        { status: 400 }
      );
    }

    // Build query filter
    const filter: any = {};
    if (email) filter.customerEmail = email;
    if (phone) filter.customerPhone = phone;

    // Find all bookings
    const bookings = await prisma.booking.findMany({
      where: filter,
      include: {
        otps: true,
      },
    });

    // Delete OTPs first (foreign key constraint)
    for (const booking of bookings) {
      await prisma.oTP.deleteMany({
        where: { bookingId: booking.id },
      });
    }

    // Delete bookings
    const deleteBookingsResult = await prisma.booking.deleteMany({
      where: filter,
    });

    // Delete contact messages
    const deleteContactResult = await prisma.contactMessage.deleteMany({
      where: { email: email || undefined },
    });

    // Delete rental inquiries
    const deleteInquiriesResult = await prisma.rentalInquiry.deleteMany({
      where: { phone: phone || undefined },
    });

    // Log deletion for compliance
    console.log(`[GDPR Deletion] ${new Date().toISOString()} - Email: ${email}, Phone: ${phone}`, {
      bookingsDeleted: deleteBookingsResult.count,
      contactMessagesDeleted: deleteContactResult.count,
      inquiriesDeleted: deleteInquiriesResult.count,
    });

    return NextResponse.json({
      success: true,
      message: 'All your personal data has been permanently deleted.',
      deleted: {
        bookings: deleteBookingsResult.count,
        contactMessages: deleteContactResult.count,
        rentalInquiries: deleteInquiriesResult.count,
      },
    });
  } catch (error) {
    console.error('Data deletion error:', error);
    return NextResponse.json(
      { error: 'Failed to delete your data. Please contact info@drivo.sk for assistance.' },
      { status: 500 }
    );
  }
}
